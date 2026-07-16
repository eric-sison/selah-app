import { asc } from "drizzle-orm"
import { db } from "../db/index.js"
import { users } from "../db/auth-schema.js"

/**
 * Lists every user, alphabetically by name - backs the musician/team-leader
 * pickers shown when creating or editing a team.
 */
export async function listUsers() {
  return db.query.users.findMany({
    orderBy: asc(users.name),
    columns: { id: true, name: true, email: true, image: true },
  })
}
