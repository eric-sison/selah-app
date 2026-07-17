import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { team, teamMember } from "../db/app-schema.js"
import { getMusiciansByUserIds } from "./musicians.js"

/**
 * Thrown by {@link createTeam}/{@link addTeamMember} when a given user has
 * no musician profile yet - team members are always picked from the
 * musicians list (see TeamMembershipFields.tsx), so this guards against a
 * caller bypassing that UI. `code` is machine-readable so route handlers
 * can map it to a specific HTTP status (422) without string-matching the
 * message.
 */
export class TeamError extends Error {
  code: "MEMBER_NOT_A_MUSICIAN"

  constructor(code: "MEMBER_NOT_A_MUSICIAN", message: string) {
    super(message)
    this.code = code
  }
}

async function assertAreMusicians(userIds: string[]) {
  if (userIds.length === 0) return

  const musiciansByUserId = await getMusiciansByUserIds(userIds)
  const missing = userIds.filter((id) => !musiciansByUserId.has(id))
  if (missing.length > 0) {
    throw new TeamError(
      "MEMBER_NOT_A_MUSICIAN",
      "Every team member must have a musician profile - create one on the Musicians page first."
    )
  }
}

export interface CreateTeamMemberInput {
  userId: string
}

export interface CreateTeamInput {
  name: string
  /** User id of the team's leader - doesn't have to also be a rostered member. */
  teamLeaderId?: string | null
  /** Initial roster to add alongside the team itself. */
  members?: CreateTeamMemberInput[]
}

/**
 * Creates a team and - if given - its initial members, all in one
 * transaction so a failure partway through (e.g. a member row violating a
 * constraint) doesn't leave a half-created team behind. A member's
 * instruments live globally on the musicians table, not here.
 *
 * @throws {TeamError} if any given member has no musician profile.
 */
export async function createTeam({ name, teamLeaderId, members = [] }: CreateTeamInput) {
  await assertAreMusicians(members.map((m) => m.userId))

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(team).values({ name, teamLeaderId }).returning()

    for (const member of members) {
      await tx.insert(teamMember).values({ teamId: created.id, userId: member.userId })
    }

    return created
  })
}

const withLeaderAndMembers = {
  leader: { columns: { id: true, name: true, image: true } },
  members: {
    with: {
      user: { columns: { id: true, name: true, image: true } },
    },
  },
} as const

/**
 * Attaches each member's globally-resolved musician id and instruments onto
 * a team's members - a member's instruments aren't stored per-team, so this
 * is a follow-up lookup rather than part of the relational join itself.
 * Every team member is picked from the musicians list (see
 * TeamMembershipFields.tsx), so a musician profile is guaranteed to exist
 * for each one here.
 */
async function attachMemberInstruments<T extends { user: { id: string } }>(members: T[]) {
  const musiciansByUserId = await getMusiciansByUserIds(members.map((m) => m.user.id))

  return members.map((m) => {
    const musicianProfile = musiciansByUserId.get(m.user.id)!
    return { ...m, musicianId: musicianProfile.id, instruments: musicianProfile.instruments }
  })
}

/**
 * Lists every team, alphabetically by name, each joined with its leader (if
 * set) and its members - and each member's user info and current global
 * instruments - so the Teams list page can render directly from this
 * without per-team follow-up fetches.
 */
export async function listTeams() {
  const teams = await db.query.team.findMany({
    orderBy: asc(team.name),
    with: withLeaderAndMembers,
  })
  return Promise.all(teams.map(async (t) => ({ ...t, members: await attachMemberInstruments(t.members) })))
}

/** Fetches a single team by id, joined the same way as {@link listTeams}. */
export async function getTeam(id: string) {
  const found = await db.query.team.findFirst({
    where: eq(team.id, id),
    with: withLeaderAndMembers,
  })
  if (!found) return undefined

  return { ...found, members: await attachMemberInstruments(found.members) }
}

export interface UpdateTeamInput {
  name?: string
  teamLeaderId?: string | null
}

/**
 * Updates a team's name and/or leader.
 *
 * @returns the updated team, or `undefined` if no team has this id.
 */
export async function updateTeam(id: string, input: UpdateTeamInput) {
  const [updated] = await db.update(team).set(input).where(eq(team.id, id)).returning()
  return updated
}

/**
 * Deletes a team - its membership rows cascade via FK.
 *
 * @returns `true` if a team with this id was found and deleted, `false` otherwise.
 */
export async function deleteTeam(id: string): Promise<boolean> {
  const found = await db.query.team.findFirst({ where: eq(team.id, id) })
  if (!found) return false

  await db.delete(team).where(eq(team.id, id))
  return true
}

/**
 * Adds a user to a team as a member.
 *
 * Idempotent - if the user is already a member of this team, returns the
 * existing membership row instead of erroring (mirrors the unique
 * `(team_id, user_id)` constraint at the DB level).
 *
 * @throws {TeamError} if this user has no musician profile.
 */
export async function addTeamMember(teamId: string, userId: string) {
  const existing = await db.query.teamMember.findFirst({
    where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
  })
  if (existing) return existing

  await assertAreMusicians([userId])

  const [created] = await db.insert(teamMember).values({ teamId, userId }).returning()
  return created
}

/**
 * Removes a member from a team. A user pulled directly into a line up
 * (rather than through this team) elsewhere in the app is unaffected, since
 * that's tracked independently of team membership - and their musician
 * profile (instruments) is untouched either way, since that's global.
 *
 * @returns `true` if a membership row with this id was found and removed.
 */
export async function removeTeamMember(teamMemberId: string): Promise<boolean> {
  const found = await db.query.teamMember.findFirst({ where: eq(teamMember.id, teamMemberId) })
  if (!found) return false

  await db.delete(teamMember).where(eq(teamMember.id, teamMemberId))
  return true
}
