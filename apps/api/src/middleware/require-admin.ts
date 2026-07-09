import type { RequestContext } from "../types/request-context.js"
import { createMiddleware } from "hono/factory"
import { ErrorMessages } from "../utils/error-reponses.js"

// Self-contained rather than composed with requireAuth, so a route that
// applies only requireAdmin still rejects unauthenticated requests properly
// instead of crashing on a null user.
export const requireAdmin = createMiddleware<RequestContext>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    return c.json({ status: 401, message: ErrorMessages[401] }, 401)
  }

  if (user.role !== "admin") {
    return c.json({ status: 403, message: ErrorMessages[403] }, 403)
  }

  await next()
})
