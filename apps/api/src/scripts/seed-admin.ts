import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index.js"
import { users } from "../db/auth-schema.js"
import { auth } from "../lib/auth.js"

const AdminSeedEnvSchema = z.object({
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_NAME: z.string().min(1),
})

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

async function assertDatabaseIsReachable() {
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

async function seedAdmin() {
  await assertDatabaseIsReachable()

  const env = AdminSeedEnvSchema.parse(process.env)

  const existing = await db.query.users.findFirst({
    where: eq(users.email, env.ADMIN_EMAIL),
  })

  if (existing) {
    if (existing.role !== "admin") {
      // auth.api.setRole requires an authenticated admin session, which a
      // standalone script doesn't have - update the role directly instead.
      await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id))
      console.log(`Promoted existing user ${env.ADMIN_EMAIL} to "admin".`)
    } else {
      console.log(`Admin account ${env.ADMIN_EMAIL} already exists, skipping.`)
    }
    return
  }

  // Called without headers/request, which better-auth treats as a trusted
  // server-side call and skips the admin-session permission check.
  // emailVerified is set upfront so the seeded account isn't blocked by
  // requireEmailVerification on its first sign-in.
  await auth.api.createUser({
    body: {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      name: env.ADMIN_NAME,
      role: "admin",
      data: { emailVerified: true },
    },
  })

  console.log(`Created admin account ${env.ADMIN_EMAIL}.`)
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Failed to seed admin account:", err)
    process.exit(1)
  })
