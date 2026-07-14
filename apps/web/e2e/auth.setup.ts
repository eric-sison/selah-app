import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test as setup } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, ".auth/admin.json")

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

setup("authenticate", async ({ page }) => {
  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD are not set. Copy apps/web/.env.test.example to " +
        "apps/web/.env.test and fill in an account seeded via `pnpm db:seed:admin` (apps/api)."
    )
  }

  await page.goto("/auth/sign-in")
  await page.getByLabel("Email Address").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()

  // proxy.ts only bounces unauthenticated users away from protected routes,
  // so landing on "/" (rather than staying on /auth/sign-in) confirms the
  // session cookie was actually set.
  await expect(page).toHaveURL("/")

  await page.context().storageState({ path: authFile })
})
