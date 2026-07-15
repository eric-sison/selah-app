import { desc, eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { song } from "../db/app-schema.js"
import { deleteObject, getDownloadUrl, getStreamUrl, uploadObject } from "../lib/storage.js"

/**
 * Lowercases a filename and collapses any run of characters outside
 * `[a-z0-9.]` into a single `-`, trimming leading/trailing `-` - used to
 * build safe, readable object storage keys from user-supplied filenames
 * (e.g. `"Amazing Grace.mp3"` → `"amazing-grace.mp3"`).
 */
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

/**
 * Uploads a song's audio (and optional album art) to object storage and
 * creates its database row.
 *
 * Inserts a placeholder row first to obtain a DB-generated id, uses that id
 * to build the storage key(s) (`songs/{id}/...`), uploads the file(s), then
 * updates the row with the real key(s) - the id isn't known until after
 * insert, so the final key can't be included in that first insert.
 *
 * @returns the song row with its final storage key(s) written.
 */
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

/**
 * Lists songs, newest first, with offset-based pagination.
 *
 * When `query` is given, filters/orders by a spelling-tolerant match
 * (trigram similarity on title/artist, `OR`ed with a plain `ILIKE` so a
 * correctly-spelled partial match is never excluded by the similarity
 * floor) instead of returning the full library.
 *
 * @param options.query - optional search string; omit to list all songs.
 * @param options.cursor - row offset to start from (0 = first page).
 * @param options.limit - max rows to return; capped by callers at {@link MAX_SONGS_LIMIT}.
 * @returns `items` (at most `limit` rows) and `nextCursor` (offset for the
 *   next page, or `null` if this was the last page).
 */
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

/** Fetches a single song by id, joined with its uploader's id/name. */
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

/**
 * Updates a song's chord-over-lyric sheet.
 *
 * @returns the updated song (re-fetched with its uploader join, see below),
 *   or `undefined` if no song has this id.
 */
export async function updateSong(id: string, { chordpro }: UpdateSongInput) {
  const [updated] = await db.update(song).set({ chordpro }).where(eq(song.id, id)).returning()
  if (!updated) return undefined

  // The plain `.returning()` row has no `uploader` join - re-fetch through
  // `getSong` so the response shape matches every other song endpoint.
  return getSong(id)
}

/**
 * Signs a short-lived, plain playback URL (no `Content-Disposition`
 * override) for a song's audio file.
 *
 * @returns the signed URL, or `null` if no song has this id.
 */
export async function getSongStreamUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found) return null

  return getStreamUrl(found.storageKey)
}

/**
 * Signs a short-lived download URL (`Content-Disposition: attachment`) for
 * a song's audio file, so navigating to it saves the original file instead
 * of playing inline.
 *
 * @returns the signed URL, or `null` if no song has this id.
 */
export async function getSongDownloadUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found) return null

  return getDownloadUrl(found.storageKey, found.originalFileName)
}

/**
 * Signs a short-lived playback URL for a song's album art image.
 *
 * @returns the signed URL, or `null` if no song has this id or it has no album art.
 */
export async function getSongAlbumUrl(id: string): Promise<string | null> {
  const found = await db.query.song.findFirst({ where: eq(song.id, id) })
  if (!found || !found.albumArtStorageKey) return null

  return getStreamUrl(found.albumArtStorageKey)
}

/**
 * Deletes a song's database row and its audio/album-art objects in object
 * storage (the DB row goes first - see the inline comment below for why).
 *
 * @returns `true` if a song with this id was found and deleted, `false` otherwise.
 */
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
