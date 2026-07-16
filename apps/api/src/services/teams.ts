import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { team, teamMember, teamMemberRole, teamRole } from "../db/app-schema.js"

export type TeamRole = (typeof teamRole.enumValues)[number]

export interface CreateTeamMemberInput {
  userId: string
  roles?: TeamRole[]
}

export interface CreateTeamInput {
  name: string
  /** User id of the team's leader - doesn't have to also be a rostered member. */
  teamLeaderId?: string | null
  /** Initial roster to add alongside the team itself, each with its own role assignments. */
  members?: CreateTeamMemberInput[]
}

/**
 * Creates a team and - if given - its initial members and their role
 * assignments, all in one transaction so a failure partway through (e.g. a
 * member row violating a constraint) doesn't leave a half-created team
 * behind.
 */
export async function createTeam({ name, teamLeaderId, members = [] }: CreateTeamInput) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(team).values({ name, teamLeaderId }).returning()

    for (const member of members) {
      const [createdMember] = await tx
        .insert(teamMember)
        .values({ teamId: created.id, userId: member.userId })
        .returning()

      // De-duped rather than rejected - a repeated role in the input is
      // harmless (the member ends up with it once either way), unlike a
      // repeated member, which would violate the (team, user) unique
      // constraint and is rejected at the route's request-schema level.
      const roles = [...new Set(member.roles ?? [])]
      if (roles.length > 0) {
        await tx
          .insert(teamMemberRole)
          .values(roles.map((role) => ({ teamMemberId: createdMember.id, role })))
      }
    }

    return created
  })
}

/**
 * Lists every team, alphabetically by name, each joined with its leader (if
 * set) and its members - and each member's user info and assigned roles -
 * so the Teams list page can render directly from this without per-team
 * follow-up fetches.
 */
export async function listTeams() {
  return db.query.team.findMany({
    orderBy: asc(team.name),
    with: {
      leader: { columns: { id: true, name: true, image: true } },
      members: {
        with: {
          user: { columns: { id: true, name: true, image: true } },
          roles: true,
        },
      },
    },
  })
}

/** Fetches a single team by id, joined the same way as {@link listTeams}. */
export async function getTeam(id: string) {
  return db.query.team.findFirst({
    where: eq(team.id, id),
    with: {
      leader: { columns: { id: true, name: true, image: true } },
      members: {
        with: {
          user: { columns: { id: true, name: true, image: true } },
          roles: true,
        },
      },
    },
  })
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
 * Deletes a team - its members and their role assignments cascade via FK.
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
 * Adds a user to a team as a member with no roles yet assigned.
 *
 * Idempotent - if the user is already a member of this team, returns the
 * existing membership row instead of erroring (mirrors the unique
 * `(team_id, user_id)` constraint at the DB level).
 */
export async function addTeamMember(teamId: string, userId: string) {
  const existing = await db.query.teamMember.findFirst({
    where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
  })
  if (existing) return existing

  const [created] = await db.insert(teamMember).values({ teamId, userId }).returning()
  return created
}

/**
 * Removes a member from a team - their role assignments cascade via FK. A
 * user pulled directly into a line up (rather than through this team)
 * elsewhere in the app is unaffected, since that's tracked independently of
 * team membership.
 *
 * @returns `true` if a membership row with this id was found and removed.
 */
export async function removeTeamMember(teamMemberId: string): Promise<boolean> {
  const found = await db.query.teamMember.findFirst({ where: eq(teamMember.id, teamMemberId) })
  if (!found) return false

  await db.delete(teamMember).where(eq(teamMember.id, teamMemberId))
  return true
}

/**
 * Assigns a role to a team member. A member can hold more than one role at
 * once (e.g. acoustic guitar and singer).
 *
 * Idempotent - if the member already holds this role, returns the existing
 * row instead of erroring (mirrors the unique `(team_member_id, role)`
 * constraint at the DB level).
 */
export async function addTeamMemberRole(teamMemberId: string, role: TeamRole) {
  const existing = await db.query.teamMemberRole.findFirst({
    where: and(eq(teamMemberRole.teamMemberId, teamMemberId), eq(teamMemberRole.role, role)),
  })
  if (existing) return existing

  const [created] = await db.insert(teamMemberRole).values({ teamMemberId, role }).returning()
  return created
}

/**
 * Removes a single role from a team member, leaving their membership and
 * any other roles intact.
 *
 * @returns `true` if that (member, role) pair existed and was removed.
 */
export async function removeTeamMemberRole(teamMemberId: string, role: TeamRole): Promise<boolean> {
  const found = await db.query.teamMemberRole.findFirst({
    where: and(eq(teamMemberRole.teamMemberId, teamMemberId), eq(teamMemberRole.role, role)),
  })
  if (!found) return false

  await db
    .delete(teamMemberRole)
    .where(and(eq(teamMemberRole.teamMemberId, teamMemberId), eq(teamMemberRole.role, role)))
  return true
}
