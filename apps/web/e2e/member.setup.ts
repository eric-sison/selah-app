import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test as setup } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, ".auth/member.json")

const email = process.env.E2E_MEMBER_EMAIL
const password = process.env.E2E_MEMBER_PASSWORD

// A non-admin ("user" role) session, separate from auth.setup.ts's admin
// one - needed to verify role-gated UI (e.g. Delete is admin-only, see
// SongList.tsx's canDelete) actually hides for a regular member instead of
// merely being untested.
setup("authenticate as non-admin member", async ({ page }) => {
  if (!email || !password) {
    throw new Error(
      "E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD are not set. See apps/web/.env.test.example - " +
        'this account must already exist with role "user" (invite + sign-up flow, not db:seed:admin).'
    )
  }

  await page.goto("/auth/sign-in")
  await page.getByLabel("Email Address").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()

  await expect(page).toHaveURL("/")

  await page.context().storageState({ path: authFile })
})
