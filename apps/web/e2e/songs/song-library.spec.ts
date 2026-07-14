import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { type APIRequestContext, expect, test } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUDIO_FIXTURE_PATH = path.join(__dirname, "../fixtures/test-audio.wav")
const SEARCH_PLACEHOLDER = "Search songs by title or artist..."

// SongRow (SongList.tsx) is the only tabIndex=0 element on this page - a
// stable way to select "a whole song row" without a dedicated test id.
const songRow = (page: import("@playwright/test").Page) => page.locator('div[tabindex="0"]')

interface CreatedSong {
  id: string
  title: string
}

async function createSongViaApi(request: APIRequestContext, title: string): Promise<CreatedSong> {
  const response = await request.post("/api/songs", {
    multipart: {
      title,
      file: {
        name: "test-audio.wav",
        mimeType: "audio/wav",
        buffer: fs.readFileSync(AUDIO_FIXTURE_PATH),
      },
    },
  })
  expect(response.ok(), `failed to create fixture song (${response.status()})`).toBeTruthy()
  const body = await response.json()
  return { id: body.id, title: body.title }
}

async function deleteSongViaApi(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/songs/${id}`)
}

// Both describe blocks below mutate the same shared local dev songs table
// (creating/deleting real rows) and exercise the same global player state -
// a per-describe `mode: "serial"` still lets Playwright schedule the two
// blocks onto separate workers running concurrently with each other.
// Configuring serial mode here, at the file's top level, forces every test
// in this file onto one worker in declared order instead.
test.describe.configure({ mode: "serial" })

test.describe("song library page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/songs")
  })

  test("renders the page chrome and at least one song", async ({ page }) => {
    // PageTitle (@workspace/ui/components/Page) renders a plain <div>, not
    // a heading element, and "Song Library" also appears in the sidebar nav
    // and breadcrumb - PageTitle's own class combo disambiguates it.
    await expect(page.locator("div.text-xl.font-medium", { hasText: "Song Library" })).toBeVisible()
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible()
    await expect(page.getByRole("button", { name: "Upload a song" })).toBeVisible()
    await expect(songRow(page).first()).toBeVisible()
  })

  test("shows an empty-library message when there are no songs", async () => {
    // SongList.tsx:328-330 renders "No songs uploaded yet." when the list
    // is empty, but wiping the shared local dev DB to exercise that isn't
    // safe to automate here - flagged rather than silently skipped.
    test.skip(true, "requires an empty songs table - not safe against shared local dev data")
  })

  test("highlights a row as active by default", async ({ page }) => {
    // SongList.tsx defaults `displayActiveId` to the first song before any
    // row has been clicked - whichever song that is, its row should carry
    // the active highlight.
    await expect(songRow(page).first()).toHaveClass(/bg-muted\/30/)
  })

  // Selecting a row (SongPlayerProvider.tsx's selectSong) awaits a real GET
  // .../stream-url request before the active class updates, so these tests
  // wait for that specific response rather than guessing a timeout for the
  // class change alone. Only resolves the song id here - the caller must
  // create the page.waitForResponse promise itself, not from inside an
  // awaited async helper: `await anAsyncFn()` where anAsyncFn internally
  // does `return page.waitForResponse(...)` doesn't hand back a pending
  // promise to await later - `await` transparently unwraps that inner
  // promise too, blocking until the response arrives *before* the caller
  // gets a chance to trigger the click that would ever produce it.
  async function getSongIdFromRow(row: ReturnType<typeof songRow>): Promise<string | undefined> {
    const href = await row.getByRole("link").getAttribute("href")
    return href?.split("/").pop()
  }

  test("clicking a row (not its play button) selects it as active", async ({ page }) => {
    const rows = songRow(page)
    // SongList.tsx:259-264 auto-selects the first row on mount - wait for
    // it to settle first, or it can race and stomp the second row's
    // selection right after this test makes it.
    await expect(rows.first()).toHaveClass(/bg-muted\/30/, { timeout: 20_000 })
    test.skip((await rows.count()) < 2, "need a second row to prove selection actually moved")

    // SongRow's onClick is on the row container itself (SongList.tsx) -
    // click the artist line specifically to avoid the title <Link> (which
    // would navigate away) and the play button/dropdown (which stop
    // propagation on purpose).
    const second = rows.nth(1)
    const songId = await getSongIdFromRow(second)
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes(`/api/songs/${songId}/stream-url`),
      {
        timeout: 20_000,
      }
    )
    await second.locator("p.text-muted-foreground").click()
    await responsePromise
    await expect(second).toHaveClass(/bg-muted\/30/)
  })

  test("selecting a row via keyboard (Enter) marks it active", async ({ page }) => {
    // Same onSelect handler as the mouse-click test above, reached through
    // SongRow's onKeyDown instead (SongList.tsx:85-90) - Space uses the
    // identical branch, so this covers both keys.
    const rows = songRow(page)
    await expect(rows.first()).toHaveClass(/bg-muted\/30/, { timeout: 20_000 })
    test.skip((await rows.count()) < 2, "need a second row to prove selection actually moved")

    const second = rows.nth(1)
    await second.focus()
    const songId = await getSongIdFromRow(second)
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes(`/api/songs/${songId}/stream-url`),
      {
        timeout: 20_000,
      }
    )
    await page.keyboard.press("Enter")
    await responsePromise
    await expect(second).toHaveClass(/bg-muted\/30/)
  })

  test("dropdown menu shows the expected actions for an admin", async ({ page }) => {
    const firstRow = songRow(page).first()
    await firstRow.getByRole("button", { name: "More options" }).click()

    await expect(page.getByRole("menuitem", { name: "View Details" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Add to line up" })).toBeDisabled()
    await expect(page.getByRole("menuitem", { name: "Download" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible()
  })

  test("downloading a song triggers a real file download", async ({ page }) => {
    const firstRow = songRow(page).first()
    await firstRow.getByRole("button", { name: "More options" }).click()

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download" }).click(),
    ])
    expect(download.suggestedFilename()).toBeTruthy()
  })

  test("search shows a prompt before typing anything", async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).click()
    await expect(page.getByText("Start typing to search.")).toBeVisible()
  })

  test("search shows a no-results state for a nonsense query", async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill("zzqxvnotarealsongtitle123")
    await expect(page.getByText("No songs found.")).toBeVisible()
  })

  test("infinite scroll loads more songs when the sentinel comes into view", async ({ page }) => {
    const rows = songRow(page)
    // Wait for the initial page to actually render - "Loading songs..."
    // (SongList.tsx:324-326) has no rows, and counting during that window
    // would misreport initialCount as 0 and skip the test unconditionally.
    await expect(rows.first()).toBeVisible()
    const initialCount = await rows.count()

    // DEFAULT_SONGS_LIMIT (apps/api/src/services/songs.ts) is 10 per page -
    // fewer rows than that means there's nothing to paginate into.
    test.skip(initialCount < 10, "fewer than one full page of songs exist - pagination isn't exercised")

    await rows.last().scrollIntoViewIfNeeded()

    await expect.poll(() => rows.count(), { timeout: 5_000 }).toBeGreaterThan(initialCount)
  })

  test("upload form blocks submission and shows an error when the title is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Upload a song" }).click()
    const uploadDialog = page.getByRole("dialog").filter({ hasText: "Upload a song" })
    await uploadDialog.locator("#file").setInputFiles(AUDIO_FIXTURE_PATH)
    await uploadDialog.getByRole("button", { name: "Upload song" }).click()

    // SongUploadFormSchema's zod validator - blocks the mutation entirely,
    // so no network request/toast happens, just the field-level error.
    await expect(uploadDialog.getByText("Title is required.")).toBeVisible()
    await expect(uploadDialog).toBeVisible()
  })

  test("upload form errors when no audio file is chosen", async ({ page }) => {
    await page.getByRole("button", { name: "Upload a song" }).click()
    const uploadDialog = page.getByRole("dialog").filter({ hasText: "Upload a song" })
    await uploadDialog.getByLabel("Title").fill(`E2E No File ${Date.now()}`)
    await uploadDialog.getByRole("button", { name: "Upload song" }).click()

    // Unlike title, the file isn't part of the zod schema (SongUploadForm.tsx
    // tracks it as separate useState) - this is a mutationFn-thrown error
    // surfaced via the mutation's onError toast, not a field-level one.
    await expect(page.getByText("Please choose an audio file.")).toBeVisible()
    await expect(uploadDialog).toBeVisible()
  })

  test("uploading a song via the form adds it (with optional fields), then deleting it via the UI removes it", async ({
    page,
  }) => {
    const title = `E2E Upload Test ${Date.now()}`

    await page.getByRole("button", { name: "Upload a song" }).click()
    const uploadDialog = page.getByRole("dialog").filter({ hasText: "Upload a song" })
    await uploadDialog.getByLabel("Title").fill(title)
    await uploadDialog.getByLabel("Key").fill("G")
    await uploadDialog.getByLabel("Tempo (BPM)").fill("120")
    await uploadDialog.locator("#file").setInputFiles(AUDIO_FIXTURE_PATH)
    await uploadDialog.getByRole("button", { name: "Upload song" }).click()

    await expect(page.getByText("Song uploaded.")).toBeVisible()
    await expect(uploadDialog).not.toBeVisible()

    // Confirm it actually landed in the library rather than trusting the
    // toast alone - search is the fastest way to find it regardless of
    // which page of the (now newest-first) list it sorts into.
    const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER)
    await searchInput.fill(title)
    await expect(page.getByRole("option", { name: title })).toBeVisible()
    await searchInput.fill("")
    await page.keyboard.press("Escape")

    await page.goto("/songs")
    const row = songRow(page).filter({ has: page.getByRole("link", { name: title, exact: true }) })
    await expect(row).toBeVisible()

    // SongList.tsx renders these badges only when musicalKey/tempo are set
    // - confirms the optional form fields actually round-tripped through
    // the upload, not just the required title.
    await expect(row.getByText("Key of G")).toBeVisible()
    await expect(row.getByText("120 BPM")).toBeVisible()

    // Cancelling the confirm dialog must not delete anything.
    await row.getByRole("button", { name: "More options" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    const confirmDialog = page.getByRole("alertdialog")
    await expect(confirmDialog.getByText(`Delete "${title}"?`)).toBeVisible()
    await confirmDialog.getByRole("button", { name: "Cancel" }).click()
    await expect(confirmDialog).not.toBeVisible()
    await expect(row).toBeVisible()

    // Confirming it does.
    await row.getByRole("button", { name: "More options" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()

    await expect(page.getByText("Song successfully deleted.")).toBeVisible()
    await expect(row).toHaveCount(0)
  })
})

// Uses one API-created song (bypassing the upload form, which is covered by
// the UI upload/delete test above) across several read-only interactions,
// to keep this independent of whatever real songs already exist locally.
test.describe("song library page - with a known fixture song", () => {
  // File-level serial mode (top of file) already covers ordering/isolation
  // between this block and the one above - beforeAll/afterAll below still
  // only need "run once for this block's tests", which serial mode gives.
  let fixtureSong: CreatedSong

  test.beforeAll(async ({ request }) => {
    fixtureSong = await createSongViaApi(request, `E2E Fixture Song ${Date.now()}`)
  })

  test.afterAll(async ({ request }) => {
    await deleteSongViaApi(request, fixtureSong.id)
  })

  test("search finds it by title", async ({ page }) => {
    await page.goto("/songs")
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(fixtureSong.title)
    await expect(page.getByRole("option", { name: fixtureSong.title })).toBeVisible()
  })

  test("clicking a search result navigates to the song's detail page", async ({ page }) => {
    // SongSearchCombobox.tsx's onValueChange - selecting a result does a
    // router.push to the song's own page, distinct from just finding it.
    await page.goto("/songs")
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(fixtureSong.title)
    await page.getByRole("option", { name: fixtureSong.title }).click()
    await expect(page).toHaveURL(`/songs/${fixtureSong.id}`)
  })

  test("view details shows its title", async ({ page }) => {
    await page.goto("/songs")
    const row = songRow(page).filter({
      has: page.getByRole("link", { name: fixtureSong.title, exact: true }),
    })
    await row.getByRole("button", { name: "More options" }).click()
    await page.getByRole("menuitem", { name: "View Details" }).click()

    const sheet = page.getByRole("dialog").filter({ hasText: "Song details" })
    await expect(sheet.getByText(fixtureSong.title)).toBeVisible()
  })

  test("closing the details sheet does not stop playback of the currently playing song", async ({ page }) => {
    // Regression guard: SongDetailsSheet.tsx's SheetContent used to lack
    // stopPropagation, so a click on its close button bubbled up to this
    // row's own onClick handler and paused the shared audio element via
    // selectSong() - see SongList.tsx's SongRow.
    await page.goto("/songs")
    const row = songRow(page).filter({
      has: page.getByRole("link", { name: fixtureSong.title, exact: true }),
    })

    await row.getByRole("button", { name: "Play" }).click()
    await expect(row.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10_000 })

    await row.getByRole("button", { name: "More options" }).click()
    await page.getByRole("menuitem", { name: "View Details" }).click()
    const sheet = page.getByRole("dialog").filter({ hasText: "Song details" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("button", { name: "Close" }).click()
    await expect(sheet).not.toBeVisible()

    await expect(row.getByRole("button", { name: "Pause" })).toBeVisible()
  })
})
