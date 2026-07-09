import type { RequestContext } from "../types/request-context.js"
import { createMiddleware } from "hono/factory"
import { ErrorMessages } from "../utils/error-reponses.js"

export const requireAuth = createMiddleware<RequestContext>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    return c.json({ status: 401, message: ErrorMessages[401] }, 401)
  }

  await next()
})
