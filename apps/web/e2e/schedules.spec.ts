import { expect, test } from "@playwright/test"

test("shows the schedules calendar for a signed-in user", async ({ page }) => {
  await page.goto("/schedules")

  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Next month" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible()
  await expect(page.getByText("Sunday", { exact: true })).toBeVisible()
})
