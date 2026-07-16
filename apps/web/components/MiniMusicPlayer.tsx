"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Spinner } from "@workspace/ui/components/Spinner"
import { Music, Pause, PictureInPicture2, Play, SkipBack, SkipForward } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FunctionComponent, useEffect, useRef, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/Tooltip"
import { Separator } from "@workspace/ui/components/Separator"

// A floating "now playing" widget for every protected page except the songs
// pages themselves, which already embed the full MusicPlayerBar in their own
// PageFooter - showing both at once would be redundant. Deliberately reuses
// the same activeSongQuery/albumArt query shape as NowPlayingCard and
// MusicPlayerBar rather than sharing a hook; all three want slightly
// different loading/empty behavior, so a shared hook would need almost as
// many branches as it saves.
export const MiniMusicPlayer: FunctionComponent = () => {
  const pathname = usePathname()
  const {
    activeSongId,
    isPlaying,
    isLoadingSongId,
    currentTime,
    duration,
    playOrToggle,
    playNext,
    playPrevious,
  } = usePlayer()
  const [isMinimized, setIsMinimized] = useState(false)

  // Registered once and read from a ref (not listed as an effect dependency
  // below) so that toggling play/pause on the current page doesn't itself
  // reset isMinimized - only an actual route change should.
  const isPlayingRef = useRef(isPlaying)
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // On every route change (not the initial mount - the ref starts equal to
  // the first pathname, so that run is skipped), default the mini player to
  // minimized if the active song is merely loaded-but-paused, or expanded if
  // it's actually playing - rather than carrying over whatever the user last
  // toggled manually on the previous page.
  const previousPathnameRef = useRef(pathname)
  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname
    setIsMinimized(!isPlayingRef.current)
  }, [pathname])

  const activeSongQuery = useQuery({
    queryKey: ["song", activeSongId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}", {
        params: { path: { id: activeSongId! } },
      })
      if (error) throw new Error("Failed to load song.")
      return data
    },
    enabled: !!activeSongId,
  })

  const song = activeSongQuery.data

  const albumArt = useQuery({
    queryKey: ["song-album-url", song?.id],
    // `enabled` guarantees `song` is defined whenever this runs.
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: song!.id } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: !!song?.hasAlbumArt,
  })

  if (!activeSongId || pathname.startsWith("/songs")) return null

  if (activeSongQuery.isLoading) {
    return (
      <div className="fixed right-4 bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover shadow-lg">
        <div className="flex items-center gap-2 p-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="size-8 shrink-0 rounded-full" />
        </div>
      </div>
    )
  }

  if (!song) return null

  const isLoading = isLoadingSongId === song.id
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  if (isMinimized) {
    return (
      <div className="fixed right-4 bottom-4 z-50">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Expand mini player"
                onClick={() => setIsMinimized(false)}
                className="relative flex size-14 shrink-0 rounded-xl p-0.5 shadow-lg"
                style={{
                  background: `conic-gradient(var(--primary) ${progressPercent * 3.6}deg, var(--border) 0)`,
                }}
              >
                <span className="relative flex size-full items-center justify-center overflow-hidden rounded-[10px] bg-card">
                  {albumArt.data ? (
                    <Image
                      src={albumArt.data}
                      alt={`${song.title} album art`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <Music className="size-6 text-muted-foreground" />
                  )}
                </span>
              </button>
            }
          />
          <TooltipContent>
            <p>Click to expand</p>
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center gap-2 p-3">
        <Link href={`/songs/${song.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="flex size-11 shrink-0 rounded-md p-0.5"
            style={{
              background: `conic-gradient(var(--primary) ${progressPercent * 3.6}deg, var(--border) 0)`,
            }}
          >
            <div className="relative flex size-full items-center justify-center overflow-hidden rounded-[5px] bg-card">
              {albumArt.data ? (
                <Image
                  src={albumArt.data}
                  alt={`${song.title} album art`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <Music className="size-5 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{song.title}</p>
            <p className="truncate text-xs text-muted-foreground">{song.artist ?? "Unknown artist"}</p>
          </div>
        </Link>

        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Previous song"
            onClick={() => playPrevious()}
          >
            <SkipBack className="size-3 fill-current" />
          </Button>

          <Button
            variant="ghost"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={isLoading}
            onClick={() => playOrToggle(song)}
          >
            {isLoading ? (
              <Spinner />
            ) : isPlaying ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Next song"
            onClick={() => playNext()}
          >
            <SkipForward className="size-3 fill-current" />
          </Button>
        </div>

        <Separator orientation="vertical" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label="Minimize mini player"
                onClick={() => setIsMinimized(true)}
              >
                <PictureInPicture2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Minimize</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
