import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { instrument } from "../db/app-schema.js"
import { users } from "../db/auth-schema.js"
import { auth } from "../lib/auth.js"
import { createMusician } from "../services/musicians.js"
import { assertDatabaseIsReachable } from "./lib/db-reachable.js"

// Local-only placeholder domain - never a real address, so nothing here can
// accidentally email someone.
const SEED_EMAIL_DOMAIN = "selah.local"

// Shared across every seeded account, matching the real e2e fixtures'
// convention (.env.test) - one password to remember if you want to sign in
// as any of them locally.
const SEED_PASSWORD = "password123"

// Baseline roster for exercising the Teams feature - deliberately more than
// the "at least 20" ask, so a couple of skipped/already-seeded runs still
// leave a comfortably sized pool.
const MUSICIAN_NAMES = [
  "Maria Santos",
  "Daniel Cruz",
  "Ben Ortega",
  "Nico Reyes",
  "Ava Lim",
  "Jonah Park",
  "Ellie Cho",
  "Sam Rivera",
  "Liam Cortez",
  "Grace Tan",
  "Marcus Webb",
  "Julia Chen",
  "Noah Bautista",
  "Priya Nair",
  "Isaac Mendoza",
  "Faith Alonzo",
  "Caleb Dizon",
  "Ruth Villanueva",
  "Josiah Fernandez",
  "Naomi Castillo",
  "Aaron Delgado",
  "Hannah Villareal",
]

/** e.g. "Maria Santos" -> "maria.santos@selah.local" */
function emailFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".")
  return `${slug}@${SEED_EMAIL_DOMAIN}`
}

/** Picks 1-2 distinct instruments at random, so seeded musicians aren't all identical. */
function randomInstruments(): (typeof instrument.enumValues)[number][] {
  const shuffled = [...instrument.enumValues].sort(() => Math.random() - 0.5)
  const count = Math.random() < 0.5 ? 1 : 2
  return shuffled.slice(0, count)
}

async function seedMusicians() {
  await assertDatabaseIsReachable()

  let created = 0
  let skipped = 0

  for (const name of MUSICIAN_NAMES) {
    const email = emailFor(name)
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) })

    if (existing) {
      skipped++
      continue
    }

    // Called without headers/request, which better-auth treats as a
    // trusted server-side call and skips the admin-session permission
    // check (same as seed-admin.ts). This also creates the matching
    // `accounts` row (provider "credential", correctly hashed password),
    // not just the `users` row. emailVerified is set upfront so each
    // account isn't blocked by requireEmailVerification on first sign-in.
    const { user } = await auth.api.createUser({
      body: {
        email,
        password: SEED_PASSWORD,
        name,
        role: "user",
        data: { emailVerified: true },
      },
    })

    // Gives each seeded account a musician profile right away, so the seed
    // data is immediately useful for exercising the Teams "add member"
    // picker (which only offers existing musicians).
    await createMusician({ userId: user.id, instruments: randomInstruments() })
    created++
  }

  console.log(`Seeded musicians: ${created} created, ${skipped} already existed (skipped).`)
  if (created > 0) {
    console.log(`Shared password for every seeded account: ${SEED_PASSWORD}`)
  }
}

seedMusicians()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Failed to seed musician accounts:", err)
    process.exit(1)
  })
