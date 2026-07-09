import type { RequestContext } from "../types/request-context.js"
import { auth } from "../lib/auth.js"
import { createMiddleware } from "hono/factory"

// Session resolution failures fall through as unauthenticated rather than
// rejecting the request, since route handlers are responsible for enforcing
// auth on the routes that need it.
export const authSession = createMiddleware<RequestContext>(async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    c.set("user", session?.user ?? null)
    c.set("session", session?.session ?? null)
  } catch (err) {
    c.var.logger.warn({
      msg: "Failed to resolve auth session",
      requestId: c.get("requestId"),
      err,
    })

    c.set("user", null)
    c.set("session", null)
  }

  await next()
})
