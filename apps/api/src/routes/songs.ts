import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { RequestContext } from "../types/request-context.js"
import { requireAdmin } from "../middleware/require-admin.js"
import { requireAuth } from "../middleware/require-auth.js"
import { commonErrors, defaultHook, jsonResponse } from "../utils/error-reponses.js"
import {
  createSong,
  deleteSong,
  getSongAlbumUrl,
  getSongDownloadUrl,
  getSongStreamUrl,
  listSongs,
} from "../services/songs.js"

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
  hasAlbumArt: z.boolean(),
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

const SignedUrlResponseSchema = z.object({
  url: z.string(),
})

const getSongStreamUrlRoute = createRoute({
  method: "get",
  path: "/songs/{id}/stream-url",
  operationId: "getSongStreamUrl",
  tags: ["Songs"],
  summary: "Get a temporary playback URL for a song",
  description:
    "Any authenticated user can request a short-lived, signed URL for streaming a song's audio file directly from storage.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: jsonResponse(SignedUrlResponseSchema, "Signed playback URL."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const getSongDownloadUrlRoute = createRoute({
  method: "get",
  path: "/songs/{id}/download-url",
  operationId: "getSongDownloadUrl",
  tags: ["Songs"],
  summary: "Get a temporary download URL for a song",
  description:
    "Any authenticated user can request a short-lived, signed URL for downloading a song's original audio file.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: jsonResponse(SignedUrlResponseSchema, "Signed download URL."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const getSongAlbumUrlRoute = createRoute({
  method: "get",
  path: "/songs/{id}/album-url",
  operationId: "getSongAlbumUrl",
  tags: ["Songs"],
  summary: "Get a temporary URL for a song's album art",
  description:
    "Any authenticated user can request a short-lived, signed URL for a song's album art image, if one was uploaded.",
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: jsonResponse(SignedUrlResponseSchema, "Signed album art URL."),
    401: commonErrors[401],
    404: commonErrors[404],
  },
})

const deleteSongRoute = createRoute({
  method: "delete",
  path: "/songs/{id}",
  operationId: "deleteSong",
  tags: ["Songs"],
  summary: "Delete a song",
  description:
    "Admin-only. Deletes the song's database record and its audio file and album art (if any) from storage.",
  middleware: [requireAdmin] as const,
  request: {
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    204: { description: "Song deleted." },
    401: commonErrors[401],
    403: commonErrors[403],
    404: commonErrors[404],
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
        hasAlbumArt: created.albumArtStorageKey !== null,
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
        hasAlbumArt: s.albumArtStorageKey !== null,
        uploader: { id: s.uploader.id, name: s.uploader.name },
        createdAt: s.createdAt.toISOString(),
      })),
      200
    )
  })
  .openapi(getSongStreamUrlRoute, async (c) => {
    const { id } = c.req.valid("param")
    const url = await getSongStreamUrl(id)

    if (!url) {
      return c.json({ status: 404, message: "Song not found." }, 404)
    }

    return c.json({ url }, 200)
  })
  .openapi(getSongDownloadUrlRoute, async (c) => {
    const { id } = c.req.valid("param")
    const url = await getSongDownloadUrl(id)

    if (!url) {
      return c.json({ status: 404, message: "Song not found." }, 404)
    }

    return c.json({ url }, 200)
  })
  .openapi(getSongAlbumUrlRoute, async (c) => {
    const { id } = c.req.valid("param")
    const url = await getSongAlbumUrl(id)

    if (!url) {
      return c.json({ status: 404, message: "Song or album art not found." }, 404)
    }

    return c.json({ url }, 200)
  })
  .openapi(deleteSongRoute, async (c) => {
    const { id } = c.req.valid("param")
    const deleted = await deleteSong(id)

    if (!deleted) {
      return c.json({ status: 404, message: "Song not found." }, 404)
    }

    return c.body(null, 204)
  })
