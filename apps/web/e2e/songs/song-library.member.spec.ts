import { expect, test } from "@playwright/test"

// Runs under the "chromium-member" project (see playwright.config.ts),
// authenticated as a non-admin "user"-role account via member.setup.ts.
test("non-admin users do not see the Delete option in a song's menu", async ({ page }) => {
  await page.goto("/songs")

  const firstRow = page.locator('div[tabindex="0"]').first()
  await firstRow.getByRole("button", { name: "More options" }).click()

  // SongList.tsx only renders the Delete item (and its separator) when
  // canDelete (session.user.role === "admin") is true.
  await expect(page.getByRole("menuitem", { name: "View Details" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Download" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Delete" })).not.toBeVisible()
})

test("non-admin users can still view details and download a song", async ({ page }) => {
  // Delete is the only role-gated action (see the test above) - everything
  // else in the menu should work identically for a regular member.
  await page.goto("/songs")
  const firstRow = page.locator('div[tabindex="0"]').first()

  await firstRow.getByRole("button", { name: "More options" }).click()
  await page.getByRole("menuitem", { name: "View Details" }).click()
  const sheet = page.getByRole("dialog").filter({ hasText: "Song details" })
  await expect(sheet).toBeVisible()
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(sheet).not.toBeVisible()

  await firstRow.getByRole("button", { name: "More options" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download" }).click(),
  ])
  expect(download.suggestedFilename()).toBeTruthy()
})
