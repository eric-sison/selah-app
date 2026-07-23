import type { RequestContext } from "../types/request-context.js"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { env } from "../utils/env.js"

// Gates the stem-worker's completion callback - it isn't a logged-in user,
// so this checks a static shared secret instead of requireAuth's session
// check. Kept separate from the per-job callbackToken check in
// completeStemSeparation(), which additionally scopes a callback to the
// specific job it belongs to.
export const requireWorkerSecret = createMiddleware<RequestContext>(async (c, next) => {
  const header = c.req.header("Authorization")
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null

  if (!token || token !== env.STEM_CALLBACK_SECRET) {
    throw new HTTPException(401)
  }

  await next()
})
