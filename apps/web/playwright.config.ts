import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Not .env - that's the api's runtime config (DATABASE_URL, S3 keys, etc.).
// This only carries the e2e test account's credentials, read by
// e2e/auth.setup.ts. See .env.test.example.
config({ path: path.join(__dirname, ".env.test") })

const adminAuthFile = path.join(__dirname, "e2e/.auth/admin.json")
const memberAuthFile = path.join(__dirname, "e2e/.auth/member.json")

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup-admin", testMatch: /auth\.setup\.ts/ },
    { name: "setup-member", testMatch: /member\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: adminAuthFile },
      dependencies: ["setup-admin"],
      // Member-only specs (role-gated UI) run under the "chromium-member"
      // project below instead, against a non-admin session.
      testIgnore: /\.member\.spec\.ts$/,
    },
    {
      name: "chromium-member",
      use: { ...devices["Desktop Chrome"], storageState: memberAuthFile },
      dependencies: ["setup-member"],
      testMatch: /\.member\.spec\.ts$/,
    },
  ],
  // Both dev servers - the web app rewrites /api/* to the api (see
  // next.config.ts), and sign-in itself is an api call, so tests need both
  // running. Requires local Postgres/Mailpit/Garage already up (see root
  // docker-compose.yml) - Playwright starts the app processes, not infra.
  webServer: [
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      cwd: path.join(__dirname, "../.."),
      timeout: 30_000,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      cwd: path.join(__dirname, "../.."),
      timeout: 30_000,
    },
  ],
})
