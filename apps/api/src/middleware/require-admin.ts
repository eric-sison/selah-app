import type { RequestContext } from "../types/request-context.js"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"

// Self-contained rather than composed with requireAuth, so a route that
// applies only requireAdmin still rejects unauthenticated requests properly
// instead of crashing on a null user.
export const requireAdmin = createMiddleware<RequestContext>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    throw new HTTPException(401)
  }

  if (user.role !== "admin") {
    throw new HTTPException(403)
  }

  await next()
})
