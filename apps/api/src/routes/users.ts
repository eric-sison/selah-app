import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"
import { listUsers } from "../services/users.js"

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
})

const listUsersRoute = createRoute({
  method: "get",
  path: "/users",
  operationId: "listUsers",
  tags: ["Users"],
  summary: "List users",
  description:
    "Admin-only. Lists every user, alphabetically by name - used to populate the musician and team-leader pickers when creating or editing a team.",
  middleware: [requireAdmin] as const,
  responses: {
    200: jsonResponse(z.array(UserResponseSchema), "Users."),
    401: commonErrors[401],
    403: commonErrors[403],
  },
})

export const usersHandler = new OpenAPIHono<RequestContext>({ defaultHook }).openapi(
  listUsersRoute,
  async (c) => {
    const users = await listUsers()
    return c.json(users, 200)
  }
)
