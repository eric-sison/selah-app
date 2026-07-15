import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index.js"
import { users } from "../db/auth-schema.js"
import { auth } from "../lib/auth.js"
import { assertDatabaseIsReachable } from "./lib/db-reachable.js"

const AdminSeedEnvSchema = z.object({
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_NAME: z.string().min(1),
})

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
