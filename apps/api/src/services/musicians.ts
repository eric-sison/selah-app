import { eq, inArray } from "drizzle-orm"
import { db } from "../db/index.js"
import { instrument, musician, teamMember } from "../db/app-schema.js"

export type Instrument = (typeof instrument.enumValues)[number]

/**
 * Thrown by {@link createMusician}/{@link deleteMusician} on a conflicting
 * request - either the target user already has a musician profile, or (for
 * delete) they're still a member of at least one team. Every team member is
 * required to have a musician profile (see attachMemberInstruments in
 * services/teams.ts), so deleting out from under an active membership would
 * leave that invariant broken. `code` is machine-readable so route handlers
 * can map it to a specific HTTP status (409) without string-matching the
 * message.
 */
export class MusicianError extends Error {
  code: "MUSICIAN_ALREADY_EXISTS" | "MUSICIAN_HAS_TEAM_MEMBERSHIPS"

  constructor(code: MusicianError["code"], message: string) {
    super(message)
    this.code = code
  }
}

const withUser = {
  user: { columns: { id: true, name: true, email: true, image: true } },
} as const

/**
 * Lists every musician profile, joined with its user, sorted by the user's
 * name - backs the Musicians page and the team member picker. Sorted in JS
 * since the relational query API can't order by a joined table's column.
 */
export async function listMusicians() {
  const musicians = await db.query.musician.findMany({ with: withUser })
  return musicians.sort((a, b) => a.user.name.localeCompare(b.user.name))
}

/** Fetches a single musician profile by id, joined with its user. */
export async function getMusician(id: string) {
  return db.query.musician.findFirst({ where: eq(musician.id, id), with: withUser })
}

/** Fetches a single musician profile by user id, joined with its user. */
export async function getMusicianByUserId(userId: string) {
  return db.query.musician.findFirst({ where: eq(musician.userId, userId), with: withUser })
}

export interface CreateMusicianInput {
  userId: string
  instruments?: Instrument[]
}

/**
 * Creates a musician profile for a user.
 *
 * @throws {MusicianError} if this user already has a musician profile.
 */
export async function createMusician({ userId, instruments = [] }: CreateMusicianInput) {
  const existing = await db.query.musician.findFirst({ where: eq(musician.userId, userId) })
  if (existing) {
    throw new MusicianError("MUSICIAN_ALREADY_EXISTS", "This user already has a musician profile.")
  }

  const [created] = await db
    .insert(musician)
    .values({ userId, instruments: [...new Set(instruments)] })
    .returning()
  return created
}

/**
 * Replaces a musician's full set of instruments.
 *
 * @returns the updated musician, or `undefined` if no musician has this id.
 */
export async function updateMusicianInstruments(id: string, instruments: Instrument[]) {
  const [updated] = await db
    .update(musician)
    .set({ instruments: [...new Set(instruments)] })
    .where(eq(musician.id, id))
    .returning()
  return updated
}

/**
 * Deletes a musician profile - refused while the person is still a member
 * of any team, since team membership requires a musician profile (see
 * assertAreMusicians in services/teams.ts). They have to be removed from
 * every team first (on the Teams page), which is a deliberate, visible step
 * rather than something this silently cascades.
 *
 * @returns `true` if a musician profile with this id was found and deleted.
 * @throws {MusicianError} if they're still on at least one team.
 */
export async function deleteMusician(id: string): Promise<boolean> {
  const found = await db.query.musician.findFirst({ where: eq(musician.id, id) })
  if (!found) return false

  const stillOnATeam = await db.query.teamMember.findFirst({ where: eq(teamMember.userId, found.userId) })
  if (stillOnATeam) {
    throw new MusicianError(
      "MUSICIAN_HAS_TEAM_MEMBERSHIPS",
      "This musician is still on a team - remove them from every team first."
    )
  }

  await db.delete(musician).where(eq(musician.id, id))
  return true
}

export interface MusicianSummary {
  id: string
  instruments: Instrument[]
}

/**
 * Resolves each user's musician id and current global instruments in one
 * query, keyed by user id - shared by services/teams.ts and
 * services/lineups.ts so a member's instruments are read the same way
 * everywhere they're displayed. Users with no musician profile simply don't
 * appear in the returned map.
 */
export async function getMusiciansByUserIds(userIds: string[]): Promise<Map<string, MusicianSummary>> {
  if (userIds.length === 0) return new Map()

  const rows = await db.query.musician.findMany({
    where: inArray(musician.userId, userIds),
    columns: { id: true, userId: true, instruments: true },
  })
  return new Map(rows.map((r) => [r.userId, { id: r.id, instruments: r.instruments }]))
}
