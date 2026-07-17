import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { instrument } from "../db/app-schema.js"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  removeTeamMember,
  TeamError,
  updateTeam,
} from "../services/teams.js"

const InstrumentSchema = z.enum(instrument.enumValues)

const TeamMemberResponseSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  }),
  // Every team member is picked from the musicians list, so this always
  // resolves - see attachMemberInstruments in services/teams.ts.
  musicianId: z.string(),
  instruments: z.array(InstrumentSchema),
})

const TeamLeaderResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
})

const TeamResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  // A team leader doesn't have to also be a rostered member (see
  // teamLeaderId's comment in app-schema.ts) - reported independently of
  // `members` rather than as a flag on one of its entries.
  leader: TeamLeaderResponseSchema.nullable(),
  members: z.array(TeamMemberResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// getTeam's relational `with` join is the single source of truth for this
// shape - reusing its inferred return type keeps this mapper (and every
// route below that calls getTeam) from drifting out of sync with it.
type TeamWithMembers = NonNullable<Awaited<ReturnType<typeof getTeam>>>

function mapTeam(t: TeamWithMembers) {
  return {
    id: t.id,
    name: t.name,
    leader: t.leader ? { id: t.leader.id, name: t.leader.name, image: t.leader.image } : null,
    members: t.members.map((m) => ({
      id: m.id,
      user: { id: m.user.id, name: m.user.name, image: m.user.image },
      musicianId: m.musicianId,
      instruments: m.instruments,
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

const TeamIdParamSchema = z.object({ id: z.uuid() })
const TeamMemberParamSchema = z.object({ id: z.uuid(), memberId: z.uuid() })

const TeamMemberInputSchema = z.object({
  userId: z.string().min(1),
})

const CreateTeamRequestSchema = z
  .object({
    name: z.string().min(1),
    teamLeaderId: z.string().min(1).optional(),
    members: z.array(TeamMemberInputSchema).optional(),
  })
  .refine(
    (data) => !data.members || new Set(data.members.map((m) => m.userId)).size === data.members.length,
    {
      error: "Duplicate members are not allowed.",
      path: ["members"],
    }
  )

const createTeamRoute = createRoute({
  method: "post",
  path: "/teams",
  operationId: "createTeam",
  tags: ["Teams"],
  summary: "Create a team",
  description: "Admin-only. Creates a new team, optionally with an initial roster, all in one transaction.",
  middleware: [requireAdmin] as const,
  request: {
    ...jsonBody(CreateTeamRequestSchema),
  },
  responses: {
    201: jsonResponse(TeamResponseSchema, "Team created."),
    401: commonErrors[401],
    403: commonErrors[403],
    422: commonErrors[422],
  },
})

const listTeamsRoute = createRoute({
  method: "get",
  path: "/teams",
  operationId: "listTeams",
  tags: ["Teams"],
  summary: "List teams",
  description:
    "Any authenticated user can list every team, alphabetically by name, each with its members and their current instruments.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(z.array(TeamResponseSchema), "Teams."),
    401: commonErrors[401],
  },
})

const getTeamRoute = createRoute({
  method: "get",
  path: "/teams/{id}",
  operationId: "getTeam",
  tags: ["Teams"],
  summary: "Get a team by id",
  description: "Any authenticated user can fetch a single team, with its members and their current instruments.",
  middleware: [requireAuth] as const,
  request: {
    params: TeamIdParamSchema,
  },
  responses: {
    200: jsonResponse(TeamResponseSchema, "Team."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const UpdateTeamRequestSchema = z.object({
  name: z.string().min(1).optional(),
  teamLeaderId: z.string().min(1).nullable().optional(),
})

const updateTeamRoute = createRoute({
  method: "patch",
  path: "/teams/{id}",
  operationId: "updateTeam",
  tags: ["Teams"],
  summary: "Update a team",
  description: "Admin-only. Updates a team's name and/or leader.",
  middleware: [requireAdmin] as const,
  request: {
    params: TeamIdParamSchema,
    ...jsonBody(UpdateTeamRequestSchema),
  },
  responses: {
    200: jsonResponse(TeamResponseSchema, "Team updated."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const deleteTeamRoute = createRoute({
  method: "delete",
  path: "/teams/{id}",
  operationId: "deleteTeam",
  tags: ["Teams"],
  summary: "Delete a team",
  description: "Admin-only. Deletes a team along with its membership rows.",
  middleware: [requireAdmin] as const,
  request: {
    params: TeamIdParamSchema,
  },
  responses: {
    204: { description: "Team deleted." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
  },
})

const AddTeamMemberRequestSchema = z.object({
  userId: z.string().min(1),
})

const addTeamMemberRoute = createRoute({
  method: "post",
  path: "/teams/{id}/members",
  operationId: "addTeamMember",
  tags: ["Teams"],
  summary: "Add a member to a team",
  description:
    "Admin-only. Adds an existing musician to a team. Idempotent - adding an existing member is a no-op. Returns the full, updated team.",
  middleware: [requireAdmin] as const,
  request: {
    params: TeamIdParamSchema,
    ...jsonBody(AddTeamMemberRequestSchema),
  },
  responses: {
    201: jsonResponse(TeamResponseSchema, "Member added."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const removeTeamMemberRoute = createRoute({
  method: "delete",
  path: "/teams/{id}/members/{memberId}",
  operationId: "removeTeamMember",
  tags: ["Teams"],
  summary: "Remove a member from a team",
  description: "Admin-only. Removes a member from a team - their musician profile is untouched.",
  middleware: [requireAdmin] as const,
  request: {
    params: TeamMemberParamSchema,
  },
  responses: {
    204: { description: "Member removed." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
  },
})

export const teamsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(createTeamRoute, async (c) => {
    const { name, teamLeaderId, members } = c.req.valid("json")

    try {
      const created = await createTeam({ name, teamLeaderId, members })

      // The plain `.returning()` row has no `leader` join - re-fetch through
      // getTeam so the response shape matches every other team endpoint.
      const withJoins = await getTeam(created.id)
      // createTeam just inserted this row a moment ago, so it's guaranteed
      // to still be there for this immediate follow-up fetch.
      return c.json(mapTeam(withJoins!), 201)
    } catch (err) {
      if (err instanceof TeamError && err.code === "MEMBER_NOT_A_MUSICIAN") {
        return c.json({ status: 422, message: err.message }, 422)
      }
      throw err
    }
  })
  .openapi(listTeamsRoute, async (c) => {
    const teams = await listTeams()
    return c.json(
      teams.map((t) => mapTeam(t)),
      200
    )
  })
  .openapi(getTeamRoute, async (c) => {
    const { id } = c.req.valid("param")
    const found = await getTeam(id)

    if (!found) {
      return c.json({ status: 404, message: "Team not found." }, 404)
    }

    return c.json(mapTeam(found), 200)
  })
  .openapi(updateTeamRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { name, teamLeaderId } = c.req.valid("json")
    const updated = await updateTeam(id, { name, teamLeaderId })

    if (!updated) {
      return c.json({ status: 404, message: "Team not found." }, 404)
    }

    // The plain `.returning()` row has no `leader`/`members` join -
    // re-fetch through getTeam so the response shape matches every other
    // team endpoint.
    const withJoins = await getTeam(id)
    // updateTeam just confirmed a row with this id exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapTeam(withJoins!), 200)
  })
  .openapi(deleteTeamRoute, async (c) => {
    const { id } = c.req.valid("param")
    const deleted = await deleteTeam(id)

    if (!deleted) {
      return c.json({ status: 404, message: "Team not found." }, 404)
    }

    return c.body(null, 204)
  })
  .openapi(addTeamMemberRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { userId } = c.req.valid("json")

    const existingTeam = await getTeam(id)
    if (!existingTeam) {
      return c.json({ status: 404, message: "Team not found." }, 404)
    }

    try {
      await addTeamMember(id, userId)
    } catch (err) {
      if (err instanceof TeamError && err.code === "MEMBER_NOT_A_MUSICIAN") {
        return c.json({ status: 422, message: err.message }, 422)
      }
      throw err
    }

    const updated = await getTeam(id)
    // existingTeam just confirmed this team exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapTeam(updated!), 201)
  })
  .openapi(removeTeamMemberRoute, async (c) => {
    const { id, memberId } = c.req.valid("param")

    const existingTeam = await getTeam(id)
    if (!existingTeam) {
      return c.json({ status: 404, message: "Team not found." }, 404)
    }
    const member = existingTeam.members.find((m) => m.id === memberId)
    if (!member) {
      return c.json({ status: 404, message: "Team member not found." }, 404)
    }

    await removeTeamMember(memberId)
    return c.body(null, 204)
  })
