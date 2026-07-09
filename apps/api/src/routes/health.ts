import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"

export const HealthCheckResponseSchema = z.object({
  status: z.number().openapi({
    description: "HTTP status code, duplicated from the response status.",
    example: 200,
  }),
  message: z.string().openapi({
    description: "Human-readable summary of the health check result.",
    example: "Service is healthy and running.",
  }),
  code: z.string().openapi({
    description: "Machine-readable status code.",
    example: "OK",
  }),
})

const healthCheckRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["Health"],
  summary: "Liveness check",
  description:
    "Confirms the API process is up and able to respond to requests. " +
    "This does not verify downstream dependencies (database, SMTP, etc.) " +
    "so a 200 here does not guarantee those are reachable.",
  request: {},
  responses: {
    200: jsonResponse(
      HealthCheckResponseSchema,
      "Service is healthy and running.",
      {
        status: 200,
        message: "Service is healthy and running.",
        code: "OK",
      }
    ),
    500: commonErrors[500],
  },
})

export const healthcheckHandler = new OpenAPIHono<RequestContext>({ defaultHook }).openapi(
  healthCheckRoute,
  (c) => {
    return c.json({
      status: 200,
      message: "Service is healthy and running.",
      code: "OK",
    })
  }
)
