import type { RequestContext } from "./types/request-context.js"
import { serve } from "@hono/node-server"
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

const app = new OpenAPIHono<RequestContext>().basePath("/api")

app.use(secureHeaders())
app.use(cors())
app.use(requestId())
app.use(logger())
app.use(authSession)

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw))

const routes = [healthcheckHandler, invitationsHandler] as const
routes.forEach((route) => app.route("/", route))

app.doc("/docs/spec", {
  openapi: "3.0.0",
  info: {
    title: "Selah API",
    description:
      "This API provides access to application resources and operations.",
    version: "1.0.0",
  },
})

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

serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  }
)
