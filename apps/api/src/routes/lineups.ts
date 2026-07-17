import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { instrument, lineupServiceType, lineupStatus } from "../db/app-schema.js"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  addLineupMember,
  addLineupSong,
  createLineup,
  deleteLineup,
  getLineup,
  listLineups,
  removeLineupMember,
  removeLineupSong,
  updateLineup,
} from "../services/lineups.js"

const LineupStatusSchema = z.enum(lineupStatus.enumValues)
const InstrumentSchema = z.enum(instrument.enumValues)
const LineupServiceTypeSchema = z.enum(lineupServiceType.enumValues)

const LineupSongResponseSchema = z.object({
  id: z.string(),
  position: z.number(),
  song: z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string().nullable(),
    musicalKey: z.string().nullable(),
    tempo: z.number().nullable(),
  }),
})

const LineupMemberResponseSchema = z.object({
  id: z.string(),
  // Read-only, resolved directly from the user's global musician profile
  // (see attachMemberInstruments in services/lineups.ts) - empty if they
  // have no musician profile.
  instruments: z.array(InstrumentSchema),
  isAvailable: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  }),
})

const LineupResponseSchema = z.object({
  id: z.string(),
  status: LineupStatusSchema,
  serviceType: LineupServiceTypeSchema,
  serviceDate: z.string(),
  rehearsalDate: z.string().nullable(),
  team: z.object({ id: z.string(), name: z.string() }),
  seriesName: z.string(),
  topic: z.string(),
  wordReference: z.string(),
  wordText: z.string().nullable(),
  direction: z.string().nullable(),
  devoLeader: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  songs: z.array(LineupSongResponseSchema),
  members: z.array(LineupMemberResponseSchema),
  // Total discussion count (top-level comments and replies alike, since
  // both share the same lineupId - see app-schema.ts). The comments
  // themselves aren't exposed through this endpoint, only their count.
  commentCount: z.number(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// getLineup's relational `with` join is the single source of truth for this
// shape - reusing its inferred return type keeps this mapper (and every
// route below that calls getLineup) from drifting out of sync with it.
type LineupWithJoins = NonNullable<Awaited<ReturnType<typeof getLineup>>>

function mapLineup(l: LineupWithJoins) {
  return {
    id: l.id,
    status: l.status,
    serviceType: l.serviceType,
    serviceDate: l.serviceDate.toISOString(),
    rehearsalDate: l.rehearsalDate ? l.rehearsalDate.toISOString() : null,
    team: { id: l.team.id, name: l.team.name },
    seriesName: l.seriesName,
    topic: l.topic,
    wordReference: l.wordReference,
    wordText: l.wordText,
    direction: l.direction,
    devoLeader: l.devoLeader
      ? { id: l.devoLeader.id, name: l.devoLeader.name, image: l.devoLeader.image }
      : null,
    songs: l.songs.map((s) => ({
      id: s.id,
      position: s.position,
      song: {
        id: s.song.id,
        title: s.song.title,
        artist: s.song.artist,
        musicalKey: s.song.musicalKey,
        tempo: s.song.tempo,
      },
    })),
    members: l.members.map((m) => ({
      id: m.id,
      instruments: m.instruments,
      isAvailable: m.isAvailable,
      user: { id: m.user.id, name: m.user.name, image: m.user.image },
    })),
    commentCount: l.comments.length,
    approvedBy: l.approvedBy,
    approvedAt: l.approvedAt ? l.approvedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }
}

const LineupIdParamSchema = z.object({ id: z.uuid() })
const LineupSongParamSchema = z.object({ id: z.uuid(), songId: z.uuid() })
const LineupMemberParamSchema = z.object({ id: z.uuid(), memberId: z.uuid() })

const CreateLineupRequestSchema = z.object({
  serviceType: LineupServiceTypeSchema,
  serviceDate: z.iso.datetime(),
  /** Omit if the rehearsal isn't scheduled yet. */
  rehearsalDate: z.iso.datetime().optional(),
  teamId: z.uuid(),
  seriesName: z.string().min(1),
  topic: z.string().min(1),
  wordReference: z.string().min(1),
  /** Omit if the passage text isn't filled in yet - the reference alone is enough to create a lineup. */
  wordText: z.string().min(1).optional(),
  direction: z.string().optional(),
  devoLeaderId: z.string().min(1).optional(),
  /** Song ids, in the order they should appear in the set list. */
  songIds: z.array(z.uuid()).optional(),
  /** User ids to add to the roster - see addLineupMember for why this carries no instruments of its own. */
  members: z.array(z.string().min(1)).optional(),
})

const createLineupRoute = createRoute({
  method: "post",
  path: "/lineups",
  operationId: "createLineup",
  tags: ["Lineups"],
  summary: "Create a lineup",
  description:
    "Admin-only. Creates a new lineup, optionally with an initial set list and roster, all in one transaction.",
  middleware: [requireAdmin] as const,
  request: {
    ...jsonBody(CreateLineupRequestSchema),
  },
  responses: {
    201: jsonResponse(LineupResponseSchema, "Lineup created."),
    401: commonErrors[401],
    403: commonErrors[403],
    422: commonErrors[422],
  },
})

const listLineupsRoute = createRoute({
  method: "get",
  path: "/lineups",
  operationId: "listLineups",
  tags: ["Lineups"],
  summary: "List lineups",
  description:
    "Any authenticated user can list every lineup, newest first, each with its team, devo leader, set list, and roster.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(z.array(LineupResponseSchema), "Lineups."),
    401: commonErrors[401],
  },
})

const getLineupRoute = createRoute({
  method: "get",
  path: "/lineups/{id}",
  operationId: "getLineup",
  tags: ["Lineups"],
  summary: "Get a lineup by id",
  description:
    "Any authenticated user can fetch a single lineup, with its team, devo leader, set list, and roster.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupIdParamSchema,
  },
  responses: {
    200: jsonResponse(LineupResponseSchema, "Lineup."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const UpdateLineupRequestSchema = z.object({
  serviceType: LineupServiceTypeSchema.optional(),
  serviceDate: z.iso.datetime().optional(),
  /** `null` clears the rehearsal slot entirely; omit to leave it untouched. */
  rehearsalDate: z.iso.datetime().nullable().optional(),
  teamId: z.uuid().optional(),
  seriesName: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  wordReference: z.string().min(1).optional(),
  /** `null` clears the passage text; omit to leave it untouched. */
  wordText: z.string().min(1).nullable().optional(),
  direction: z.string().nullable().optional(),
  devoLeaderId: z.string().min(1).nullable().optional(),
})

const updateLineupRoute = createRoute({
  method: "patch",
  path: "/lineups/{id}",
  operationId: "updateLineup",
  tags: ["Lineups"],
  summary: "Update a lineup",
  description:
    "Admin-only. Updates a lineup's team assignment, series/topic, word, and/or direction. Use the songs/members endpoints to change the set list or roster.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupIdParamSchema,
    ...jsonBody(UpdateLineupRequestSchema),
  },
  responses: {
    200: jsonResponse(LineupResponseSchema, "Lineup updated."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const deleteLineupRoute = createRoute({
  method: "delete",
  path: "/lineups/{id}",
  operationId: "deleteLineup",
  tags: ["Lineups"],
  summary: "Delete a lineup",
  description:
    "Admin-only. Deletes a lineup along with its set list, roster, schedule slots, and discussion.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupIdParamSchema,
  },
  responses: {
    204: { description: "Lineup deleted." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
  },
})

const AddLineupSongRequestSchema = z.object({
  songId: z.uuid(),
})

const addLineupSongRoute = createRoute({
  method: "post",
  path: "/lineups/{id}/songs",
  operationId: "addLineupSong",
  tags: ["Lineups"],
  summary: "Add a song to a lineup",
  description:
    "Admin-only. Appends a song to the lineup's set list. Idempotent - adding a song already in the set list is a no-op. Returns the full, updated lineup.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupIdParamSchema,
    ...jsonBody(AddLineupSongRequestSchema),
  },
  responses: {
    201: jsonResponse(LineupResponseSchema, "Song added."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const removeLineupSongRoute = createRoute({
  method: "delete",
  path: "/lineups/{id}/songs/{songId}",
  operationId: "removeLineupSong",
  tags: ["Lineups"],
  summary: "Remove a song from a lineup",
  description: "Admin-only. Removes a song from the lineup's set list.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupSongParamSchema,
  },
  responses: {
    204: { description: "Song removed." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
  },
})

const AddLineupMemberRequestSchema = z.object({
  userId: z.string().min(1),
})

const addLineupMemberRoute = createRoute({
  method: "post",
  path: "/lineups/{id}/members",
  operationId: "addLineupMember",
  tags: ["Lineups"],
  summary: "Add a user to a lineup's roster",
  description:
    "Admin-only. Adds a user to the lineup's roster - independent of team membership, and either from the assigned team or from outside it. Their displayed instruments are resolved from their global musician profile, not set here. Idempotent - adding a user already on the roster is a no-op. Returns the full, updated lineup.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupIdParamSchema,
    ...jsonBody(AddLineupMemberRequestSchema),
  },
  responses: {
    201: jsonResponse(LineupResponseSchema, "Member added."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const removeLineupMemberRoute = createRoute({
  method: "delete",
  path: "/lineups/{id}/members/{memberId}",
  operationId: "removeLineupMember",
  tags: ["Lineups"],
  summary: "Remove a user from a lineup's roster",
  description: "Admin-only. Removes a single roster assignment.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupMemberParamSchema,
  },
  responses: {
    204: { description: "Member removed." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
  },
})

export const lineupsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(createLineupRoute, async (c) => {
    // requireAdmin guarantees this is non-null.
    const user = c.get("user")!
    const {
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
      songIds,
      members,
    } = c.req.valid("json")

    const created = await createLineup({
      serviceType,
      serviceDate: new Date(serviceDate),
      rehearsalDate: rehearsalDate ? new Date(rehearsalDate) : undefined,
      teamId,
      seriesName,
      topic,
      wordReference,
      wordText,
      direction,
      devoLeaderId,
      songIds,
      members,
      createdBy: user.id,
    })

    // The plain `.returning()` row has no joins - re-fetch through getLineup
    // so the response shape matches every other lineup endpoint.
    const withJoins = await getLineup(created.id)
    // createLineup just inserted this row a moment ago, so it's guaranteed
    // to still be there for this immediate follow-up fetch.
    return c.json(mapLineup(withJoins!), 201)
  })
  .openapi(listLineupsRoute, async (c) => {
    const lineups = await listLineups()
    return c.json(
      lineups.map((l) => mapLineup(l)),
      200
    )
  })
  .openapi(getLineupRoute, async (c) => {
    const { id } = c.req.valid("param")
    const found = await getLineup(id)

    if (!found) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    return c.json(mapLineup(found), 200)
  })
  .openapi(updateLineupRoute, async (c) => {
    // requireAdmin guarantees this is non-null.
    const user = c.get("user")!
    const { id } = c.req.valid("param")
    const {
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
    } = c.req.valid("json")
    const updated = await updateLineup(
      id,
      {
        serviceType,
        serviceDate: serviceDate ? new Date(serviceDate) : undefined,
        rehearsalDate:
          rehearsalDate === undefined ? undefined : rehearsalDate === null ? null : new Date(rehearsalDate),
        teamId,
        seriesName,
        topic,
        wordReference,
        wordText,
        direction,
        devoLeaderId,
      },
      user.id
    )

    if (!updated) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    return c.json(mapLineup(updated), 200)
  })
  .openapi(deleteLineupRoute, async (c) => {
    const { id } = c.req.valid("param")
    const deleted = await deleteLineup(id)

    if (!deleted) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    return c.body(null, 204)
  })
  .openapi(addLineupSongRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { songId } = c.req.valid("json")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    await addLineupSong(id, songId)

    const updated = await getLineup(id)
    // existingLineup just confirmed this lineup exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapLineup(updated!), 201)
  })
  .openapi(removeLineupSongRoute, async (c) => {
    const { id, songId } = c.req.valid("param")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }
    const song = existingLineup.songs.find((s) => s.song.id === songId)
    if (!song) {
      return c.json({ status: 404, message: "Song not found in this lineup." }, 404)
    }

    await removeLineupSong(id, songId)
    return c.body(null, 204)
  })
  .openapi(addLineupMemberRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { userId } = c.req.valid("json")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    await addLineupMember(id, userId)

    const updated = await getLineup(id)
    // existingLineup just confirmed this lineup exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapLineup(updated!), 201)
  })
  .openapi(removeLineupMemberRoute, async (c) => {
    const { id, memberId } = c.req.valid("param")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }
    const member = existingLineup.members.find((m) => m.id === memberId)
    if (!member) {
      return c.json({ status: 404, message: "Lineup member not found." }, 404)
    }

    await removeLineupMember(memberId)
    return c.body(null, 204)
  })
