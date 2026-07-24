import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  createInvitation,
  getValidInvitationByToken,
  InvitationError,
  listPendingInvitations,
  revokeInvitation,
} from "../services/invitations.js"

const CreateInvitationRequestSchema = z.object({
  email: z.email(),
})

const InvitationResponseSchema = z.object({
  email: z.string(),
  expiresAt: z.string(),
})

const PendingInvitationResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  invitedBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
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

const listInvitationsRoute = createRoute({
  method: "get",
  path: "/invitations",
  operationId: "listInvitations",
  tags: ["Invitations"],
  summary: "List pending invitations",
  description: "Admin-only. Lists every invitation that hasn't been accepted or expired yet, newest first.",
  middleware: [requireAdmin] as const,
  responses: {
    200: jsonResponse(z.array(PendingInvitationResponseSchema), "Pending invitations."),
    401: commonErrors[401],
    403: commonErrors[403],
  },
})

const revokeInvitationRoute = createRoute({
  method: "delete",
  path: "/invitations/{id}",
  operationId: "revokeInvitation",
  tags: ["Invitations"],
  summary: "Revoke a pending invitation",
  description: "Admin-only. Deletes an invitation so its link stops working.",
  middleware: [requireAdmin] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    204: { description: "Invitation revoked." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
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

export const invitationsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
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
  .openapi(listInvitationsRoute, async (c) => {
    const invitations = await listPendingInvitations()
    return c.json(
      invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedBy: { id: i.invitedByUser.id, name: i.invitedByUser.name },
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
      200
    )
  })
  .openapi(revokeInvitationRoute, async (c) => {
    const { id } = c.req.valid("param")
    const revoked = await revokeInvitation(id)

    if (!revoked) {
      return c.json({ status: 404, message: "Invitation not found." }, 404)
    }

    return c.body(null, 204)
  })
