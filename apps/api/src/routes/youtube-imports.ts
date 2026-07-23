import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { RequestContext } from "../types/request-context.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonBody, jsonResponse } from "../utils/error-reponses.js"
import {
  fetchYoutubeImportMetadata,
  getYoutubeImportStatus,
  startYoutubeImport,
} from "../services/youtube-imports.js"

const MAX_ALBUM_ART_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_ALBUM_ART_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

const YoutubeMetadataResponseSchema = z.object({
  title: z.string(),
  durationSeconds: z.number(),
  thumbnailUrl: z.string().nullable(),
})

const fetchYoutubeMetadataRoute = createRoute({
  method: "post",
  path: "/youtube-imports/metadata",
  operationId: "fetchYoutubeImportMetadata",
  tags: ["Songs"],
  summary: "Preview a YouTube video's title/duration/thumbnail",
  description:
    "Any authenticated user can look up a YouTube video's details before importing it - doesn't download or convert anything.",
  middleware: [requireAuth] as const,
  request: jsonBody(z.object({ url: z.url() })),
  responses: {
    200: jsonResponse(YoutubeMetadataResponseSchema, "Video details."),
    401: commonErrors[401],
    422: commonErrors[422],
  },
})

const StartYoutubeImportFormSchema = z.object({
  youtubeUrl: z.url(),
  title: z.string().min(1),
  artist: z.string().optional(),
  musicalKey: z.string().optional(),
  tempo: z.coerce.number().int().positive().optional(),
  album: z.string().optional(),
  releaseDate: z.iso.date().optional(),
  albumArt: z
    .file()
    .mime(ALLOWED_ALBUM_ART_MIME_TYPES)
    .max(MAX_ALBUM_ART_SIZE_BYTES)
    .openapi({ type: "string", format: "binary" })
    .optional(),
})

const YoutubeImportJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "downloading", "completed", "failed"]),
  errorMessage: z.string().nullable(),
  songId: z.string().nullable(),
})

const startYoutubeImportRoute = createRoute({
  method: "post",
  path: "/youtube-imports",
  operationId: "startYoutubeImport",
  tags: ["Songs"],
  summary: "Import a song from a YouTube URL",
  description:
    "Any authenticated user can start a background job that downloads a YouTube video's audio, converts it to mp3, and adds it to the song bank exactly like a manual upload. Poll GET /youtube-imports/{id} for progress.",
  middleware: [requireAuth, bodyLimit({ maxSize: MAX_ALBUM_ART_SIZE_BYTES + 1024 * 1024 })] as const,
  request: {
    body: {
      content: { "multipart/form-data": { schema: StartYoutubeImportFormSchema } },
      required: true,
    },
  },
  responses: {
    202: jsonResponse(YoutubeImportJobResponseSchema, "Import job started."),
    401: commonErrors[401],
    413: commonErrors[413],
    422: commonErrors[422],
  },
})

const getYoutubeImportStatusRoute = createRoute({
  method: "get",
  path: "/youtube-imports/{id}",
  operationId: "getYoutubeImportStatus",
  tags: ["Songs"],
  summary: "Get a YouTube import job's status",
  description: "Any authenticated user can poll a YouTube import job's progress.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: jsonResponse(YoutubeImportJobResponseSchema, "Current import status."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

type YoutubeImportJobStatus = "pending" | "downloading" | "completed" | "failed"

interface YoutubeImportJobRow {
  id: string
  status: YoutubeImportJobStatus
  errorMessage: string | null
  songId: string | null
}

function toJobResponse(job: YoutubeImportJobRow) {
  return { id: job.id, status: job.status, errorMessage: job.errorMessage, songId: job.songId }
}

export const youtubeImportsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(fetchYoutubeMetadataRoute, async (c) => {
    const { url } = c.req.valid("json")

    try {
      const metadata = await fetchYoutubeImportMetadata(url)
      return c.json(metadata, 200)
    } catch (err) {
      return c.json(
        { status: 422, message: err instanceof Error ? err.message : "Failed to fetch video details." },
        422
      )
    }
  })
  .openapi(startYoutubeImportRoute, async (c) => {
    const { albumArt, ...body } = c.req.valid("form")
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!

    const job = await startYoutubeImport({
      ...body,
      albumArt: albumArt
        ? { fileName: albumArt.name, mimeType: albumArt.type, buffer: Buffer.from(await albumArt.arrayBuffer()) }
        : undefined,
      requestedBy: user.id,
    })
    if (!job) {
      return c.json({ status: 422, message: "Only YouTube URLs are supported." }, 422)
    }

    return c.json(toJobResponse(job), 202)
  })
  .openapi(getYoutubeImportStatusRoute, async (c) => {
    const { id } = c.req.valid("param")

    const job = await getYoutubeImportStatus(id)
    if (!job) {
      return c.json({ status: 404, message: "No YouTube import job found with this id." }, 404)
    }

    return c.json(toJobResponse(job), 200)
  })
