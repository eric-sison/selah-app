import type { RequestContext } from "./types/request-context.js"
import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { cors } from "./middleware/cors.js"
import { logger } from "./middleware/logger.js"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import { auth } from "./lib/auth.js"
import { env } from "./utils/env.js"
import { authSession } from "./middleware/auth-session.js"
import { healthcheckHandler } from "./routes/health.js"
import { invitationsHandler } from "./routes/invitations.js"
import { songsHandler } from "./routes/songs.js"
import { teamsHandler } from "./routes/teams.js"
import { usersHandler } from "./routes/users.js"
import { errorHandler } from "./middleware/error-handler.js"
import { defaultHook, ErrorMessages } from "./utils/error-reponses.js"

export const openApiConfig = {
  openapi: "3.0.0",
  info: {
    title: "Selah API",
    description: "This API provides access to application resources and operations.",
    version: "1.0.0",
  },
} as const

export const app = new OpenAPIHono<RequestContext>({ defaultHook }).basePath("/api")

app.use(secureHeaders())
app.use(cors())
app.use(requestId())
app.use(logger())
app.use(authSession)

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw))

// Handle errors thrown globally
app.onError(errorHandler)
app.notFound((c) => c.json({ status: 404, message: ErrorMessages[404] }, 404))

const routes = [healthcheckHandler, invitationsHandler, songsHandler, teamsHandler, usersHandler] as const
routes.forEach((route) => app.route("/", route))

app.doc("/docs/spec", openApiConfig)

app.get(
  "/docs",
  Scalar({
    url: "/api/docs/spec",
    pageTitle: "Selah API",
    servers: [
      {
        url: `${env.HOST}:${env.PORT}`,
        description: "Local development server",
      },
    ],
  })
)
