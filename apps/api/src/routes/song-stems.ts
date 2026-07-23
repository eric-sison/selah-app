import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RequestContext } from "../types/request-context.js"
import { requireAuth } from "../middleware/require-auth.js"
import { requireWorkerSecret } from "../middleware/require-worker-secret.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  completeStemSeparation,
  getStemStatus,
  getStemStreamUrls,
  startStemSeparation,
} from "../services/song-stems.js"

const StemUrlsSchema = z.object({
  vocals: z.string(),
  drums: z.string(),
  bass: z.string(),
  guitar: z.string(),
  piano: z.string(),
  other: z.string(),
})

const StemStatusResponseSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  errorMessage: z.string().nullable(),
  urls: StemUrlsSchema.nullable(),
})

const startStemSeparationRoute = createRoute({
  method: "post",
  path: "/songs/{id}/stems",
  operationId: "startStemSeparation",
  tags: ["Songs"],
  summary: "Split a song into stems",
  description:
    "Any authenticated user can request a song's audio be separated into vocals, drums, bass, guitar, piano, and other instruments (via a self-hosted Demucs worker). Requesting again - whether already in progress, previously failed, or already completed - restarts the job and replaces any existing result.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    202: jsonResponse(StemStatusResponseSchema, "Separation job started."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const getStemStatusRoute = createRoute({
  method: "get",
  path: "/songs/{id}/stems",
  operationId: "getStemStatus",
  tags: ["Songs"],
  summary: "Get a song's stem separation status",
  description:
    "Any authenticated user can check the status of a song's stem separation job, and get short-lived signed playback URLs for its 6 stems once it has completed.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: jsonResponse(StemStatusResponseSchema, "Current separation status."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const StemCallbackBodySchema = z.union([
  z.object({ callbackToken: z.string(), stems: StemUrlsSchema }),
  z.object({ callbackToken: z.string(), error: z.string() }),
])

const stemSeparationCallbackRoute = createRoute({
  method: "post",
  path: "/songs/{id}/stems/callback",
  operationId: "stemSeparationCallback",
  tags: ["Songs"],
  summary: "Worker callback: report a stem separation job's outcome",
  description:
    "Called by the stem separation worker, not an end user, once a job finishes - either with the 6 uploaded stem storage keys, or an error message. Authenticated with a shared secret rather than a user session.",
  middleware: [requireWorkerSecret] as const,
  request: {
    params: z.object({ id: z.uuid() }),
    ...jsonBody(StemCallbackBodySchema),
  },
  responses: {
    204: { description: "Job outcome recorded." },
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

type StemJobStatus = "pending" | "processing" | "completed" | "failed"

/** Shapes a job row into the shared status-response body. */
async function toStemStatusResponse(
  songId: string,
  job: { status: StemJobStatus; errorMessage: string | null }
) {
  const urls = job.status === "completed" ? await getStemStreamUrls(songId) : null
  return { status: job.status, errorMessage: job.errorMessage, urls }
}

export const songStemsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(startStemSeparationRoute, async (c) => {
    const { id } = c.req.valid("param")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const job = await startStemSeparation(id, user.id)
    if (!job) {
      return c.json({ status: 404, message: "Song not found." }, 404)
    }

    return c.json(await toStemStatusResponse(id, job), 202)
  })
  .openapi(getStemStatusRoute, async (c) => {
    const { id } = c.req.valid("param")
    const job = await getStemStatus(id)

    if (!job) {
      return c.json({ status: 404, message: "No stem separation has been requested for this song." }, 404)
    }

    return c.json(await toStemStatusResponse(id, job), 200)
  })
  .openapi(stemSeparationCallbackRoute, async (c) => {
    const { id } = c.req.valid("param")
    const body = c.req.valid("json")

    const updated = await completeStemSeparation({ songId: id, ...body })
    if (!updated) {
      return c.json({ status: 404, message: "No matching stem separation job found." }, 404)
    }

    return c.body(null, 204)
  })
