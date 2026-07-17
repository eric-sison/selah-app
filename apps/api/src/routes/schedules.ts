import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { scheduleLineupRole, scheduleType } from "../db/app-schema.js"
import type { RequestContext } from "../types/request-context.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"
import { listSchedules } from "../services/schedules.js"

const ScheduleTypeSchema = z.enum(scheduleType.enumValues)
const ScheduleLineupRoleSchema = z.enum(scheduleLineupRole.enumValues)

const ScheduleResponseSchema = z.object({
  id: z.string(),
  type: ScheduleTypeSchema,
  // Which of a lineup's two calendar slots this is, when it's tied to one -
  // null for a standalone entry (see scheduleLineupRole's comment).
  lineupRole: ScheduleLineupRoleSchema.nullable(),
  title: z.string().nullable(),
  startAt: z.string(),
  lineup: z.object({ id: z.string(), seriesName: z.string(), topic: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// listSchedules' relational `with` join is the single source of truth for
// this shape - reusing its inferred element type keeps this mapper from
// drifting out of sync with it.
type ScheduleWithJoins = Awaited<ReturnType<typeof listSchedules>>[number]

function mapSchedule(s: ScheduleWithJoins) {
  return {
    id: s.id,
    type: s.type,
    lineupRole: s.lineupRole,
    title: s.title,
    startAt: s.startAt.toISOString(),
    lineup: s.lineup ? { id: s.lineup.id, seriesName: s.lineup.seriesName, topic: s.lineup.topic } : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

const listSchedulesRoute = createRoute({
  method: "get",
  path: "/schedules",
  operationId: "listSchedules",
  tags: ["Schedules"],
  summary: "List schedules",
  description:
    "Any authenticated user can list every schedule entry, ordered by when it happens, each joined with its lineup (if any).",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(z.array(ScheduleResponseSchema), "Schedules."),
    401: commonErrors[401],
  },
})

export const schedulesHandler = new OpenAPIHono<RequestContext>({ defaultHook }).openapi(
  listSchedulesRoute,
  async (c) => {
    const schedules = await listSchedules()
    return c.json(
      schedules.map((s) => mapSchedule(s)),
      200
    )
  }
)
