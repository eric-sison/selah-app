"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { Slider } from "@workspace/ui/components/Slider"
import { Spinner } from "@workspace/ui/components/Spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/Tooltip"
import { cn } from "@workspace/ui/lib/utils"
import {
  FileMusic,
  ListMusic,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import Image from "next/image"
import { FunctionComponent, useEffect, useRef, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { formatFileSize } from "@/utils/format-file-size"
import { formatTime } from "@/utils/format-time"
import { usePlayer } from "@/components/SongPlayerProvider"
import { EditChordProDialog } from "@/components/EditChordProDialog"
import { SongDetailsSheet } from "@/components/SongDetailsSheet"
import { SongLyricsChords } from "@/components/SongLyricsChords"

// See NowPlayingCard.tsx - the shared Slider uses `thumbAlignment="edge"`
// with a 12px (size-3) thumb, so the thumb's on-screen center isn't a pure
// percentage of the track width. Without this correction the scrub
// tooltip's anchor only lines up with the thumb at the midpoint.
const THUMB_SIZE_PX = 12

// Delays the actual `seek()` (an <audio> element currentTime write, which
// can stutter if fired on every drag tick) until the pointer pauses - the
// slider's displayed position still updates immediately via `scrubValue`.
const SEEK_DEBOUNCE_MS = 150

// Caps the "fall back to library order" fetch below (see `order`) - the
// list endpoint is paginated, so this is a bounded approximation of "the
// whole library" rather than a true unbounded fetch, matching the API's
// GET /songs `limit` max.
const FALLBACK_QUEUE_LIMIT = 100

// A persistent, app-bar-style player meant to live in `PageFooter` - unlike
// NowPlayingCard (which falls back to the most recent upload as a browsing
// preview), this only ever reflects whatever is actually loaded, and
// collapses to a placeholder when nothing has played yet. The seek bar
// doubles as the footer's top border (see the absolutely-positioned
// `Slider` below) instead of sitting in its own row.
export const MusicPlayerBar: FunctionComponent = () => {
  const {
    activeSongId,
    isPlaying,
    isLoadingSongId,
    currentTime,
    duration,
    volume,
    setVolume,
    isShuffling,
    toggleShuffle,
    repeatCurrentSong,
    toggleRepeatCurrentSong,
    playbackOrder,
    playOrToggle,
    playNext,
    playPrevious,
    seek,
  } = usePlayer()

  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isLyricsOpen, setIsLyricsOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState<number | null>(null)
  // Tracks the mouse position while merely hovering the seek bar (not
  // dragging it) as a 0-1 ratio, so the tooltip can preview a time there too
  // - independent of `scrubValue`, which only reflects an active drag.
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const scrubValueRef = useRef<number | null>(null)
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrubValueRef.current = scrubValue
  }, [scrubValue])

  useEffect(() => {
    if (!isScrubbing) return

    const stopScrubbing = () => {
      setIsScrubbing(false)
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current)
      if (scrubValueRef.current !== null) seek(scrubValueRef.current)
      setScrubValue(null)
    }
    window.addEventListener("pointerup", stopScrubbing)
    window.addEventListener("pointercancel", stopScrubbing)
    return () => {
      window.removeEventListener("pointerup", stopScrubbing)
      window.removeEventListener("pointercancel", stopScrubbing)
    }
  }, [isScrubbing, seek])

  const handleScrubChange = (value: number | readonly number[]) => {
    const time = Array.isArray(value) ? value[0] : value
    if (time === undefined) return

    setScrubValue(time)
    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current)
    seekDebounceRef.current = setTimeout(() => seek(time), SEEK_DEBOUNCE_MS)
  }

  const handleSeekBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = seekBarRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setHoverRatio(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1))
  }

  // Resolves the active id to a full Song for display/`playOrToggle` - the
  // list endpoint is paginated now, so this can't just look the id up in a
  // fetched page; fetching it directly also keeps this correct for a song
  // played from its detail page without ever going through the list first.
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

  // Falls back to a bounded "whole library" page when nothing's actually
  // been queued yet, so previous/next still work for a song played directly
  // from its detail page rather than from the list.
  const libraryOrderQuery = useQuery({
    queryKey: ["songs", "library-order"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs", {
        params: { query: { limit: FALLBACK_QUEUE_LIMIT } },
      })
      if (error) throw new Error("Failed to load songs.")
      return data
    },
    enabled: playbackOrder.length === 0 && !!activeSongId,
  })

  if (!song) {
    return (
      <div className="flex h-20 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Nothing playing.</p>
      </div>
    )
  }

  const isLoading = isLoadingSongId === song.id
  const canControlPlayback = duration > 0

  const order = playbackOrder.length > 0 ? playbackOrder : (libraryOrderQuery.data?.items ?? [])
  const currentIndex = order.findIndex((s) => s.id === song.id)
  const canGoPrevious = currentIndex > 0
  const canGoNext = currentIndex >= 0 && currentIndex < order.length - 1

  const displayTime = scrubValue ?? currentTime
  const scrubPercentage = duration > 0 ? displayTime / duration : 0
  const scrubAnchorLeft = `calc(${scrubPercentage * 100}% + ${(0.5 - scrubPercentage) * THUMB_SIZE_PX}px)`

  // While scrubbing, the tooltip follows the drag (thumb-aligned, via
  // `scrubAnchorLeft`); while merely hovering, it follows the raw mouse
  // position instead - there's no thumb to align with there.
  const isPreviewingTime = (isScrubbing || hoverRatio !== null) && canControlPlayback
  const previewTime = isScrubbing ? displayTime : (hoverRatio ?? 0) * duration
  const previewAnchorLeft = isScrubbing ? scrubAnchorLeft : `${(hoverRatio ?? 0) * 100}%`

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="relative flex h-20 items-center">
      <div
        ref={seekBarRef}
        className="group absolute inset-x-0 top-0 z-10"
        onPointerMove={handleSeekBarPointerMove}
        onPointerLeave={() => setHoverRatio(null)}
      >
        <Slider
          value={[displayTime]}
          min={0}
          max={canControlPlayback ? duration : 100}
          disabled={!canControlPlayback}
          onValueChange={handleScrubChange}
          onPointerDown={() => setIsScrubbing(true)}
          className="cursor-pointer **:data-[slot=slider-track]:h-0.5 **:data-[slot=slider-track]:transition-[height] **:data-[slot=slider-track]:duration-150 group-hover:**:data-[slot=slider-track]:h-1"
        />

        {/* See NowPlayingCard.tsx for why this invisible anchor exists
          instead of relying on Tooltip's built-in cursor tracking. */}
        <Tooltip open={isPreviewingTime}>
          <TooltipTrigger
            render={
              <span
                aria-hidden="true"
                tabIndex={-1}
                className="pointer-events-none absolute top-0 -translate-x-1/2"
                style={{ left: previewAnchorLeft }}
              />
            }
          />
          <TooltipContent sideOffset={14}>{formatTime(previewTime)}</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
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
          <div className="min-w-0 text-xs">
            <p className="truncate">Uploaded by {song.uploader.name}</p>
            <p className="truncate text-muted-foreground">{formatFileSize(song.fileSizeBytes)}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={isShuffling ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Shuffle"
                  aria-pressed={isShuffling}
                  onClick={toggleShuffle}
                >
                  <Shuffle className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Shuffle</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Previous song"
                  disabled={!canGoPrevious}
                  onClick={() => playPrevious()}
                >
                  <SkipBack className="size-4 fill-current" />
                </Button>
              }
            />
            <TooltipContent>Previous</TooltipContent>
          </Tooltip>

          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={isLoading}
            onClick={() => playOrToggle(song)}
          >
            {isLoading ? (
              <Spinner />
            ) : isPlaying ? (
              <Pause className="size-8 fill-current" />
            ) : (
              <Play className="size-8 fill-current" />
            )}
          </button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Next song"
                  disabled={!canGoNext}
                  onClick={() => playNext()}
                >
                  <SkipForward className="size-4 fill-current" />
                </Button>
              }
            />
            <TooltipContent>Next</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={repeatCurrentSong ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Repeat current song"
                  aria-pressed={repeatCurrentSong}
                  onClick={toggleRepeatCurrentSong}
                >
                  <Repeat className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Repeat</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center justify-end gap-1">
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Volume">
                        <VolumeIcon className="size-4" />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent>Volume</TooltipContent>
            </Tooltip>

            <PopoverContent side="top" align="center" className="w-auto items-center py-4">
              <Slider
                orientation="vertical"
                value={[volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(value) => setVolume(Array.isArray(value) ? (value[0] ?? 0) : value)}
              />
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={isLyricsOpen ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Lyrics and chords"
                  aria-pressed={isLyricsOpen}
                  onClick={() => setIsLyricsOpen((open) => !open)}
                >
                  <FileMusic className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Lyrics & chords</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Song details"
                  onClick={() => setIsDetailsOpen(true)}
                >
                  <ListMusic className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Song details</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <SongDetailsSheet
        song={song}
        albumArtUrl={albumArt.data}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />

      {/* Anchored to the bar's own box (not a portal/fixed overlay), so it
        always sits flush above it regardless of the bar's actual height -
        stays mounted and just toggles opacity/translate so the slide-up
        transition can run both ways. */}
      <div
        className={cn(
          "absolute right-4 bottom-full z-40 mb-2 flex h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg transition-all duration-200",
          isLyricsOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{song.title}</p>
            <p className="truncate text-xs text-muted-foreground">Lyrics & Chords</p>
          </div>
          <Button
            variant="ghost"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Close"
            onClick={() => setIsLyricsOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SongLyricsChords song={song} />
        </div>
        <div className="border-t p-4">
          <Button className="w-full" onClick={() => setIsEditOpen(true)}>
            {song.chordpro ? (
              <>
                <Pencil />
                Edit
              </>
            ) : (
              <>
                <Plus />
                Add lyrics & chords
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Keyed by song id - MusicPlayerBar (and this dialog with it) stays
        mounted across song changes, but TanStack Form's `useForm` only
        captures `defaultValues` once at mount, so without a fresh instance
        per song the chordpro textarea would keep showing whichever song's
        text it first opened with. */}
      <EditChordProDialog key={song.id} song={song} open={isEditOpen} onOpenChange={setIsEditOpen} />
    </div>
  )
}
