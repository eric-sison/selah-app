import { defineConfig } from "drizzle-kit"
import "dotenv/config"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/app-schema.ts"],
  out: "./src/db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
})
