import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { song, songStems } from "../db/app-schema.js"
import { getStreamUrl } from "../lib/storage.js"
import { env } from "../utils/env.js"

function generateCallbackToken(): string {
  return randomBytes(32).toString("hex")
}

export interface StemUrls {
  vocals: string
  drums: string
  bass: string
  guitar: string
  piano: string
  other: string
}

/**
 * Kicks off (or restarts) stem separation for a song.
 *
 * Upserts the song's `song_stems` row to "pending" with a fresh callback
 * token and clears any previous result - re-running (including an explicit
 * "regenerate" once already completed) replaces the prior attempt rather
 * than accumulating history - then hands the job to the separation worker.
 * If the worker can't even be reached, the row is immediately marked
 * "failed" rather than left stuck at "pending" forever.
 *
 * @returns the job row, or `null` if no song has this id.
 */
export async function startStemSeparation(songId: string, requestedBy: string) {
  const found = await db.query.song.findFirst({ where: eq(song.id, songId) })
  if (!found) return null

  const callbackToken = generateCallbackToken()

  const [job] = await db
    .insert(songStems)
    .values({ songId, status: "pending", callbackToken, requestedBy })
    .onConflictDoUpdate({
      target: songStems.songId,
      set: {
        status: "pending",
        callbackToken,
        requestedBy,
        vocalsStorageKey: null,
        drumsStorageKey: null,
        bassStorageKey: null,
        guitarStorageKey: null,
        pianoStorageKey: null,
        otherStorageKey: null,
        errorMessage: null,
      },
    })
    .returning()

  try {
    const sourceUrl = await getStreamUrl(found.storageKey)
    const response = await fetch(`${env.STEM_WORKER_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.STEM_WORKER_SECRET}`,
      },
      body: JSON.stringify({
        jobId: job.id,
        songId,
        sourceUrl,
        callbackUrl: `${env.API_PUBLIC_URL}/api/songs/${songId}/stems/callback`,
        callbackToken,
      }),
    })
    if (!response.ok) throw new Error(`Worker responded with ${response.status}`)
  } catch (err) {
    const [failed] = await db
      .update(songStems)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to reach the separation worker.",
      })
      .where(eq(songStems.songId, songId))
      .returning()
    return failed
  }

  return job
}

/** Fetches a song's current separation job, if one has ever been requested. */
export async function getStemStatus(songId: string) {
  return db.query.songStems.findFirst({ where: eq(songStems.songId, songId) })
}

/**
 * Signs short-lived playback URLs for a song's 6 stems.
 *
 * @returns the 6 signed URLs, or `null` if separation hasn't completed (or
 *   was never requested) for this song.
 */
export async function getStemStreamUrls(songId: string): Promise<StemUrls | null> {
  const found = await getStemStatus(songId)
  if (
    !found ||
    found.status !== "completed" ||
    !found.vocalsStorageKey ||
    !found.drumsStorageKey ||
    !found.bassStorageKey ||
    !found.guitarStorageKey ||
    !found.pianoStorageKey ||
    !found.otherStorageKey
  ) {
    return null
  }

  const [vocals, drums, bass, guitar, piano, other] = await Promise.all([
    getStreamUrl(found.vocalsStorageKey),
    getStreamUrl(found.drumsStorageKey),
    getStreamUrl(found.bassStorageKey),
    getStreamUrl(found.guitarStorageKey),
    getStreamUrl(found.pianoStorageKey),
    getStreamUrl(found.otherStorageKey),
  ])

  return { vocals, drums, bass, guitar, piano, other }
}

export interface CompleteStemSeparationInput {
  songId: string
  callbackToken: string
  stems?: StemUrls
  error?: string
}

/**
 * Records a separation job's outcome, called from the worker's completion
 * callback.
 *
 * Rejects (no-ops) if `callbackToken` doesn't match the token stored for
 * this song's current job - guards against a stale/replayed callback from a
 * superseded job (e.g. a slow retry landing after the song was re-submitted)
 * silently overwriting a newer job's row with old results. Also no-ops if
 * neither `stems` nor `error` is given - the route's own zod schema requires
 * exactly one, so this is just a type-narrowing guard in practice.
 *
 * @returns `true` if the job was found and updated, `false` otherwise.
 */
export async function completeStemSeparation({
  songId,
  callbackToken,
  stems,
  error,
}: CompleteStemSeparationInput): Promise<boolean> {
  const found = await getStemStatus(songId)
  if (!found || found.callbackToken !== callbackToken) return false

  if (error !== undefined) {
    await db.update(songStems).set({ status: "failed", errorMessage: error }).where(eq(songStems.songId, songId))
    return true
  }

  if (!stems) return false

  await db
    .update(songStems)
    .set({
      status: "completed",
      vocalsStorageKey: stems.vocals,
      drumsStorageKey: stems.drums,
      bassStorageKey: stems.bass,
      guitarStorageKey: stems.guitar,
      pianoStorageKey: stems.piano,
      otherStorageKey: stems.other,
      errorMessage: null,
    })
    .where(eq(songStems.songId, songId))

  return true
}
