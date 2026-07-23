import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { instrument, lineupServiceType, lineupStatus, reactionEmoji } from "../db/app-schema.js"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  addLineupMember,
  addLineupSong,
  createLineup,
  createLineupComment,
  deleteLineup,
  deleteLineupComment,
  getLineup,
  getLineupCommentById,
  listLineupComments,
  listLineups,
  type ReactionEmoji,
  removeLineupMember,
  removeLineupSong,
  reorderLineupSongs,
  toggleLineupCommentReaction,
  updateLineup,
  updateLineupComment,
  updateLineupSongSinger,
} from "../services/lineups.js"

const LineupStatusSchema = z.enum(lineupStatus.enumValues)
const InstrumentSchema = z.enum(instrument.enumValues)
const LineupServiceTypeSchema = z.enum(lineupServiceType.enumValues)
const LineupSortSchema = z.enum(["asc", "desc"])

const LineupSongResponseSchema = z.object({
  id: z.string(),
  position: z.number(),
  song: z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string().nullable(),
    musicalKey: z.string().nullable(),
    tempo: z.number().nullable(),
    hasAlbumArt: z.boolean(),
  }),
  // Who's singing this song, from the lineup's own roster - null until
  // assigned.
  singer: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
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
  seriesName: z.string().nullable(),
  topic: z.string().nullable(),
  wordReference: z.string().nullable(),
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
        hasAlbumArt: s.song.albumArtStorageKey !== null,
      },
      singer: s.singer ? { id: s.singer.id, name: s.singer.name, image: s.singer.image } : null,
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

// Collapses a comment's raw reaction rows (one per user+emoji) into
// per-emoji counts, and whether `viewerId` is one of the reactors - resolved
// here rather than in the service since it depends on who's asking.
function summarizeReactions(reactions: { userId: string; emoji: ReactionEmoji }[], viewerId: string) {
  const summaries = new Map<ReactionEmoji, { count: number; reactedByMe: boolean }>()
  for (const reaction of reactions) {
    const entry = summaries.get(reaction.emoji) ?? { count: 0, reactedByMe: false }
    entry.count += 1
    if (reaction.userId === viewerId) entry.reactedByMe = true
    summaries.set(reaction.emoji, entry)
  }
  return Array.from(summaries, ([emoji, summary]) => ({ emoji, ...summary }))
}

interface CommentReplyWithJoins {
  id: string
  body: string
  author: { id: string; name: string; image: string | null }
  createdAt: Date
  reactions: { userId: string; emoji: ReactionEmoji }[]
}

function mapCommentReply(comment: CommentReplyWithJoins, viewerId: string) {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt.toISOString(),
    reactions: summarizeReactions(comment.reactions, viewerId),
  }
}

function mapComment(comment: CommentReplyWithJoins & { replies: CommentReplyWithJoins[] }, viewerId: string) {
  return {
    ...mapCommentReply(comment, viewerId),
    replies: comment.replies.map((reply) => mapCommentReply(reply, viewerId)),
  }
}

const LineupIdParamSchema = z.object({ id: z.uuid() })
const LineupSongParamSchema = z.object({ id: z.uuid(), songId: z.uuid() })
const LineupMemberParamSchema = z.object({ id: z.uuid(), memberId: z.uuid() })
const LineupCommentParamSchema = z.object({ id: z.uuid(), commentId: z.uuid() })

const ReactionEmojiSchema = z.enum(reactionEmoji.enumValues)

const LineupCommentReactionSummarySchema = z.object({
  emoji: ReactionEmojiSchema,
  count: z.number(),
  // Whether the requesting user is one of the people who reacted with this
  // emoji - resolved per-request (see summarizeReactions below), not stored.
  reactedByMe: z.boolean(),
})

const LineupCommentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
})

// Shape shared by a top-level comment and a reply - a reply just never has
// its own `replies` (see LineupCommentResponseSchema), matching the schema's
// one-level-of-nesting UI constraint (see lineupComment in app-schema.ts).
const LineupCommentReplyResponseSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: LineupCommentAuthorSchema,
  createdAt: z.string(),
  reactions: z.array(LineupCommentReactionSummarySchema),
})

const LineupCommentResponseSchema = LineupCommentReplyResponseSchema.extend({
  replies: z.array(LineupCommentReplyResponseSchema),
})

const CreateLineupRequestSchema = z.object({
  serviceType: LineupServiceTypeSchema,
  serviceDate: z.iso.datetime(),
  /** Omit if the rehearsal isn't scheduled yet. */
  rehearsalDate: z.iso.datetime().optional(),
  teamId: z.uuid(),
  seriesName: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  wordReference: z.string().min(1).optional(),
  /** Omit if the passage text isn't filled in yet - the reference alone is enough to create a lineup. */
  wordText: z.string().min(1).optional(),
  direction: z.string().optional(),
  devoLeaderId: z.string().min(1).optional(),
  /** Songs, in the order they should appear in the set list, each optionally assigned a singer from the roster. */
  songs: z
    .array(z.object({ songId: z.uuid(), singerId: z.string().min(1).optional() }))
    .optional(),
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

const ListLineupsQuerySchema = z.object({
  q: z.string().trim().min(1).optional().openapi({
    description: "Spelling-tolerant search over the series name and topic.",
  }),
  from: z.iso.date().optional().openapi({
    description:
      "Only lineups on/after this service date (YYYY-MM-DD), inclusive. Given without `to`, filters to every lineup from this date on.",
  }),
  to: z.iso.date().optional().openapi({
    description: "Only lineups on/before this service date (YYYY-MM-DD), inclusive.",
  }),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : undefined))
    .pipe(z.array(LineupStatusSchema).optional())
    .openapi({
      type: "string",
      description: "Comma-separated statuses (draft, pending, approved) - only lineups in one of these.",
    }),
  sort: LineupSortSchema.optional().openapi({
    description:
      "Order by service date: `asc` (soonest first) or `desc` (latest first). Omit to keep the default order (newest-created first, or search-relevance order when `q` is given).",
  }),
})

const listLineupsRoute = createRoute({
  method: "get",
  path: "/lineups",
  operationId: "listLineups",
  tags: ["Lineups"],
  summary: "List lineups",
  description:
    "Any authenticated user can list lineups, newest first, each with its team, devo leader, set list, and roster - optionally filtered by a spelling-tolerant `q` search over the series name and topic, a `from`/`to` service-date range, and/or `status` (comma-separated). Pass `sort` (`asc`/`desc`) to order by service date instead.",
  middleware: [requireAuth] as const,
  request: {
    query: ListLineupsQuerySchema,
  },
  responses: {
    200: jsonResponse(z.array(LineupResponseSchema), "Lineups."),
    401: commonErrors[401],
    422: commonErrors[422],
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
  /** e.g. pulling a submitted lineup back to "draft" for further edits. */
  status: LineupStatusSchema.optional(),
  serviceType: LineupServiceTypeSchema.optional(),
  serviceDate: z.iso.datetime().optional(),
  /** `null` clears the rehearsal slot entirely; omit to leave it untouched. */
  rehearsalDate: z.iso.datetime().nullable().optional(),
  teamId: z.uuid().optional(),
  /** `null` clears the value; omit to leave it untouched - same for topic and wordReference below. */
  seriesName: z.string().min(1).nullable().optional(),
  topic: z.string().min(1).nullable().optional(),
  wordReference: z.string().min(1).nullable().optional(),
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
    "Admin-only. Updates a lineup's status, team assignment, series/topic, word, and/or direction. Use the songs/members endpoints to change the set list or roster.",
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
  /** The roster member singing this song - omit if not assigned yet. */
  singerId: z.string().min(1).optional(),
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

const UpdateLineupSongRequestSchema = z.object({
  /** `null` unassigns the singer entirely. */
  singerId: z.string().min(1).nullable(),
})

const updateLineupSongRoute = createRoute({
  method: "patch",
  path: "/lineups/{id}/songs/{songId}",
  operationId: "updateLineupSong",
  tags: ["Lineups"],
  summary: "Assign or clear a song's singer",
  description:
    "Admin-only. Updates who's singing a song already in the lineup's set list. Returns the full, updated lineup.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupSongParamSchema,
    ...jsonBody(UpdateLineupSongRequestSchema),
  },
  responses: {
    200: jsonResponse(LineupResponseSchema, "Song updated."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const ReorderLineupSongsRequestSchema = z.object({
  /** Every song currently in the lineup's set list, in the order they should now appear - same set, no additions or removals. */
  songIds: z.array(z.uuid()).min(1),
})

const reorderLineupSongsRoute = createRoute({
  method: "put",
  path: "/lineups/{id}/songs-order",
  operationId: "reorderLineupSongs",
  tags: ["Lineups"],
  summary: "Reorder a lineup's set list",
  description:
    "Admin-only. Reorders every song already in the lineup's set list to match the given order. Returns the full, updated lineup.",
  middleware: [requireAdmin] as const,
  request: {
    params: LineupIdParamSchema,
    ...jsonBody(ReorderLineupSongsRequestSchema),
  },
  responses: {
    200: jsonResponse(LineupResponseSchema, "Set list reordered."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
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

const listLineupCommentsRoute = createRoute({
  method: "get",
  path: "/lineups/{id}/comments",
  operationId: "listLineupComments",
  tags: ["Lineups"],
  summary: "List a lineup's discussion",
  description:
    "Any authenticated user can view a lineup's discussion - top-level comments with one level of nested replies, each with per-emoji reaction counts and whether the requesting user has reacted.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupIdParamSchema,
  },
  responses: {
    200: jsonResponse(z.array(LineupCommentResponseSchema), "Comments."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const CreateLineupCommentRequestSchema = z.object({
  body: z.string().min(1),
  /** Omit to post a top-level comment - set to reply to an existing top-level comment. Replying to a reply isn't supported. */
  parentCommentId: z.uuid().optional(),
})

const createLineupCommentRoute = createRoute({
  method: "post",
  path: "/lineups/{id}/comments",
  operationId: "createLineupComment",
  tags: ["Lineups"],
  summary: "Post a comment or reply on a lineup",
  description:
    "Any authenticated user can post a top-level comment, or reply to an existing top-level comment.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupIdParamSchema,
    ...jsonBody(CreateLineupCommentRequestSchema),
  },
  responses: {
    201: jsonResponse(LineupCommentReplyResponseSchema, "Comment posted."),
    401: commonErrors[401],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const ToggleLineupCommentReactionRequestSchema = z.object({
  emoji: ReactionEmojiSchema,
})

const toggleLineupCommentReactionRoute = createRoute({
  method: "post",
  path: "/lineups/{id}/comments/{commentId}/reactions",
  operationId: "toggleLineupCommentReaction",
  tags: ["Lineups"],
  summary: "Toggle a reaction on a comment",
  description:
    "Any authenticated user can react to a comment - reacting with the same emoji again removes it. Returns the comment's updated per-emoji reaction summary.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupCommentParamSchema,
    ...jsonBody(ToggleLineupCommentReactionRequestSchema),
  },
  responses: {
    200: jsonResponse(z.array(LineupCommentReactionSummarySchema), "Reaction toggled."),
    401: commonErrors[401],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const UpdateLineupCommentRequestSchema = z.object({
  body: z.string().min(1),
})

const updateLineupCommentRoute = createRoute({
  method: "patch",
  path: "/lineups/{id}/comments/{commentId}",
  operationId: "updateLineupComment",
  tags: ["Lineups"],
  summary: "Edit a comment or reply",
  description: "Only the comment's own author can edit it.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupCommentParamSchema,
    ...jsonBody(UpdateLineupCommentRequestSchema),
  },
  responses: {
    200: jsonResponse(LineupCommentReplyResponseSchema, "Comment updated."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const deleteLineupCommentRoute = createRoute({
  method: "delete",
  path: "/lineups/{id}/comments/{commentId}",
  operationId: "deleteLineupComment",
  tags: ["Lineups"],
  summary: "Delete a comment or reply",
  description:
    "Only the comment's own author can delete it. Deleting a top-level comment also deletes its replies.",
  middleware: [requireAuth] as const,
  request: {
    params: LineupCommentParamSchema,
  },
  responses: {
    204: { description: "Comment deleted." },
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
      songs,
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
      songs,
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
    const { q, from, to, status, sort } = c.req.valid("query")
    const lineups = await listLineups({
      query: q,
      dateFrom: from ? new Date(from) : undefined,
      dateTo: to ? new Date(to) : undefined,
      statuses: status,
      sort,
    })
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
      status,
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
        status,
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
    const { songId, singerId } = c.req.valid("json")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    await addLineupSong(id, songId, singerId)

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
  .openapi(updateLineupSongRoute, async (c) => {
    const { id, songId } = c.req.valid("param")
    const { singerId } = c.req.valid("json")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }
    const song = existingLineup.songs.find((s) => s.song.id === songId)
    if (!song) {
      return c.json({ status: 404, message: "Song not found in this lineup." }, 404)
    }

    await updateLineupSongSinger(id, songId, singerId)

    const updated = await getLineup(id)
    // existingLineup just confirmed this lineup and song exist, so they
    // can't have vanished by the time this second query runs a moment later.
    return c.json(mapLineup(updated!), 200)
  })
  .openapi(reorderLineupSongsRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { songIds } = c.req.valid("json")

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    const reordered = await reorderLineupSongs(id, songIds)
    if (!reordered) {
      return c.json(
        { status: 422, message: "songIds must match the lineup's current set list exactly." },
        422
      )
    }

    const updated = await getLineup(id)
    // existingLineup just confirmed this lineup exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapLineup(updated!), 200)
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
  .openapi(listLineupCommentsRoute, async (c) => {
    const { id } = c.req.valid("param")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    const comments = await listLineupComments(id)
    return c.json(
      comments.map((comment) => mapComment(comment, user.id)),
      200
    )
  })
  .openapi(createLineupCommentRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { body, parentCommentId } = c.req.valid("json")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const existingLineup = await getLineup(id)
    if (!existingLineup) {
      return c.json({ status: 404, message: "Lineup not found." }, 404)
    }

    if (parentCommentId) {
      const parent = await getLineupCommentById(parentCommentId)
      if (!parent || parent.lineupId !== id) {
        return c.json({ status: 404, message: "Comment not found." }, 404)
      }
      if (parent.parentCommentId !== null) {
        return c.json({ status: 422, message: "Cannot reply to a reply." }, 422)
      }
    }

    const created = await createLineupComment({ lineupId: id, authorId: user.id, body, parentCommentId })
    return c.json(mapCommentReply(created, user.id), 201)
  })
  .openapi(toggleLineupCommentReactionRoute, async (c) => {
    const { id, commentId } = c.req.valid("param")
    const { emoji } = c.req.valid("json")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const comment = await getLineupCommentById(commentId)
    if (!comment || comment.lineupId !== id) {
      return c.json({ status: 404, message: "Comment not found." }, 404)
    }

    const reactions = await toggleLineupCommentReaction(commentId, user.id, emoji)
    return c.json(summarizeReactions(reactions, user.id), 200)
  })
  .openapi(updateLineupCommentRoute, async (c) => {
    const { id, commentId } = c.req.valid("param")
    const { body } = c.req.valid("json")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const comment = await getLineupCommentById(commentId)
    if (!comment || comment.lineupId !== id) {
      return c.json({ status: 404, message: "Comment not found." }, 404)
    }
    if (comment.authorId !== user.id) {
      return c.json({ status: 403, message: "You can only edit your own comments." }, 403)
    }

    const updated = await updateLineupComment(commentId, body)
    return c.json(mapCommentReply(updated!, user.id), 200)
  })
  .openapi(deleteLineupCommentRoute, async (c) => {
    const { id, commentId } = c.req.valid("param")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const comment = await getLineupCommentById(commentId)
    if (!comment || comment.lineupId !== id) {
      return c.json({ status: 404, message: "Comment not found." }, 404)
    }
    if (comment.authorId !== user.id) {
      return c.json({ status: 403, message: "You can only delete your own comments." }, 403)
    }

    await deleteLineupComment(commentId)
    return c.body(null, 204)
  })
