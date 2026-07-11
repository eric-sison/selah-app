import { desc, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { song } from "../db/app-schema.js"
import { uploadObject } from "../lib/storage.js"

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

export async function listSongs() {
  return db.query.song.findMany({
    orderBy: desc(song.createdAt),
    with: {
      uploader: {
        columns: { id: true, name: true },
      },
    },
  })
}
