import type { RequestContext } from "../types/request-context.js"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"

export const requireAuth = createMiddleware<RequestContext>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    throw new HTTPException(401)
  }

  await next()
})
