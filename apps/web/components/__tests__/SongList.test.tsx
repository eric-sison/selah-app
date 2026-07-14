import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SongList } from "@/components/SongList"
import { apiClient } from "@/lib/api-client"
import { useSession } from "@/components/SessionProvider"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { Song } from "@/components/NowPlayingCard"
import { createMockPlayerContextValue, createMockSession, createMockSong } from "../../test/fixtures"
import { renderWithProviders, screen, waitFor, within } from "../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("@/components/SongPlayerProvider", () => ({
  usePlayer: vi.fn(),
}))

// Also stands in for the real SessionProvider - this test file mocks the
// whole module, and renderWithProviders (test/render.tsx) resolves its own
// "@/components/SessionProvider" import against this same mocked module
// within this test file's module graph.
vi.mock("@/components/SessionProvider", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/components/SongDetailsSheet", () => ({
  SongDetailsSheet: ({ open, song }: { open: boolean; song: Song }) =>
    open ? <div data-testid="mock-details-sheet">{song.title}</div> : null,
}))

interface SongsPage {
  items: Song[]
  nextCursor: number | null
}

function mockPlayer(overrides: Parameters<typeof createMockPlayerContextValue>[0] = {}) {
  const value = createMockPlayerContextValue(overrides)
  vi.mocked(usePlayer).mockReturnValue(value)
  return value
}

function mockSession(overrides: Parameters<typeof createMockSession>[0] = {}) {
  const value = createMockSession(overrides)
  vi.mocked(useSession).mockReturnValue(value)
  return value
}

// Routes the single mocked apiClient.GET across the three GET endpoints
// SongList/SongRow call, keyed by URL template - `pages` is indexed by
// cursor (0, 1, 2, ...) to match useInfiniteQuery's pageParam.
function mockApiGet({
  pages = [],
  albumUrl = "https://example.com/album.png",
  downloadUrl = "https://example.com/download.mp3",
}: {
  pages?: SongsPage[]
  albumUrl?: string
  downloadUrl?: string
} = {}) {
  vi.mocked(apiClient.GET).mockImplementation(async (url: string, options?: unknown) => {
    if (url === "/api/songs") {
      const opts = options as { params: { query: { cursor: number } } }
      const cursor = opts.params.query.cursor
      const page = pages[cursor]
      if (!page) throw new Error(`No mock page for cursor ${cursor}`)
      return { data: page, error: undefined } as never
    }
    if (url === "/api/songs/{id}/album-url") {
      return { data: { url: albumUrl }, error: undefined } as never
    }
    if (url === "/api/songs/{id}/download-url") {
      return { data: { url: downloadUrl }, error: undefined } as never
    }
    throw new Error(`Unhandled GET ${url}`)
  })
}

describe("SongList", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows a loading state while the first page is in flight", () => {
    mockPlayer()
    mockSession()
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)

    renderWithProviders(<SongList />)

    expect(screen.getByText("Loading songs...")).toBeInTheDocument()
  })

  it("shows an empty state when the first page has no items", async () => {
    mockPlayer()
    mockSession()
    mockApiGet({ pages: [{ items: [], nextCursor: null }] })

    renderWithProviders(<SongList />)

    expect(await screen.findByText("No songs uploaded yet.")).toBeInTheDocument()
  })

  it("renders song rows with title, artist, and conditional key/tempo badges", async () => {
    mockPlayer()
    mockSession()
    const withBadges = createMockSong({
      id: "song-1",
      title: "Amazing Grace",
      artist: "Traditional",
      musicalKey: "G",
      tempo: 72,
    })
    const withoutBadges = createMockSong({
      id: "song-2",
      title: "How Great Thou Art",
      artist: null,
      musicalKey: null,
      tempo: null,
    })
    mockApiGet({ pages: [{ items: [withBadges, withoutBadges], nextCursor: null }] })

    renderWithProviders(<SongList />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
    expect(screen.getByText("Key of G")).toBeInTheDocument()
    expect(screen.getByText("72 BPM")).toBeInTheDocument()

    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    expect(screen.getByText("Unknown artist")).toBeInTheDocument()
    expect(screen.queryByText(/Key of/)).toEqual(screen.getByText("Key of G"))
    expect(screen.queryByText(/BPM/)).toEqual(screen.getByText("72 BPM"))
  })

  it("auto-selects the first song on mount exactly once, even across re-renders", async () => {
    const player = mockPlayer({ activeSongId: null })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    const song2 = createMockSong({ id: "song-2", title: "Second" })
    mockApiGet({ pages: [{ items: [song1, song2], nextCursor: null }] })

    const { rerender } = renderWithProviders(<SongList />)

    await screen.findByText("First")
    await waitFor(() => expect(player.selectSong).toHaveBeenCalledTimes(1))
    expect(player.selectSong).toHaveBeenCalledWith(song1, [song1, song2])

    rerender(<SongList />)

    expect(player.selectSong).toHaveBeenCalledTimes(1)
  })

  it("does not auto-select when a song is already active", async () => {
    const player = mockPlayer({ activeSongId: "song-2" })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    const song2 = createMockSong({ id: "song-2", title: "Second" })
    mockApiGet({ pages: [{ items: [song1, song2], nextCursor: null }] })

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    expect(player.selectSong).not.toHaveBeenCalled()
  })

  it("calls selectSong when a row is clicked", async () => {
    const player = mockPlayer({ activeSongId: "song-1" })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    const song2 = createMockSong({ id: "song-2", title: "Second" })
    mockApiGet({ pages: [{ items: [song1, song2], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("Second")
    await user.click(screen.getByText("Second"))

    expect(player.selectSong).toHaveBeenCalledWith(song2, [song1, song2])
  })

  it("calls playOrToggle from a row's play button without also triggering selectSong (stopPropagation)", async () => {
    const player = mockPlayer({ activeSongId: "song-1" })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "Play" }))

    expect(player.playOrToggle).toHaveBeenCalledWith(song1, [song1])
    expect(player.selectSong).not.toHaveBeenCalledWith(song1, [song1])
  })

  it("shows a Pause button and album art when the row's song is active and playing", async () => {
    mockPlayer({ activeSongId: "song-1", isPlaying: true })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First", hasAlbumArt: true })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }], albumUrl: "https://example.com/art.png" })

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    expect(await screen.findByRole("img", { name: "First album art" })).toHaveAttribute(
      "src",
      expect.stringContaining("art.png")
    )
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
  })

  it("shows a fallback icon and skips the album-url request when hasAlbumArt is false", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First", hasAlbumArt: false })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    expect(screen.queryByRole("img", { name: "First album art" })).not.toBeInTheDocument()
    expect(apiClient.GET).not.toHaveBeenCalledWith("/api/songs/{id}/album-url", expect.anything())
  })

  it("opens the mocked SongDetailsSheet with the right song when View Details is clicked", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /view details/i }))

    expect(await screen.findByTestId("mock-details-sheet")).toHaveTextContent("First")
  })

  it("renders 'Add to line up' as a disabled menu item", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))

    const addToLineUp = screen.getByRole("menuitem", { name: /add to line up/i })
    expect(addToLineUp).toHaveAttribute("data-disabled")
  })

  it("downloads a song via the Download menu item", async () => {
    mockPlayer()
    mockSession()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const song1 = createMockSong({ id: "song-1", title: "First", originalFileName: "first.mp3" })
    mockApiGet({
      pages: [{ items: [song1], nextCursor: null }],
      downloadUrl: "https://example.com/first.mp3",
    })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /download/i }))

    await waitFor(() => {
      expect(apiClient.GET).toHaveBeenCalledWith("/api/songs/{id}/download-url", {
        params: { path: { id: "song-1" } },
      })
    })
    expect(clickSpy).toHaveBeenCalled()
  })

  it("shows an error toast when the download request fails", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })
    vi.mocked(apiClient.GET).mockImplementation(async (url: string) => {
      if (url === "/api/songs")
        return { data: { items: [song1], nextCursor: null }, error: undefined } as never
      if (url === "/api/songs/{id}/download-url") return { data: undefined, error: {} } as never
      throw new Error(`Unhandled GET ${url}`)
    })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /download/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to download song.", { position: "top-center" })
    })
  })

  it("shows Delete for an admin session and hides it for a non-admin session", async () => {
    mockPlayer()
    mockSession({ role: "admin" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument()
  })

  it("hides Delete for a non-admin session", async () => {
    mockPlayer()
    mockSession({ role: "user" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("cancels the delete confirmation dialog without calling DELETE", async () => {
    mockPlayer()
    mockSession({ role: "admin" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))

    expect(await screen.findByText('Delete "First"?')).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByText('Delete "First"?')).not.toBeInTheDocument()
    expect(apiClient.DELETE).not.toHaveBeenCalled()
  })

  it("confirms deletion: calls DELETE, shows a success toast, and invalidates the songs query", async () => {
    mockPlayer()
    mockSession({ role: "admin" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: {}, error: undefined } as never)

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    await screen.findByText('Delete "First"?')

    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/songs/{id}", {
        params: { path: { id: "song-1" } },
      })
    })
    expect(toast.success).toHaveBeenCalledWith("Song successfully deleted.")
    await waitFor(() => {
      expect(screen.queryByText('Delete "First"?')).not.toBeInTheDocument()
    })
  })

  it("shows an error toast and keeps the row when deletion fails", async () => {
    mockPlayer()
    mockSession({ role: "admin" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: {} } as never)

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    await screen.findByText('Delete "First"?')

    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to delete song.", { position: "top-center" })
    })
    expect(screen.getByText("First")).toBeInTheDocument()
  })

  it("fetches and appends the next page when the sentinel intersects", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    const song2 = createMockSong({ id: "song-2", title: "Second" })
    mockApiGet({
      pages: [
        { items: [song1], nextCursor: 1 },
        { items: [song2], nextCursor: null },
      ],
    })

    // The global IntersectionObserver mock (test/setup.ts) is an inert
    // no-op - `observe` never actually fires. Spy on the constructor
    // locally (without touching setup.ts) to capture the callback SongList
    // registers, then invoke it by hand to simulate the sentinel scrolling
    // into view.
    const ioSpy = vi.spyOn(globalThis, "IntersectionObserver")

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    expect(screen.queryByText("Second")).not.toBeInTheDocument()

    // The effect's dependency array (hasNextPage, isFetchingNextPage,
    // fetchNextPage) means it can re-run and recreate the observer between
    // the initial mount and the first page settling - grab the most recent
    // registration rather than assuming the first one is still live.
    await waitFor(() => expect(ioSpy).toHaveBeenCalled())
    const lastCall = ioSpy.mock.calls[ioSpy.mock.calls.length - 1]
    const observerCallback = lastCall?.[0] as IntersectionObserverCallback
    observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)

    await waitFor(() => {
      expect(apiClient.GET).toHaveBeenCalledWith("/api/songs", { params: { query: { cursor: 1 } } })
    })
    expect(await screen.findByText("Second")).toBeInTheDocument()
  })

  it("does not fetch again when the sentinel intersects while already fetching, and shows a spinner while pending", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    const song2 = createMockSong({ id: "song-2", title: "Second" })

    let resolvePage1!: (value: { data: SongsPage; error: undefined }) => void
    const page1Promise = new Promise<{ data: SongsPage; error: undefined }>((resolve) => {
      resolvePage1 = resolve
    })
    vi.mocked(apiClient.GET).mockImplementation((url: string, options?: unknown) => {
      if (url === "/api/songs") {
        const cursor = (options as { params: { query: { cursor: number } } }).params.query.cursor
        if (cursor === 0) {
          return Promise.resolve({ data: { items: [song1], nextCursor: 1 }, error: undefined } as never)
        }
        if (cursor === 1) return page1Promise as never
      }
      throw new Error(`Unhandled GET ${url}`)
    })

    const ioSpy = vi.spyOn(globalThis, "IntersectionObserver")
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await waitFor(() => expect(ioSpy).toHaveBeenCalled())

    const firstObserverCount = ioSpy.mock.calls.length
    const firstCallback = ioSpy.mock.calls[firstObserverCount - 1]?.[0] as IntersectionObserverCallback
    firstCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)

    // fetchNextPage() is now in flight (isFetchingNextPage: true) - the
    // effect re-runs on that dependency change and registers a new
    // observer whose callback closure captures isFetchingNextPage as true.
    await waitFor(() => expect(ioSpy.mock.calls.length).toBeGreaterThan(firstObserverCount))
    expect(await screen.findByRole("status")).toBeInTheDocument()

    const pendingCallback = ioSpy.mock.calls[ioSpy.mock.calls.length - 1]?.[0] as IntersectionObserverCallback
    pendingCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)

    // Still only the one in-flight request for cursor 1 - the second
    // simulated intersection while isFetchingNextPage was true must not
    // have triggered a duplicate fetchNextPage() call.
    const getCalls = vi.mocked(apiClient.GET).mock.calls as Array<
      [string, { params: { query: { cursor: number } } }]
    >
    expect(
      getCalls.filter(([url, opts]) => url === "/api/songs" && opts.params.query.cursor === 1)
    ).toHaveLength(1)

    resolvePage1({ data: { items: [song2], nextCursor: null }, error: undefined })

    expect(await screen.findByText("Second")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument())
  })

  it("falls back to the empty state when the first page request errors", async () => {
    mockPlayer()
    mockSession()
    vi.mocked(apiClient.GET).mockResolvedValue({ data: undefined, error: {} } as never)

    renderWithProviders(<SongList />)

    expect(await screen.findByText("No songs uploaded yet.")).toBeInTheDocument()
  })

  it("shows a spinner in the play button while this row's audio is loading", async () => {
    mockPlayer({ isLoadingSongId: "song-1" })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    const playButton = screen.getByRole("button", { name: "Play" })
    expect(playButton).toBeDisabled()
    expect(within(playButton).getByRole("status")).toBeInTheDocument()
  })

  it("still shows the fallback icon when the album art request fails", async () => {
    mockPlayer()
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First", hasAlbumArt: true })
    vi.mocked(apiClient.GET).mockImplementation(async (url: string) => {
      if (url === "/api/songs") {
        return { data: { items: [song1], nextCursor: null }, error: undefined } as never
      }
      if (url === "/api/songs/{id}/album-url") {
        return { data: undefined, error: {} } as never
      }
      throw new Error(`Unhandled GET ${url}`)
    })

    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await waitFor(() => {
      expect(apiClient.GET).toHaveBeenCalledWith("/api/songs/{id}/album-url", {
        params: { path: { id: "song-1" } },
      })
    })
    expect(screen.queryByRole("img", { name: "First album art" })).not.toBeInTheDocument()
  })

  it("selects the row via keyboard (Enter and Space), and ignores other keys", async () => {
    const player = mockPlayer({ activeSongId: "song-1" })
    mockSession()
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    const row = (await screen.findByText("First")).closest('[tabindex="0"]') as HTMLElement
    row.focus()

    await user.keyboard("a")
    expect(player.selectSong).not.toHaveBeenCalled()

    await user.keyboard("{Enter}")
    expect(player.selectSong).toHaveBeenCalledTimes(1)

    await user.keyboard(" ")
    expect(player.selectSong).toHaveBeenCalledTimes(2)
  })

  it("keeps the delete confirmation dialog open if the user tries to dismiss it while deletion is in flight", async () => {
    mockPlayer()
    mockSession({ role: "admin" })
    const song1 = createMockSong({ id: "song-1", title: "First" })
    mockApiGet({ pages: [{ items: [song1], nextCursor: null }] })
    let resolveDelete!: (value: { data: object; error: undefined }) => void
    vi.mocked(apiClient.DELETE).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve
      }) as never
    )

    const user = userEvent.setup()
    renderWithProviders(<SongList />)

    await screen.findByText("First")
    await user.click(screen.getByRole("button", { name: "More options" }))
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    await screen.findByText('Delete "First"?')

    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    // isDeleting is now true (the DELETE promise hasn't resolved) - trying
    // to dismiss the dialog (Escape) must be a no-op while deletion is in
    // flight, per the `if (!isDeleting) setDeleteDialogOpen(open)` guard.
    await user.keyboard("{Escape}")
    expect(screen.getByText('Delete "First"?')).toBeInTheDocument()

    resolveDelete({ data: {}, error: undefined })
    await waitFor(() => {
      expect(screen.queryByText('Delete "First"?')).not.toBeInTheDocument()
    })
  })
})
