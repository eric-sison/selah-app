import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: [path.join(__dirname, "test/setup.ts")],
    include: ["components/**/__tests__/**/*.test.{ts,tsx}", "utils/**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Vitest 4's v8 provider reports every file matching `include` even
      // if never imported by a test (confirmed via coverage-summary.json) -
      // a component/util with no test file at all still shows up as a gap.
      include: ["components/**/*.{ts,tsx}", "utils/**/*.{ts,tsx}"],
      exclude: ["components/**/__tests__/**", "utils/**/__tests__/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
