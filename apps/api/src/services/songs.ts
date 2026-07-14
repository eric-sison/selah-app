import { desc, eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { song } from "../db/app-schema.js"
import { deleteObject, getDownloadUrl, getStreamUrl, uploadObject } from "../lib/storage.js"

function slugifyFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export interface CreateSongInput {
  title: string
  artist?: string
  musicalKey?: string
  tempo?: number
  album?: string
  releaseDate?: string
  originalFileName: string
  mimeType: string
  fileBuffer: Buffer
  albumArt?: {
    fileName: string
    mimeType: string
    buffer: Buffer
  }
  uploadedBy: string
}

export async function createSong({
  title,
  artist,
  musicalKey,
  tempo,
  album,
  releaseDate,
  originalFileName,
  mimeType,
  fileBuffer,
  albumArt,
  uploadedBy,
}: CreateSongInput) {
  // storageKey (and albumArtStorageKey) embed the DB-generated id, so the
  // row is inserted first (with a placeholder) and the real keys are
  // written back once known.
  const [inserted] = await db
    .insert(song)
    .values({
      title,
      artist,
      musicalKey,
      tempo,
      album,
      releaseDate,
      storageKey: "",
      originalFileName,
      mimeType,
      fileSizeBytes: fileBuffer.byteLength,
      uploadedBy,
    })
    .returning()

  const storageKey = `songs/${inserted.id}/${slugifyFileName(originalFileName)}`
  await uploadObject(storageKey, fileBuffer, mimeType)

  let albumArtStorageKey: string | null = null
  if (albumArt) {
    albumArtStorageKey = `songs/${inserted.id}/album-art-${slugifyFileName(albumArt.fileName)}`
    await uploadObject(albumArtStorageKey, albumArt.buffer, albumArt.mimeType)
  }

  const [updated] = await db
    .update(song)
    .set({ storageKey, albumArtStorageKey })
    .where(eq(song.id, inserted.id))
    .returning()

  return updated
}

const SEARCH_SIMILARITY_THRESHOLD = 0.2

export const DEFAULT_SONGS_LIMIT = 10
export const MAX_SONGS_LIMIT = 100

export interface ListSongsOptions {
  query?: string
  cursor?: number
  limit?: number
}

export async function listSongs({ query, cursor = 0, limit = DEFAULT_SONGS_LIMIT }: ListSongsOptions = {}) {
  const withUploader = { uploader: { columns: { id: true, name: true } as const } }

  // Fetches one extra row so `hasMore`/`nextCursor` can be derived without a
  // separate COUNT query.
  const rows = query
    ? await (() => {
        // Trigram similarity (via the pg_trgm indexes on title/artist)
        // tolerates misspellings; ILIKE is kept alongside it so a
        // correctly-spelled partial match (e.g. a short prefix) is never
        // excluded by the similarity floor.
        const bestSimilarity = sql<number>`greatest(similarity(${song.title}, ${query}), similarity(coalesce(${song.artist}, ''), ${query}))`
        const likeQuery = `%${query}%`

        return db.query.song.findMany({
          where: sql`${bestSimilarity} > ${SEARCH_SIMILARITY_THRESHOLD} OR ${song.title} ILIKE ${likeQuery} OR ${song.artist} ILIKE ${likeQuery}`,
          orderBy: [desc(bestSimilarity), desc(song.createdAt)],
          limit: limit + 1,
          offset: cursor,
          with: withUploader,
        })
      })()
    : await db.query.song.findMany({
        orderBy: desc(song.createdAt),
        limit: limit + 1,
        offset: cursor,
        with: withUploader,
      })

  const hasMore = rows.length > limit
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    nextCursor: hasMore ? cursor + limit : null,
  }
}

export async function getSong(id: string) {
  return db.query.song.findFirst({
    where: eq(song.id, id),
    with: {
      uploader: {
        columns: { id: true, name: true },
      },
    },
  })
}

export interface UpdateSongInput {
  chordpro: string | null
}

export async function updateSong(id: string, { chordpro }: UpdateSongInput) {
  const [updated] = await db.update(song).set({ chordpro }).where(eq(song.id, id)).returning()
  if (!updated) return undefined

  // The plain `.returning()` row has no `uploader` join - re-fetch through
  // `getSong` so the response shape matches every other song endpoint.
  return getSong(id)
}

export async function getSongStreamUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found) return null

  return getStreamUrl(found.storageKey)
}

export async function getSongDownloadUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found) return null

  return getDownloadUrl(found.storageKey, found.originalFileName)
}

export async function getSongAlbumUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found || !found.albumArtStorageKey) return null

  return getStreamUrl(found.albumArtStorageKey)
}

export async function deleteSong(id: string): Promise<boolean> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found) return false

  // Delete the DB row first - an orphaned storage object left behind by a
  // failed cleanup is harmless, but a DB row surviving with no backing file
  // would 404 the next time someone tries to stream or download it.
  await db.delete(song).where(eq(song.id, id))

  await deleteObject(found.storageKey)
  if (found.albumArtStorageKey) {
    await deleteObject(found.albumArtStorageKey)
  }

  return true
}
