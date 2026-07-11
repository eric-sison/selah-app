import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { RequestContext } from "../types/request-context.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"
import { createSong, listSongs } from "../services/songs.js"

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg", "audio/flac"]

const MAX_ALBUM_ART_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_ALBUM_ART_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

const CreateSongFormSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  musicalKey: z.string().optional(),
  tempo: z.coerce.number().int().positive().optional(),
  album: z.string().optional(),
  releaseDate: z.iso.date().optional(),
  file: z
    .file()
    .mime(ALLOWED_MIME_TYPES)
    .max(MAX_FILE_SIZE_BYTES)
    .openapi({ type: "string", format: "binary" }),
  albumArt: z
    .file()
    .mime(ALLOWED_ALBUM_ART_MIME_TYPES)
    .max(MAX_ALBUM_ART_SIZE_BYTES)
    .openapi({ type: "string", format: "binary" })
    .optional(),
})

const SongResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  musicalKey: z.string().nullable(),
  tempo: z.number().nullable(),
  album: z.string().nullable(),
  releaseDate: z.string().nullable(),
  originalFileName: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
  uploader: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
})

const createSongRoute = createRoute({
  method: "post",
  path: "/songs",
  operationId: "createSong",
  tags: ["Songs"],
  summary: "Upload a song",
  description: "Any authenticated user can upload a song's audio file and basic metadata.",
  middleware: [
    requireAuth,
    bodyLimit({ maxSize: MAX_FILE_SIZE_BYTES + MAX_ALBUM_ART_SIZE_BYTES + 1024 * 1024 }),
  ] as const,
  request: {
    body: {
      content: { "multipart/form-data": { schema: CreateSongFormSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(SongResponseSchema, "Song uploaded."),
    401: commonErrors[401],
    413: commonErrors[413],
    422: commonErrors[422],
  },
})

const listSongsRoute = createRoute({
  method: "get",
  path: "/songs",
  operationId: "listSongs",
  tags: ["Songs"],
  summary: "List uploaded songs",
  description: "Any authenticated user can list all uploaded songs.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonResponse(z.array(SongResponseSchema), "List of songs."),
    401: commonErrors[401],
  },
})

export const songsHandler = new OpenAPIHono<RequestContext>({ defaultHook })
  .openapi(createSongRoute, async (c) => {
    // requireAuth guarantees this is non-null.
    const user = c.get("user")!
    const { title, artist, musicalKey, tempo, album, releaseDate, file, albumArt } = c.req.valid("form")

    const created = await createSong({
      title,
      artist,
      musicalKey,
      tempo,
      album,
      releaseDate,
      originalFileName: file.name,
      mimeType: file.type,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      albumArt: albumArt
        ? {
            fileName: albumArt.name,
            mimeType: albumArt.type,
            buffer: Buffer.from(await albumArt.arrayBuffer()),
          }
        : undefined,
      uploadedBy: user.id,
    })

    return c.json(
      {
        id: created.id,
        title: created.title,
        artist: created.artist,
        musicalKey: created.musicalKey,
        tempo: created.tempo,
        album: created.album,
        releaseDate: created.releaseDate,
        originalFileName: created.originalFileName,
        mimeType: created.mimeType,
        fileSizeBytes: created.fileSizeBytes,
        uploader: { id: user.id, name: user.name },
        createdAt: created.createdAt.toISOString(),
      },
      201
    )
  })
  .openapi(listSongsRoute, async (c) => {
    const songs = await listSongs()

    return c.json(
      songs.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        musicalKey: s.musicalKey,
        tempo: s.tempo,
        album: s.album,
        releaseDate: s.releaseDate,
        originalFileName: s.originalFileName,
        mimeType: s.mimeType,
        fileSizeBytes: s.fileSizeBytes,
        uploader: { id: s.uploader.id, name: s.uploader.name },
        createdAt: s.createdAt.toISOString(),
      })),
      200
    )
  })
