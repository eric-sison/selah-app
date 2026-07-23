import { execFile as execFileCallback } from "node:child_process"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { env } from "../utils/env.js"

const execFile = promisify(execFileCallback)

const ALLOWED_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
])

/**
 * Restricts which URLs this ever shells out to yt-dlp for - yt-dlp itself
 * supports hundreds of sites, so without this check a "YouTube import"
 * endpoint would double as a generic download-anything-from-anywhere tool.
 */
export function isAllowedYoutubeUrl(url: string): boolean {
  try {
    return ALLOWED_HOSTNAMES.has(new URL(url).hostname)
  } catch {
    return false
  }
}

const METADATA_TIMEOUT_MS = 20_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const MAX_YT_DLP_OUTPUT_BYTES = 10 * 1024 * 1024

export interface YoutubeMetadata {
  title: string
  durationSeconds: number
  thumbnailUrl: string | null
}

interface YtDlpInfoJson {
  title?: string
  duration?: number
  thumbnail?: string
}

/**
 * Fetches a YouTube video's title/duration/thumbnail without downloading it,
 * via `yt-dlp --dump-json --skip-download`.
 *
 * @throws if the URL isn't a YouTube URL, yt-dlp can't read the video, or
 *   the video is longer than {@link env.YOUTUBE_IMPORT_MAX_DURATION_SECONDS}.
 */
export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  if (!isAllowedYoutubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported.")
  }

  const { stdout } = await execFile(env.YT_DLP_PATH, ["--dump-json", "--no-playlist", "--skip-download", url], {
    timeout: METADATA_TIMEOUT_MS,
    maxBuffer: MAX_YT_DLP_OUTPUT_BYTES,
  })

  const info = JSON.parse(stdout) as YtDlpInfoJson
  if (!info.title || typeof info.duration !== "number") {
    throw new Error("Could not read this video's details.")
  }

  if (info.duration > env.YOUTUBE_IMPORT_MAX_DURATION_SECONDS) {
    const maxMinutes = Math.floor(env.YOUTUBE_IMPORT_MAX_DURATION_SECONDS / 60)
    throw new Error(`This video is too long to import (max ${maxMinutes} minutes).`)
  }

  return {
    title: info.title,
    durationSeconds: info.duration,
    thumbnailUrl: info.thumbnail ?? null,
  }
}

/**
 * Downloads a YouTube video's audio and converts it to mp3 (via yt-dlp,
 * which shells out to ffmpeg itself) into `destDir` - an empty, caller-owned
 * scratch directory.
 *
 * @returns the path to the resulting mp3 file.
 */
export async function downloadYoutubeAudioAsMp3(url: string, destDir: string): Promise<string> {
  if (!isAllowedYoutubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported.")
  }

  await execFile(
    env.YT_DLP_PATH,
    [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--no-playlist",
      "-o",
      path.join(destDir, "%(id)s.%(ext)s"),
      url,
    ],
    { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: MAX_YT_DLP_OUTPUT_BYTES }
  )

  const files = await readdir(destDir)
  const mp3File = files.find((file) => file.endsWith(".mp3"))
  if (!mp3File) {
    throw new Error("yt-dlp did not produce an mp3 file.")
  }

  return path.join(destDir, mp3File)
}
