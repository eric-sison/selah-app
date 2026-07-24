import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"
import { getUsageStatsForUser } from "../services/usage.js"

const UsageStatsResponseSchema = z.object({
  songCount: z.number(),
  totalStorageBytes: z.number(),
  completedStemsCount: z.number(),
  youtubeImportsCount: z.number(),
})

const getMyUsageRoute = createRoute({
  method: "get",
  path: "/usage/me",
  operationId: "getMyUsage",
  tags: ["Usage"],
  summary: "Get the caller's own library usage stats",
  description:
    "Any authenticated user can fetch their own aggregate usage: songs uploaded, total storage used, " +
    "completed stem separations, and YouTube imports. Always scoped to the caller - there is no way to " +
    "read another user's usage through this endpoint.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(UsageStatsResponseSchema, "Usage stats."),
    401: commonErrors[401],
  },
})

export const usageHandler = new OpenAPIHono<RequestContext>({ defaultHook }).openapi(
  getMyUsageRoute,
  async (c) => {
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!
    const stats = await getUsageStatsForUser(user.id)
    return c.json(stats, 200)
  }
)
