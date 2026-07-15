import { sql } from "drizzle-orm"
import { db } from "../../db/index.js"

// Only treat connection-level failures as "db is down" - other errors
// (bad credentials, wrong database name, etc.) should surface as-is instead
// of being masked by the generic "is it running?" guide.
const DATABASE_NOT_REACHABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND"])

function isDatabaseNotReachable(err: unknown): boolean {
  // Drizzle wraps the underlying pg/network error in DrizzleQueryError,
  // whose own `.code` is undefined - the real code (e.g. ECONNREFUSED)
  // lives on `.cause` (potentially nested further), so walk the chain.
  let current = err
  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      DATABASE_NOT_REACHABLE_CODES.has(String((current as { code: unknown }).code))
    ) {
      return true
    }
    current = current instanceof Error ? current.cause : undefined
  }
  return false
}

/** Exits the process with a setup hint if Postgres isn't reachable at all - used by every seed script before it starts writing. */
export async function assertDatabaseIsReachable() {
  try {
    await db.execute(sql`select 1`)
  } catch (err) {
    if (!isDatabaseNotReachable(err)) throw err

    console.error(
      [
        "Could not reach Postgres - is it running?",
        "",
        "This repo ships a docker-compose.yml with a postgres service. From the repo root, run:",
        "",
        "  docker compose up -d",
        "",
        "Then re-run this script.",
      ].join("\n")
    )
    process.exit(1)
  }
}
