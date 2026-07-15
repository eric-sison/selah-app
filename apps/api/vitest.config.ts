import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/services/__tests__/**/*.test.ts"],
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Reports every file matching `include` even if never imported by a
      // test, so a service with no test file at all still shows as a gap.
      include: ["src/services/**/*.ts"],
      exclude: ["src/services/**/__tests__/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
