import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { instrument } from "../db/app-schema.js"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  createMusician,
  deleteMusician,
  getMusician,
  listMusicians,
  MusicianError,
  updateMusicianInstruments,
} from "../services/musicians.js"

const InstrumentSchema = z.enum(instrument.enumValues)

const MusicianResponseSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  instruments: z.array(InstrumentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// getMusician's relational `with` join is the single source of truth for
// this shape - reusing its inferred return type keeps this mapper (and
// every route below that calls getMusician) from drifting out of sync.
type MusicianWithUser = NonNullable<Awaited<ReturnType<typeof getMusician>>>

function mapMusician(m: MusicianWithUser) {
  return {
    id: m.id,
    user: { id: m.user.id, name: m.user.name, email: m.user.email, image: m.user.image },
    instruments: m.instruments,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

const MusicianIdParamSchema = z.object({ id: z.uuid() })

const CreateMusicianRequestSchema = z.object({
  userId: z.string().min(1),
  instruments: z.array(InstrumentSchema).optional(),
})

const createMusicianRoute = createRoute({
  method: "post",
  path: "/musicians",
  operationId: "createMusician",
  tags: ["Musicians"],
  summary: "Create a musician profile",
  description:
    "Admin-only. Creates a global musician profile for a user, with an optional initial set of instruments. A user can only have one profile.",
  middleware: [requireAdmin] as const,
  request: {
    ...jsonBody(CreateMusicianRequestSchema),
  },
  responses: {
    201: jsonResponse(MusicianResponseSchema, "Musician profile created."),
    401: commonErrors[401],
    403: commonErrors[403],
    409: commonErrors[409],
    422: commonErrors[422],
  },
})

const listMusiciansRoute = createRoute({
  method: "get",
  path: "/musicians",
  operationId: "listMusicians",
  tags: ["Musicians"],
  summary: "List musicians",
  description:
    "Any authenticated user can list every musician profile, alphabetically by name - used to populate the team member picker, among other places.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(z.array(MusicianResponseSchema), "Musicians."),
    401: commonErrors[401],
  },
})

const getMusicianRoute = createRoute({
  method: "get",
  path: "/musicians/{id}",
  operationId: "getMusician",
  tags: ["Musicians"],
  summary: "Get a musician profile by id",
  description: "Any authenticated user can fetch a single musician profile.",
  middleware: [requireAuth] as const,
  request: {
    params: MusicianIdParamSchema,
  },
  responses: {
    200: jsonResponse(MusicianResponseSchema, "Musician."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const UpdateMusicianRequestSchema = z.object({
  instruments: z.array(InstrumentSchema),
})

const updateMusicianRoute = createRoute({
  method: "patch",
  path: "/musicians/{id}",
  operationId: "updateMusician",
  tags: ["Musicians"],
  summary: "Update a musician's instruments",
  description: "Admin-only. Replaces a musician's full set of instruments.",
  middleware: [requireAdmin] as const,
  request: {
    params: MusicianIdParamSchema,
    ...jsonBody(UpdateMusicianRequestSchema),
  },
  responses: {
    200: jsonResponse(MusicianResponseSchema, "Musician updated."),
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    422: commonErrors[422],
  },
})

const deleteMusicianRoute = createRoute({
  method: "delete",
  path: "/musicians/{id}",
  operationId: "deleteMusician",
  tags: ["Musicians"],
  summary: "Delete a musician profile",
  description:
    "Admin-only. Deletes a musician's profile - refused (409) while they're still a member of any team, since team membership requires a musician profile; remove them from every team first.",
  middleware: [requireAdmin] as const,
  request: {
    params: MusicianIdParamSchema,
  },
  responses: {
    204: { description: "Musician profile deleted." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
    409: commonErrors[409],
  },
})

export const musiciansHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(createMusicianRoute, async (c) => {
    const { userId, instruments } = c.req.valid("json")

    try {
      const created = await createMusician({ userId, instruments })
      const withJoins = await getMusician(created.id)
      // createMusician just inserted this row a moment ago, so it's
      // guaranteed to still be there for this immediate follow-up fetch.
      return c.json(mapMusician(withJoins!), 201)
    } catch (err) {
      if (err instanceof MusicianError && err.code === "MUSICIAN_ALREADY_EXISTS") {
        return c.json({ status: 409, message: err.message }, 409)
      }
      throw err
    }
  })
  .openapi(listMusiciansRoute, async (c) => {
    const musicians = await listMusicians()
    return c.json(
      musicians.map((m) => mapMusician(m)),
      200
    )
  })
  .openapi(getMusicianRoute, async (c) => {
    const { id } = c.req.valid("param")
    const found = await getMusician(id)

    if (!found) {
      return c.json({ status: 404, message: "Musician not found." }, 404)
    }

    return c.json(mapMusician(found), 200)
  })
  .openapi(updateMusicianRoute, async (c) => {
    const { id } = c.req.valid("param")
    const { instruments } = c.req.valid("json")

    const existing = await getMusician(id)
    if (!existing) {
      return c.json({ status: 404, message: "Musician not found." }, 404)
    }

    await updateMusicianInstruments(id, instruments)

    const updated = await getMusician(id)
    // existing just confirmed this musician exists, so it can't have
    // vanished by the time this second query runs a moment later.
    return c.json(mapMusician(updated!), 200)
  })
  .openapi(deleteMusicianRoute, async (c) => {
    const { id } = c.req.valid("param")

    try {
      const deleted = await deleteMusician(id)
      if (!deleted) {
        return c.json({ status: 404, message: "Musician not found." }, 404)
      }
      return c.body(null, 204)
    } catch (err) {
      if (err instanceof MusicianError && err.code === "MUSICIAN_HAS_TEAM_MEMBERSHIPS") {
        return c.json({ status: 409, message: err.message }, 409)
      }
      throw err
    }
  })
