import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { commonErrors, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  createInvitation,
  getValidInvitationByToken,
  InvitationError,
} from "../services/invitations.js"

const CreateInvitationRequestSchema = z.object({
  email: z.email(),
})

const InvitationResponseSchema = z.object({
  email: z.string(),
  expiresAt: z.string(),
})

const createInvitationRoute = createRoute({
  method: "post",
  path: "/invitations",
  operationId: "createInvitation",
  tags: ["Invitations"],
  summary: "Invite a new user",
  description:
    "Admin-only. Generates an invitation link (valid for 2 hours) and " + "emails it to the given address.",
  middleware: [requireAdmin] as const,
  request: {
    ...jsonBody(CreateInvitationRequestSchema),
  },
  responses: {
    201: jsonResponse(InvitationResponseSchema, "Invitation created."),
    401: commonErrors[401],
    403: commonErrors[403],
    409: commonErrors[409],
    422: commonErrors[422],
  },
})

const getInvitationRoute = createRoute({
  method: "get",
  path: "/invitations/{token}",
  operationId: "getInvitation",
  tags: ["Invitations"],
  summary: "Look up an invitation by token",
  description:
    "Public. Used by the sign-up page to check whether a token is still " + "valid before showing the form.",
  request: {
    params: z.object({ token: z.string() }),
  },
  responses: {
    200: jsonResponse(InvitationResponseSchema, "Invitation is valid."),
    404: commonErrors[404],
  },
})

export const invitationsHandler = new OpenAPIHono<RequestContext>()
  .openapi(createInvitationRoute, async (c) => {
    // requireAdmin guarantees this is non-null.
    const user = c.get("user")!
    const { email } = c.req.valid("json")

    try {
      const created = await createInvitation({ email, invitedBy: user.id })
      return c.json({ email: created.email, expiresAt: created.expiresAt.toISOString() }, 201)
    } catch (err) {
      if (err instanceof InvitationError && err.code === "USER_ALREADY_EXISTS") {
        return c.json({ status: 409, message: err.message }, 409)
      }
      throw err
    }
  })
  .openapi(getInvitationRoute, async (c) => {
    const { token } = c.req.valid("param")
    const found = await getValidInvitationByToken(token)

    if (!found) {
      return c.json({ status: 404, message: "Invitation not found or expired." }, 404)
    }

    return c.json({ email: found.email, expiresAt: found.expiresAt.toISOString() }, 200)
  })
