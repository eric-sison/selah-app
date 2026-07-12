"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent, CardFooter } from "@workspace/ui/components/Card"
import { LiveWaveform } from "@workspace/ui/components/LiveWaveform"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Slider } from "@workspace/ui/components/Slider"
import { Loader2, Music, Pause, Play, Redo2, Undo2 } from "lucide-react"
import Image from "next/image"
import { FunctionComponent, useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { operations } from "@/types/api"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/Tooltip"

export type Song = operations["listSongs"]["responses"][200]["content"]["application/json"][number]

// The shared Slider uses `thumbAlignment="edge"` with a 12px (size-3) thumb,
// so the thumb's on-screen center isn't a pure percentage of the track width
// - it's inset by half the thumb size at each end. Without this correction
// the scrub tooltip's anchor only lines up with the thumb at the midpoint
// and drifts increasingly off toward either end.
const THUMB_SIZE_PX = 12

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"

  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60

  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

// Prefers whichever song is actually loaded/playing; falls back to the most
// recently uploaded song as a static preview when nothing has been played yet.
export const MiniMusicPlayer: FunctionComponent = () => {
  const {
    activeSongId,
    isPlaying,
    isLoadingSongId,
    currentTime,
    duration,
    analyserNode,
    playOrToggle,
    skip,
    seek,
  } = usePlayer()

  const [isScrubbing, setIsScrubbing] = useState(false)

  // The pointerdown that starts a drag lands on the slider, but the pointerup
  // that ends it can land anywhere (or nowhere, if the cursor leaves the
  // window) - listen on window rather than the slider itself so scrubbing
  // reliably turns off.
  useEffect(() => {
    if (!isScrubbing) return

    const stopScrubbing = () => setIsScrubbing(false)
    window.addEventListener("pointerup", stopScrubbing)
    window.addEventListener("pointercancel", stopScrubbing)
    return () => {
      window.removeEventListener("pointerup", stopScrubbing)
      window.removeEventListener("pointercancel", stopScrubbing)
    }
  }, [isScrubbing])

  const songs = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs")
      if (error) throw new Error("Failed to load songs.")
      return data
    },
  })

  const song = songs.data?.find((s) => s.id === activeSongId) ?? songs.data?.[0]

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

  if (songs.isLoading) {
    return (
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="flex w-full flex-col items-center gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">No songs uploaded yet.</p>
      </div>
    )
  }

  const isActive = activeSongId === song.id
  const isCurrentlyPlaying = isActive && isPlaying
  const isLoading = isLoadingSongId === song.id

  const scrubPercentage = duration > 0 ? currentTime / duration : 0
  const scrubAnchorLeft = `calc(${scrubPercentage * 100}% + ${(0.5 - scrubPercentage) * THUMB_SIZE_PX}px)`

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <Card className="w-full gap-0 rounded-xl pt-0 opacity-95">
        <CardContent className="relative flex aspect-square items-center justify-center">
          {isCurrentlyPlaying && !albumArt.data ? (
            <LiveWaveform
              active={isCurrentlyPlaying}
              analyserNode={analyserNode}
              mode="static"
              className="h-20 w-full text-primary"
            />
          ) : albumArt.data ? (
            <Image
              src={albumArt.data}
              alt={`${song.title} album art`}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <Music className="size-32 text-muted-foreground" />
          )}
        </CardContent>

        <CardFooter className="relative flex-col items-stretch gap-3 border-t-0 pt-4">
          <Slider
            value={[isActive ? currentTime : 0]}
            min={0}
            max={isActive && duration > 0 ? duration : 100}
            disabled={!isActive || duration <= 0}
            onValueChange={(value) => seek(Array.isArray(value) ? value[0] : value)}
            onPointerDown={() => setIsScrubbing(true)}
            className="group absolute inset-x-0 top-0 cursor-pointer **:data-[slot=slider-track]:h-0.75 **:data-[slot=slider-track]:rounded-none **:data-[slot=slider-track]:transition-[height] group-hover:**:data-[slot=slider-track]:h-1.5 data-disabled:cursor-not-allowed"
          />

          {/* Invisible, zero-size anchor at the thumb's x position - the Slider's
              own drag handling captures the pointer, so Tooltip's built-in
              cursor tracking never sees the underlying mouse events. Moving
              this anchor on every `currentTime` update instead ties the
              tooltip directly to the seek value, which also makes it work for
              touch/keyboard-driven seeking, not just mouse dragging. */}
          <Tooltip open={isScrubbing && isActive && duration > 0}>
            <TooltipTrigger
              render={
                <span
                  aria-hidden="true"
                  tabIndex={-1}
                  className="pointer-events-none absolute top-0 -translate-x-1/2"
                  style={{ left: scrubAnchorLeft }}
                />
              }
            />
            <TooltipContent sideOffset={14}>{formatTime(currentTime)}</TooltipContent>
          </Tooltip>

          <div className="flex items-center justify-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative rounded-full"
                    aria-label="Back 10 seconds"
                    disabled={!isActive}
                    onClick={() => skip(-10)}
                  >
                    <Undo2 className="size-5" />
                  </Button>
                }
              />
              <TooltipContent>Skip 10 secs backward</TooltipContent>
            </Tooltip>

            <Button
              variant="default"
              size="icon-lg"
              className="rounded-full"
              aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
              disabled={isLoading}
              onClick={() => playOrToggle(song)}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" />
              ) : isCurrentlyPlaying ? (
                <Pause className="fill-current" />
              ) : (
                <Play className="fill-current" />
              )}
            </Button>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative rounded-full"
                    aria-label="Forward 10 seconds"
                    disabled={!isActive}
                    onClick={() => skip(10)}
                  >
                    <Redo2 className="size-5" />
                  </Button>
                }
              />
              <TooltipContent>Skip 10 secs forward</TooltipContent>
            </Tooltip>
          </div>
        </CardFooter>
      </Card>

      <div className="text-center">
        <p className="truncate text-lg font-semibold tracking-tight">{song.title}</p>
        <p className="truncate text-sm text-muted-foreground">{song.artist ?? "Unknown artist"}</p>
      </div>
    </div>
  )
}
