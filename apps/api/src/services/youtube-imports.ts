import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { youtubeImportJob } from "../db/app-schema.js"
import { downloadYoutubeAudioAsMp3, fetchYoutubeMetadata, isAllowedYoutubeUrl } from "../lib/youtube.js"
import { createSong } from "./songs.js"

/** Fetches a YouTube video's title/duration/thumbnail without downloading it. */
export async function fetchYoutubeImportMetadata(url: string) {
  return fetchYoutubeMetadata(url)
}

export interface StartYoutubeImportInput {
  youtubeUrl: string
  title: string
  artist?: string
  musicalKey?: string
  tempo?: number
  album?: string
  releaseDate?: string
  albumArt?: {
    fileName: string
    mimeType: string
    buffer: Buffer
  }
  requestedBy: string
}

/**
 * Kicks off a YouTube-to-mp3 import as a background job.
 *
 * Inserts a "pending" job row and returns it immediately - the actual
 * download/conversion/upload happens in `processYoutubeImport`, deliberately
 * not awaited here (mirrors startStemSeparation firing its worker request
 * without blocking the response). Progress is tracked by polling
 * `getYoutubeImportStatus`.
 *
 * @returns the job row, or `null` if `youtubeUrl` isn't a supported YouTube URL.
 */
export async function startYoutubeImport(input: StartYoutubeImportInput) {
  if (!isAllowedYoutubeUrl(input.youtubeUrl)) return null

  const [job] = await db
    .insert(youtubeImportJob)
    .values({
      youtubeUrl: input.youtubeUrl,
      videoTitle: input.title,
      status: "pending",
      requestedBy: input.requestedBy,
    })
    .returning()

  void processYoutubeImport(job.id, input)

  return job
}

/**
 * Downloads, converts, and uploads a YouTube video's audio, creating its
 * song row exactly like a manual upload (see `createSong`), then records the
 * outcome on the job row. Errors are caught and recorded rather than thrown,
 * since this runs unawaited in the background - there's no caller left to
 * propagate a rejection to.
 */
async function processYoutubeImport(jobId: string, input: StartYoutubeImportInput): Promise<void> {
  let scratchDir: string | null = null

  try {
    await db.update(youtubeImportJob).set({ status: "downloading" }).where(eq(youtubeImportJob.id, jobId))

    scratchDir = await mkdtemp(path.join(os.tmpdir(), "yt-import-"))
    const mp3Path = await downloadYoutubeAudioAsMp3(input.youtubeUrl, scratchDir)
    const fileBuffer = await readFile(mp3Path)

    const created = await createSong({
      title: input.title,
      artist: input.artist,
      musicalKey: input.musicalKey,
      tempo: input.tempo,
      album: input.album,
      releaseDate: input.releaseDate,
      originalFileName: path.basename(mp3Path),
      mimeType: "audio/mpeg",
      fileBuffer,
      albumArt: input.albumArt,
      uploadedBy: input.requestedBy,
    })

    await db
      .update(youtubeImportJob)
      .set({ status: "completed", songId: created.id, errorMessage: null })
      .where(eq(youtubeImportJob.id, jobId))
  } catch (err) {
    await db
      .update(youtubeImportJob)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to import this video.",
      })
      .where(eq(youtubeImportJob.id, jobId))
  } finally {
    if (scratchDir) {
      await rm(scratchDir, { recursive: true, force: true })
    }
  }
}

/** Fetches a YouTube import job's current status by id. */
export async function getYoutubeImportStatus(jobId: string) {
  return db.query.youtubeImportJob.findFirst({ where: eq(youtubeImportJob.id, jobId) })
}
