import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import {
  lineup,
  lineupMember,
  lineupServiceType,
  lineupSong,
  lineupStatus,
  schedule,
} from "../db/app-schema.js"
import { getMusiciansByUserIds } from "./musicians.js"

export type LineupServiceType = (typeof lineupServiceType.enumValues)[number]
export type LineupStatus = (typeof lineupStatus.enumValues)[number]

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Upserts a lineup's two schedule slots (service, always; practice, only if
 * `rehearsalDate` is set) to match its current `serviceType`/`serviceDate`/
 * `rehearsalDate` - the schedule rows a lineup owns are a synced projection
 * of those columns, not independently editable (see schedule's comment in
 * app-schema.ts). Clears the practice slot if `rehearsalDate` was unset.
 *
 * Always run as part of the same transaction as the lineup write it follows,
 * so the lineup and its calendar entries never disagree.
 */
async function syncLineupSchedules(
  tx: Transaction,
  lineupRow: Pick<typeof lineup.$inferSelect, "id" | "serviceType" | "serviceDate" | "rehearsalDate">,
  actorId: string
) {
  const existingService = await tx.query.schedule.findFirst({
    where: and(eq(schedule.lineupId, lineupRow.id), eq(schedule.lineupRole, "service")),
  })
  if (existingService) {
    await tx
      .update(schedule)
      .set({ type: lineupRow.serviceType, startAt: lineupRow.serviceDate })
      .where(eq(schedule.id, existingService.id))
  } else {
    await tx.insert(schedule).values({
      type: lineupRow.serviceType,
      lineupId: lineupRow.id,
      lineupRole: "service",
      startAt: lineupRow.serviceDate,
      createdBy: actorId,
    })
  }

  const existingPractice = await tx.query.schedule.findFirst({
    where: and(eq(schedule.lineupId, lineupRow.id), eq(schedule.lineupRole, "practice")),
  })
  if (lineupRow.rehearsalDate) {
    if (existingPractice) {
      await tx
        .update(schedule)
        .set({ startAt: lineupRow.rehearsalDate })
        .where(eq(schedule.id, existingPractice.id))
    } else {
      await tx.insert(schedule).values({
        type: "rehearsal",
        lineupId: lineupRow.id,
        lineupRole: "practice",
        startAt: lineupRow.rehearsalDate,
        createdBy: actorId,
      })
    }
  } else if (existingPractice) {
    await tx.delete(schedule).where(eq(schedule.id, existingPractice.id))
  }
}

const withJoins = {
  team: { columns: { id: true, name: true } },
  devoLeader: { columns: { id: true, name: true, image: true } },
  songs: {
    orderBy: asc(lineupSong.position),
    with: {
      song: {
        columns: { id: true, title: true, artist: true, musicalKey: true, tempo: true },
      },
      singer: { columns: { id: true, name: true, image: true } },
    },
  },
  members: {
    with: {
      user: { columns: { id: true, name: true, image: true } },
    },
  },
  // Only the id is needed - comments (which include replies, since both
  // share the same lineupId, see app-schema.ts) are just counted for the
  // list/detail views, not otherwise rendered through this join.
  comments: { columns: { id: true } },
} as const

export interface CreateLineupInput {
  serviceType: LineupServiceType
  serviceDate: Date
  /** When the lineup's rehearsal is - omit if not scheduled yet. */
  rehearsalDate?: Date | null
  teamId: string
  seriesName?: string
  topic?: string
  wordReference?: string
  wordText?: string
  direction?: string
  devoLeaderId?: string | null
  /** Songs, in the order they should appear in the set list, each optionally assigned a singer from the roster. */
  songs?: LineupSongInput[]
  /** User ids to add to the roster - see addLineupMember for why this carries no role of its own. */
  members?: string[]
  createdBy: string
}

export interface LineupSongInput {
  songId: string
  /** The roster member singing this song - omit if not assigned yet. */
  singerId?: string | null
}

/**
 * Creates a lineup and - if given - its initial set list and roster, all in
 * one transaction so a failure partway through doesn't leave a
 * half-created lineup behind (mirrors createTeam's shape). Also creates the
 * lineup's service (and, if given, practice) schedule slot in the same
 * transaction - see syncLineupSchedules.
 */
export async function createLineup({
  serviceType,
  serviceDate,
  rehearsalDate = null,
  teamId,
  seriesName,
  topic,
  wordReference,
  wordText,
  direction,
  devoLeaderId,
  songs = [],
  members = [],
  createdBy,
}: CreateLineupInput) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lineup)
      .values({
        serviceType,
        serviceDate,
        rehearsalDate,
        teamId,
        seriesName,
        topic,
        wordReference,
        wordText,
        direction,
        devoLeaderId,
        createdBy,
      })
      .returning()

    await syncLineupSchedules(tx, created, createdBy)

    // De-duped rather than rejected - a repeated song/member in the input is
    // harmless (it ends up in the set list/roster once either way), unlike a
    // repeated row, which would violate this table's unique constraint. The
    // first occurrence's singerId wins for a repeated songId - built by only
    // ever setting a songId the first time it's seen, since Map.set on an
    // existing key would otherwise let a later occurrence overwrite it.
    const uniqueSongsById = new Map<string, LineupSongInput>()
    for (const s of songs) {
      if (!uniqueSongsById.has(s.songId)) uniqueSongsById.set(s.songId, s)
    }
    const uniqueSongs = [...uniqueSongsById.values()]
    if (uniqueSongs.length > 0) {
      await tx.insert(lineupSong).values(
        uniqueSongs.map(({ songId, singerId }, position) => ({
          lineupId: created.id,
          songId,
          singerId: singerId ?? null,
          position,
        }))
      )
    }

    const uniqueMemberUserIds = [...new Set(members)]
    if (uniqueMemberUserIds.length > 0) {
      await tx
        .insert(lineupMember)
        .values(uniqueMemberUserIds.map((userId) => ({ lineupId: created.id, userId })))
    }

    return created
  })
}

/**
 * Attaches each roster member's globally-resolved instruments - resolved
 * directly from the musicians table by user id, independent of team
 * membership (see addLineupMember's doc comment), so someone pulled onto a
 * lineup from outside the assigned team still shows their real instruments
 * instead of an empty list.
 */
async function attachMemberInstruments<T extends { userId: string }>(members: T[]) {
  const musiciansByUserId = await getMusiciansByUserIds(members.map((m) => m.userId))
  return members.map((m) => ({ ...m, instruments: musiciansByUserId.get(m.userId)?.instruments ?? [] }))
}

const SEARCH_SIMILARITY_THRESHOLD = 0.2

export interface ListLineupsOptions {
  /** Spelling-tolerant search over `seriesName` and `topic` - omit to skip that filter. */
  query?: string
  /** Only lineups on or after this date (inclusive). Combine with `dateTo` for a bounded range, or omit `dateTo` for an open-ended "from this date on" filter. */
  dateFrom?: Date
  /** Only lineups on or before this date (inclusive). Given without `dateFrom`, filters everything up to and including this date. */
  dateTo?: Date
  /** Only lineups in one of these statuses - omit to skip filtering by status. */
  statuses?: LineupStatus[]
  /** Order by `serviceDate` ascending or descending - omit to keep the default (newest-created first, or search-relevance order when `query` is given). */
  sort?: "asc" | "desc"
}

/**
 * Lists lineups, newest first, each joined with its team, devo leader,
 * ordered set list, and roster - so the Line Ups list page can render
 * directly from this without per-lineup follow-up fetches.
 *
 * The search, date-range, and status filters combine with AND - omit any of
 * them to skip that filter entirely. `sort`, when given, overrides the
 * default ordering (including search relevance) with a plain service-date
 * sort.
 */
export async function listLineups({ query, dateFrom, dateTo, statuses, sort }: ListLineupsOptions = {}) {
  // Trigram similarity (via the series-name/topic trigram GIN indexes)
  // tolerates misspellings; ILIKE is kept alongside it so a correctly-
  // spelled partial match is never excluded by the similarity floor - same
  // approach as listSongs's title/artist search. Both columns are nullable,
  // hence the coalesce - a row with neither set would otherwise get a NULL
  // similarity, which sorts *first* under DESC (Postgres defaults to NULLS
  // FIRST there), floating never-matching rows above real matches.
  const likeQuery = `%${query}%`
  const similarity = query
    ? sql<number>`greatest(similarity(coalesce(${lineup.seriesName}, ''), ${query}), similarity(coalesce(${lineup.topic}, ''), ${query}))`
    : undefined
  const searchClause = query
    ? sql`${similarity} > ${SEARCH_SIMILARITY_THRESHOLD} OR ${lineup.seriesName} ILIKE ${likeQuery} OR ${lineup.topic} ILIKE ${likeQuery}`
    : undefined

  // `dateTo` is a calendar day, not a timestamp - `lt` the *next* day rather
  // than `lte` the given Date (which is midnight) so a lineup later that same
  // day isn't excluded.
  const dateToExclusive = dateTo ? new Date(dateTo.getTime() + 24 * 60 * 60 * 1000) : undefined

  const where = and(
    searchClause,
    dateFrom ? gte(lineup.serviceDate, dateFrom) : undefined,
    dateToExclusive ? lt(lineup.serviceDate, dateToExclusive) : undefined,
    statuses && statuses.length > 0 ? inArray(lineup.status, statuses) : undefined
  )

  const orderBy = sort
    ? sort === "asc"
      ? asc(lineup.serviceDate)
      : desc(lineup.serviceDate)
    : query
      ? [desc(similarity!), desc(lineup.createdAt)]
      : desc(lineup.createdAt)

  const lineups = await db.query.lineup.findMany({
    where,
    orderBy,
    with: withJoins,
  })
  return Promise.all(lineups.map(async (l) => ({ ...l, members: await attachMemberInstruments(l.members) })))
}

/** Fetches a single lineup by id, joined the same way as {@link listLineups}. */
export async function getLineup(id: string) {
  const found = await db.query.lineup.findFirst({
    where: eq(lineup.id, id),
    with: withJoins,
  })
  if (!found) return undefined

  return { ...found, members: await attachMemberInstruments(found.members) }
}

export interface UpdateLineupInput {
  /** e.g. pulling a submitted lineup back to "draft" for further edits. */
  status?: LineupStatus
  serviceType?: LineupServiceType
  serviceDate?: Date
  /** `null` clears the rehearsal slot entirely (deletes its schedule row); `undefined` leaves it untouched. */
  rehearsalDate?: Date | null
  teamId?: string
  /** `null` clears the value; `undefined` leaves it untouched - same for topic and wordReference. */
  seriesName?: string | null
  topic?: string | null
  wordReference?: string | null
  wordText?: string | null
  direction?: string | null
  devoLeaderId?: string | null
}

/**
 * Updates a lineup's own fields (its status, team assignment, series/topic,
 * word, direction, and/or scheduling) and, in the same transaction, resyncs its
 * schedule slots against the resulting row - see syncLineupSchedules. Runs
 * the resync from the merged row rather than just the touched fields, so a
 * PATCH that doesn't touch scheduling at all still leaves the schedule in
 * sync (a no-op update in that case). Set list and roster changes go
 * through addLineupSong/removeLineupSong and
 * addLineupMember/removeLineupMember instead.
 *
 * @param updatedBy - id of the user making this change; only used as
 *   `createdBy` if syncing creates a new schedule row (e.g. a rehearsal date
 *   added for the first time).
 * @returns the updated lineup, or `undefined` if no lineup has this id.
 */
export async function updateLineup(id: string, input: UpdateLineupInput, updatedBy: string) {
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(lineup).set(input).where(eq(lineup.id, id)).returning()
    if (!row) return undefined

    await syncLineupSchedules(tx, row, updatedBy)
    return row
  })
  if (!updated) return undefined

  // The plain `.returning()` row has no joins, and the transaction above has
  // already committed by this point - re-fetch through getLineup (on the
  // pool, not `tx`) so the response shape matches every other lineup
  // endpoint and reflects the just-committed write.
  return getLineup(id)
}

/**
 * Deletes a lineup - its set list, roster, schedule slots, and discussion
 * all cascade via FK.
 *
 * @returns `true` if a lineup with this id was found and deleted, `false` otherwise.
 */
export async function deleteLineup(id: string): Promise<boolean> {
  const found = await db.query.lineup.findFirst({ where: eq(lineup.id, id) })
  if (!found) return false

  await db.delete(lineup).where(eq(lineup.id, id))
  return true
}

/**
 * Adds a song to a lineup's set list, appended after whatever's already
 * there - optionally assigning a singer for it from the roster up front.
 *
 * Idempotent - if the song is already in this lineup, returns the existing
 * row instead of erroring (mirrors the unique `(lineup_id, song_id)`
 * constraint at the DB level); the given `singerId`, if any, is ignored in
 * that case rather than overwriting an existing assignment.
 */
export async function addLineupSong(lineupId: string, songId: string, singerId?: string | null) {
  const existing = await db.query.lineupSong.findFirst({
    where: and(eq(lineupSong.lineupId, lineupId), eq(lineupSong.songId, songId)),
  })
  if (existing) return existing

  const [{ maxPosition }] = await db
    .select({ maxPosition: sql<number | null>`max(${lineupSong.position})` })
    .from(lineupSong)
    .where(eq(lineupSong.lineupId, lineupId))

  const [created] = await db
    .insert(lineupSong)
    .values({ lineupId, songId, singerId: singerId ?? null, position: (maxPosition ?? -1) + 1 })
    .returning()
  return created
}

/**
 * Assigns (or, given `null`, clears) who's singing a song already in a
 * lineup's set list - the counterpart to addLineupSong's own singerId that
 * lets it be set/changed after the song's already been added.
 *
 * @returns the updated row, or `undefined` if that (lineup, song) pair doesn't exist.
 */
export async function updateLineupSongSinger(lineupId: string, songId: string, singerId: string | null) {
  const existing = await db.query.lineupSong.findFirst({
    where: and(eq(lineupSong.lineupId, lineupId), eq(lineupSong.songId, songId)),
  })
  if (!existing) return undefined

  const [updated] = await db
    .update(lineupSong)
    .set({ singerId })
    .where(eq(lineupSong.id, existing.id))
    .returning()
  return updated
}

/**
 * Removes a song from a lineup's set list, leaving the rest of the ordering
 * untouched (positions aren't renumbered).
 *
 * @returns `true` if that (lineup, song) pair existed and was removed.
 */
export async function removeLineupSong(lineupId: string, songId: string): Promise<boolean> {
  const existing = await db.query.lineupSong.findFirst({
    where: and(eq(lineupSong.lineupId, lineupId), eq(lineupSong.songId, songId)),
  })
  if (!existing) return false

  await db.delete(lineupSong).where(eq(lineupSong.id, existing.id))
  return true
}

/**
 * Adds a user to a lineup's roster - independent of team membership (a user
 * pulled in directly is unaffected by their team roster elsewhere, and vice
 * versa). Carries no instruments of its own; the roster's displayed
 * instruments are resolved at read time directly from the user's global
 * musician profile (see attachMemberInstruments above), regardless of
 * whether they're on the lineup's assigned team.
 *
 * Idempotent - if the user is already on this lineup's roster, returns the
 * existing row instead of erroring (mirrors the unique
 * `(lineup_id, user_id)` constraint at the DB level).
 */
export async function addLineupMember(lineupId: string, userId: string) {
  const existing = await db.query.lineupMember.findFirst({
    where: and(eq(lineupMember.lineupId, lineupId), eq(lineupMember.userId, userId)),
  })
  if (existing) return existing

  const [created] = await db.insert(lineupMember).values({ lineupId, userId }).returning()
  return created
}

/**
 * Removes a single roster assignment.
 *
 * @returns `true` if a roster row with this id was found and removed.
 */
export async function removeLineupMember(memberId: string): Promise<boolean> {
  const found = await db.query.lineupMember.findFirst({ where: eq(lineupMember.id, memberId) })
  if (!found) return false

  await db.delete(lineupMember).where(eq(lineupMember.id, memberId))
  return true
}
