import { and, count, eq, sum } from "drizzle-orm"
import { db } from "../db/index.js"
import { song, songStems, youtubeImportJob } from "../db/app-schema.js"

export interface UsageStats {
  songCount: number
  totalStorageBytes: number
  completedStemsCount: number
  youtubeImportsCount: number
}

/**
 * Aggregates a user's library usage across songs, stem separations, and
 * YouTube imports - backs the "Your library" section of the settings page.
 * Each count is scoped to rows this user owns (`song.uploadedBy` /
 * `youtube_import_jobs.requestedBy`), both already indexed.
 */
export async function getUsageStatsForUser(userId: string): Promise<UsageStats> {
  const [songStats] = await db
    .select({ songCount: count(), totalStorageBytes: sum(song.fileSizeBytes) })
    .from(song)
    .where(eq(song.uploadedBy, userId))

  const [stemStats] = await db
    .select({ completedStemsCount: count() })
    .from(songStems)
    .innerJoin(song, eq(songStems.songId, song.id))
    .where(and(eq(song.uploadedBy, userId), eq(songStems.status, "completed")))

  const [youtubeStats] = await db
    .select({ youtubeImportsCount: count() })
    .from(youtubeImportJob)
    .where(eq(youtubeImportJob.requestedBy, userId))

  return {
    songCount: songStats?.songCount ?? 0,
    totalStorageBytes: Number(songStats?.totalStorageBytes ?? 0),
    completedStemsCount: stemStats?.completedStemsCount ?? 0,
    youtubeImportsCount: youtubeStats?.youtubeImportsCount ?? 0,
  }
}
