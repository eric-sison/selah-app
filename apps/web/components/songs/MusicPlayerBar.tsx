"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Input } from "@workspace/ui/components/Input"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { Separator } from "@workspace/ui/components/Separator"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Slider } from "@workspace/ui/components/Slider"
import { Spinner } from "@workspace/ui/components/Spinner"
import { toast } from "@workspace/ui/components/Sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/Tooltip"
import { cn } from "@workspace/ui/lib/utils"
import {
  AudioLines,
  FastForward,
  FileMusic,
  Hand,
  Headphones,
  ListMusic,
  Metronome,
  Minus,
  Music,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Repeat2,
  Rewind,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react"
import Image from "next/image"
import { FunctionComponent, useEffect, useRef, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { detectKeyFromAudioBuffer } from "@/utils/detect-key"
import { formatTime, parseTime } from "@/utils/format-time"
import { STEM_NAMES } from "@/utils/stems"
import type { StemName } from "@/utils/stems"
import { transposeKey } from "@/utils/transpose-key"
import { useMetronome } from "@/hooks/use-metronome"
import { useTapTempo } from "@/hooks/use-tap-tempo"
import { usePlayer } from "@/components/songs/SongPlayerProvider"
import { EditChordProDialog } from "@/components/songs/EditChordProDialog"
import { SongDetailsSheet } from "@/components/songs/SongDetailsSheet"
import { SongLyricsChords } from "@/components/songs/SongLyricsChords"
import type { Song } from "@/components/songs/NowPlayingCard"

// See NowPlayingCard.tsx - the shared Slider uses `thumbAlignment="edge"`
// with a 12px (size-3) thumb, so the thumb's on-screen center isn't a pure
// percentage of the track width. Without this correction the scrub
// tooltip's anchor only lines up with the thumb at the midpoint.
const THUMB_SIZE_PX = 12

// Delays the actual `seek()` (an <audio> element currentTime write, which
// can stutter if fired on every drag tick) until the pointer pauses - the
// slider's displayed position still updates immediately via `scrubValue`.
const SEEK_DEBOUNCE_MS = 150

// How far the fast-forward/rewind buttons jump within the current song -
// matches the common podcast/audiobook-player convention.
const SKIP_SECONDS = 5

// Caps the "fall back to library order" fetch below (see `order`) - the
// list endpoint is paginated, so this is a bounded approximation of "the
// whole library" rather than a true unbounded fetch, matching the API's
// GET /songs `limit` max.
const FALLBACK_QUEUE_LIMIT = 100

// Mirrors the loaded bar's 3-column layout (art+text, transport controls,
// right-side actions) so there's no layout jump once activeSongQuery
// resolves - shown only while a song is actively loading, not when nothing
// is selected at all (see the `!activeSongId` check below).
const MusicPlayerBarSkeleton: FunctionComponent = () => (
  <div className="grid h-20 w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
    <div className="flex min-w-0 items-center gap-3">
      <Skeleton className="size-10 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>

    <div className="flex items-center justify-center gap-4">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
    </div>

    <div className="flex items-center justify-end gap-1">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-full" />
    </div>
  </div>
)

// Matches the display-only chord transpose's own clamp range in
// SongLyricsChords.tsx - this one actually re-pitches the audio (see
// SongPlayerProvider's setTransposeSemitones), but a consistent ±12 (one
// octave) range keeps the two features feeling coherent.
const MIN_TRANSPOSE_SEMITONES = -12
const MAX_TRANSPOSE_SEMITONES = 12

function formatSignedSemitones(value: number): string {
  if (value === 0) return "0"
  return value > 0 ? `+${value}` : `${value}`
}

interface SongKeyPopoverProps {
  song: Song
}

// Key detection and "save to DB" are local to whichever song is loaded -
// keyed by song.id where this is rendered below (same reasoning as
// EditChordProDialog/SongLyricsChords) so a detected-but-not-saved result
// can't linger on screen once the user moves on to a different song.
// `transposeSemitones` itself stays in the player context instead of local
// state, since it drives the actual audio pitch-shift.
const SongKeyPopover: FunctionComponent<SongKeyPopoverProps> = ({ song }) => {
  const { transposeSemitones, setTransposeSemitones } = usePlayer()
  const queryClient = useQueryClient()

  // Re-fetches a fresh stream URL and decodes the whole file client-side
  // rather than reusing the already-playing <audio> element, since that
  // element's buffered range depends on how much of the track has actually
  // played - detection needs the decoded PCM up front regardless of
  // playback position.
  const detectKey = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/stream-url", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to load audio for analysis.")

      const response = await fetch(data.url)
      const arrayBuffer = await response.arrayBuffer()

      const audioContext = new AudioContext()
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        return detectKeyFromAudioBuffer(audioBuffer)
      } finally {
        await audioContext.close()
      }
    },
    onSuccess: (detectedKey) => {
      if (!detectedKey) toast.error("Couldn't detect a key for this song.", { position: "top-center" })
    },
    onError: () => toast.error("Failed to analyze this song.", { position: "top-center" }),
  })

  const saveKey = useMutation({
    mutationFn: async (musicalKey: string) => {
      const { error } = await apiClient.PATCH("/api/songs/{id}", {
        params: { path: { id: song.id } },
        body: { musicalKey },
      })
      if (error) throw new Error("Failed to update key.")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["song", song.id] })
      await queryClient.invalidateQueries({ queryKey: ["songs"] })
      toast.success("Key updated.")
      detectKey.reset()
    },
    onError: () => toast.error("Failed to update key.", { position: "top-center" }),
  })

  const shiftedKey = song.musicalKey ? transposeKey(song.musicalKey, transposeSemitones) : null

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Key and pitch">
                  <Music2 className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Key & pitch</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="end" className="w-64">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Original key</p>
          <p className="text-sm font-medium">{song.musicalKey ? `Key of ${song.musicalKey}` : "Not set"}</p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="w-full text-xs font-medium text-muted-foreground">Shift pitch</p>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Shift down a semitone"
              disabled={transposeSemitones <= MIN_TRANSPOSE_SEMITONES}
              onClick={() => setTransposeSemitones(transposeSemitones - 1)}
            >
              <Minus />
            </Button>
            <span className="min-w-10 text-center text-2xl font-bold tabular-nums">
              {formatSignedSemitones(transposeSemitones)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Shift up a semitone"
              disabled={transposeSemitones >= MAX_TRANSPOSE_SEMITONES}
              onClick={() => setTransposeSemitones(transposeSemitones + 1)}
            >
              <Plus />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {shiftedKey && transposeSemitones !== 0
              ? `Now playing in Key of ${shiftedKey}`
              : "No pitch shift"}
          </p>
        </div>

        <Separator />

        {detectKey.data ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={saveKey.isPending}
            onClick={() => saveKey.mutate(detectKey.data!)}
          >
            {saveKey.isPending ? <Spinner /> : <Wand2 />}
            Use detected key: {detectKey.data}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={detectKey.isPending}
            onClick={() => detectKey.mutate()}
          >
            {detectKey.isPending ? <Spinner /> : <Wand2 />}
            {detectKey.isPending ? "Detecting key..." : "Detect key"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface SongTempoPopoverProps {
  song: Song
}

// Tap tempo plus an audible metronome (see hooks/use-tap-tempo.ts and
// hooks/use-metronome.ts) rather than automatic detection from the audio -
// autocorrelation-based tempo estimation is prone to locking onto a clean
// multiple of the real tempo (e.g. a driving hi-hat's double-time), with no
// reliable way to tell from the signal alone which multiple is correct.
// Tapping along leaves that judgment call to whoever's actually listening.
const SongTempoPopover: FunctionComponent<SongTempoPopoverProps> = ({ song }) => {
  const queryClient = useQueryClient()
  // Seeded from the song's already-saved tempo (if any) so the metronome is
  // usable immediately rather than requiring a fresh tap sequence every time
  // this popover opens - this component is keyed by song.id (see below), so
  // it remounts, and re-reads, per song rather than carrying a stale value
  // over.
  const { bpm: tappedBpm, tapCount, tap, reset: resetTap, setBpm: setTappedBpm } = useTapTempo(song.tempo)
  // Falls back to 120 only to satisfy useMetronome's required number param -
  // the metronome's own start button stays disabled until a real bpm exists.
  const metronome = useMetronome(tappedBpm ?? 120)

  const saveTempo = useMutation({
    mutationFn: async (tempo: number) => {
      const { error } = await apiClient.PATCH("/api/songs/{id}", {
        params: { path: { id: song.id } },
        body: { tempo },
      })
      if (error) throw new Error("Failed to update tempo.")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["song", song.id] })
      await queryClient.invalidateQueries({ queryKey: ["songs"] })
      toast.success("Tempo updated.")
    },
    onError: () => toast.error("Failed to update tempo.", { position: "top-center" }),
  })

  return (
    <Popover onOpenChange={(open) => !open && metronome.stop()}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Tempo">
                  <Metronome className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Tempo</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="end" className="w-64">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Tempo</p>
          <p className="text-sm font-medium">{song.tempo ? `${song.tempo} BPM` : "Not set"}</p>
        </div>

        <Separator />

        <div className="flex flex-col items-center gap-3">
          <Button variant="outline" className="h-16 w-full flex-col gap-1" onClick={tap}>
            <Hand className="size-5" />
            <span className="text-xs text-muted-foreground">
              {tapCount > 0 ? `${tapCount} tap${tapCount === 1 ? "" : "s"}` : "Tap along to the beat"}
            </span>
          </Button>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Decrease tempo"
              disabled={tappedBpm === null}
              onClick={() => setTappedBpm(tappedBpm! - 1)}
            >
              <Minus />
            </Button>
            <span className="min-w-16 text-center text-2xl font-bold tabular-nums">{tappedBpm ?? "—"}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Increase tempo"
              disabled={tappedBpm === null}
              onClick={() => setTappedBpm(tappedBpm! + 1)}
            >
              <Plus />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={tapCount === 0}
            onClick={() => {
              resetTap()
              metronome.stop()
            }}
          >
            <RotateCcw />
            Reset
          </Button>
        </div>

        <Separator />

        <Button
          variant={metronome.isPlaying ? "secondary" : "outline"}
          size="sm"
          className="w-full"
          disabled={tappedBpm === null}
          aria-pressed={metronome.isPlaying}
          onClick={() => (metronome.isPlaying ? metronome.stop() : metronome.start())}
        >
          {metronome.isPlaying ? <Pause /> : <Play />}
          {metronome.isPlaying ? "Stop metronome" : "Play metronome"}
        </Button>

        {/* Its own volume, independent of the song's own playback volume
          (see MusicPlayerBar's master Volume popover) - the metronome runs
          on a separate AudioContext entirely, so the two never shared a
          gain to begin with. */}
        <div className="flex items-center gap-2">
          {metronome.volume === 0 ? (
            <VolumeX className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Volume2 className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Slider
            aria-label="Metronome volume"
            value={[metronome.volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(value) => metronome.setVolume(Array.isArray(value) ? (value[0] ?? 0) : value)}
            className="flex-1"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={tappedBpm === null || saveTempo.isPending}
          onClick={() => saveTempo.mutate(tappedBpm!)}
        >
          {saveTempo.isPending ? <Spinner /> : <Wand2 />}
          {tappedBpm !== null ? `Save tempo: ${tappedBpm} BPM` : "Save tempo"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

// A loop needs to be at least this long - guards against a mis-tap setting
// start and end at nearly the same instant, which would otherwise produce a
// stutter-fast, effectively broken loop rather than an obviously invalid one.
const MIN_LOOP_SECONDS = 1

// Both points can be set two ways: "Set" captures whatever's currently
// playing (scrubbing or playing to the right spot and pressing a button is
// the most direct way to pick a moment in a song), or the time field next
// to it can be typed into directly for an exact timestamp. Nothing commits
// to the shared player context (see SongPlayerProvider's `loopSection`,
// which the audio element's timeupdate handler already enforces - this
// popover is purely the UI for setting it) until both points exist and
// make sense together.
const LoopSectionPopover: FunctionComponent = () => {
  const { currentTime, duration, loopSection, setLoopSection } = usePlayer()
  // Seeded from whatever's already looping (if anything) so reopening this
  // popover - which may have unmounted while closed - reflects the loop
  // that's actually still running instead of resetting to blank.
  const [start, setStart] = useState(loopSection?.start ?? null)
  const [end, setEnd] = useState(loopSection?.end ?? null)

  const canSetPoints = duration > 0
  const isInvalidRange = start !== null && end !== null && end - start < MIN_LOOP_SECONDS

  const commitLoop = (nextStart: number | null, nextEnd: number | null) => {
    if (nextStart !== null && nextEnd !== null && nextEnd - nextStart >= MIN_LOOP_SECONDS) {
      setLoopSection({ start: nextStart, end: nextEnd })
    } else {
      setLoopSection(null)
    }
  }

  const handleSetStart = () => {
    setStart(currentTime)
    commitLoop(currentTime, end)
  }

  const handleSetEnd = () => {
    setEnd(currentTime)
    commitLoop(start, currentTime)
  }

  // Parses and clamps a typed time into the song's actual length. Returns
  // null (rather than clamping garbage input to 0) for text that isn't a
  // recognizable time at all, so the caller can reject it outright instead
  // of silently accepting a typo as "0:00".
  const parseManualTime = (value: string): number | null => {
    const parsed = parseTime(value)
    return parsed === null ? null : Math.min(Math.max(parsed, 0), duration)
  }

  // A blank field on blur (e.g. the popover just closed, or the user tabbed
  // through without typing anything) isn't a rejected edit - it's simply no
  // edit, so it's left alone rather than flagged as an invalid time.
  const handleManualStart = (value: string) => {
    if (value.trim() === "") return
    const parsed = parseManualTime(value)
    if (parsed === null) {
      toast.error("Enter a valid time, like 1:23.", { position: "top-center" })
      return
    }
    setStart(parsed)
    commitLoop(parsed, end)
  }

  const handleManualEnd = (value: string) => {
    if (value.trim() === "") return
    const parsed = parseManualTime(value)
    if (parsed === null) {
      toast.error("Enter a valid time, like 1:23.", { position: "top-center" })
      return
    }
    setEnd(parsed)
    commitLoop(start, parsed)
  }

  const handleClear = () => {
    setStart(null)
    setEnd(null)
    setLoopSection(null)
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={loopSection ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Loop section"
                  aria-pressed={!!loopSection}
                >
                  <Repeat2 className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Loop section</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="end" className="w-64">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Loop section</p>
          <p className="text-sm font-medium">
            {loopSection ? `${formatTime(loopSection.start)} – ${formatTime(loopSection.end)}` : "Not set"}
          </p>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <span className="w-10 shrink-0 text-xs text-muted-foreground">Start</span>
          {/* Remounted (via `key`) whenever `start` changes elsewhere (the
            Set button, Clear) so its displayed text resyncs to the real
            value - uncontrolled otherwise, so typing isn't fought mid-edit. */}
          <Input
            key={start}
            defaultValue={start !== null ? formatTime(start) : ""}
            placeholder="0:00"
            disabled={!canSetPoints}
            className="h-8 w-16 text-center text-sm tabular-nums"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
            onBlur={(e) => handleManualStart(e.currentTarget.value)}
          />
          <Button variant="outline" size="sm" disabled={!canSetPoints} onClick={handleSetStart}>
            Set
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="w-10 shrink-0 text-xs text-muted-foreground">End</span>
          <Input
            key={end}
            defaultValue={end !== null ? formatTime(end) : ""}
            placeholder="0:00"
            disabled={!canSetPoints}
            className="h-8 w-16 text-center text-sm tabular-nums"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
            onBlur={(e) => handleManualEnd(e.currentTarget.value)}
          />
          <Button variant="outline" size="sm" disabled={!canSetPoints} onClick={handleSetEnd}>
            Set
          </Button>
        </div>

        {isInvalidRange && (
          <p className="text-xs text-destructive">End must be at least {MIN_LOOP_SECONDS}s after start.</p>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={start === null && end === null}
          onClick={handleClear}
        >
          <RotateCcw />
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const STEM_LABELS: Record<StemName, string> = {
  vocals: "Vocals",
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  piano: "Piano",
  other: "Other",
}

interface StemsPopoverProps {
  song: Song
}

// Splits a song into 6 stems via a self-hosted separation worker (see
// services/stem-worker) and, once complete, lets SongPlayerProvider's
// playback switch from the single mixed-down file to an independently
// mixable 6-track one - mute/solo/volume per stem, layered on top of the
// existing pitch/tempo controls rather than replacing them.
const StemsPopover: FunctionComponent<StemsPopoverProps> = ({ song }) => {
  const queryClient = useQueryClient()
  const {
    stemsEnabled,
    enableStemsMode,
    disableStemsMode,
    stemVolumes,
    setStemVolume,
    stemMuted,
    toggleStemMute,
    soloedStem,
    setSoloedStem,
  } = usePlayer()

  const stemStatusQuery = useQuery({
    queryKey: ["song-stems", song.id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/stems", {
        params: { path: { id: song.id } },
      })
      if (error) {
        // A 404 just means separation has never been requested for this
        // song - a normal, valid state, not a failed request.
        if (error.status === 404) return null
        throw new Error("Failed to load stem status.")
      }
      return data
    },
    // Polls while a job is in flight, stops as soon as it lands on a
    // terminal state (or hasn't been started at all).
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" || status === "processing" ? 3000 : false
    },
    // TanStack Query skips interval refetches while the tab is unfocused by
    // default - fine for "keep this on-screen data fresh," wrong here, since
    // separation takes minutes and users routinely tab away while waiting.
    // Without this, the popover can sit stuck on "Separating..." long after
    // the job actually finished, only catching up once the tab regains
    // focus.
    refetchIntervalInBackground: true,
  })

  const startSeparation = useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.POST("/api/songs/{id}/stems", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to start stem separation.")
      return data
    },
    // Seeds the query directly (rather than just invalidating) so the
    // popover flips to the "processing" state immediately instead of
    // waiting on a refetch round-trip.
    onSuccess: (data) => queryClient.setQueryData(["song-stems", song.id], data),
    onError: () => toast.error("Failed to start stem separation.", { position: "top-center" }),
  })

  const job = stemStatusQuery.data
  const isProcessing = job?.status === "pending" || job?.status === "processing"

  // A song already being replayed with a fresh (still-processing) job would
  // otherwise keep audibly playing whatever the *previous* generation
  // produced - dropping back to single-file playback avoids that confusion
  // until the new stems are ready and re-enabled.
  const handleRegenerate = () => {
    if (stemsEnabled) disableStemsMode()
    startSeparation.mutate()
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={stemsEnabled ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="rounded-full"
                  aria-label="Stems"
                  aria-pressed={stemsEnabled}
                >
                  <AudioLines className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Stems</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="end" className="w-72">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Stems</p>
            <p className="text-sm font-medium">
              {job?.status === "completed" && job.urls
                ? "Vocals, drums, bass, guitar, piano & other"
                : isProcessing
                  ? "Separating..."
                  : job?.status === "completed"
                    ? "Incomplete"
                    : "Not split yet"}
            </p>
          </div>
          {isProcessing && <Spinner />}
        </div>

        <Separator />

        {(!job || job.status === "failed" || (job.status === "completed" && !job.urls)) && (
          <div className="flex flex-col gap-2">
            {job?.status === "failed" && (
              <p className="text-xs text-destructive">{job.errorMessage ?? "Separation failed."}</p>
            )}
            {/* Status says "completed" but one or more stem files are missing
              - most likely a job that finished before guitar/piano stems
              existed. No data to fall back to, so this just prompts a
              fresh run rather than showing a broken mixer. */}
            {job?.status === "completed" && !job.urls && (
              <p className="text-xs text-destructive">
                Some stems are missing for this song - separate again to fix it.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={startSeparation.isPending}
              onClick={() => startSeparation.mutate()}
            >
              {startSeparation.isPending ? <Spinner /> : <Wand2 />}
              {job?.status === "failed" || job?.status === "completed" ? "Retry" : "Separate into stems"}
            </Button>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Separating vocals, drums, bass, guitar, piano & other - this can take a few minutes.
            </p>
            {/* An escape hatch for a job that's stuck rather than merely
              slow - e.g. the worker process restarting mid-job (a real risk
              with FastAPI's BackgroundTasks under `uvicorn --reload`) leaves
              this stuck at "pending"/"processing" forever with no callback
              ever coming. Re-submitting reuses the same upsert startSeparation
              already does for "Retry", so it's safe to click even on a job
              that's actually still progressing normally. */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={startSeparation.isPending}
              onClick={() => startSeparation.mutate()}
            >
              {startSeparation.isPending ? <Spinner /> : <RotateCcw />}
              Taking too long? Start over
            </Button>
          </div>
        )}

        {job?.status === "completed" && job.urls && (
          <div className="flex flex-col gap-3">
            <Button
              variant={stemsEnabled ? "secondary" : "outline"}
              size="sm"
              className="w-full"
              aria-pressed={stemsEnabled}
              onClick={() => (stemsEnabled ? disableStemsMode() : enableStemsMode(job.urls!))}
            >
              <AudioLines />
              {stemsEnabled ? "Playing as stems" : "Play as stems"}
            </Button>

            {STEM_NAMES.map((stem) => (
              <div key={stem} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{STEM_LABELS[stem]}</span>
                <Slider
                  value={[stemVolumes[stem]]}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={!stemsEnabled}
                  onValueChange={(value) => setStemVolume(stem, Array.isArray(value) ? (value[0] ?? 0) : value)}
                  className="flex-1"
                />
                <Button
                  variant={stemMuted[stem] ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={`Mute ${STEM_LABELS[stem]}`}
                  aria-pressed={stemMuted[stem]}
                  disabled={!stemsEnabled}
                  onClick={() => toggleStemMute(stem)}
                >
                  {stemMuted[stem] ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </Button>
                <Button
                  variant={soloedStem === stem ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={`Solo ${STEM_LABELS[stem]}`}
                  aria-pressed={soloedStem === stem}
                  disabled={!stemsEnabled}
                  onClick={() => setSoloedStem(soloedStem === stem ? null : stem)}
                >
                  <Headphones className="size-3.5" />
                </Button>
              </div>
            ))}

            <Separator />

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={startSeparation.isPending}
              onClick={handleRegenerate}
            >
              {startSeparation.isPending ? <Spinner /> : <RotateCcw />}
              Regenerate stems
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

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
    skip,
    loopSection,
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

  // A failed fetch also leaves `song` undefined - without this check it'd
  // be indistinguishable from "still loading" and get stuck showing the
  // skeleton forever instead of falling back. Mirrors the loaded bar's
  // layout with every control disabled, rather than collapsing to a bare
  // message, so there's no layout jump once a song actually loads.
  if (!activeSongId || activeSongQuery.isError) {
    return (
      <div className="relative flex h-20 items-center">
        <div className="absolute inset-x-0 top-0">
          <Slider value={[0]} min={0} max={100} disabled className="**:data-[slot=slider-track]:h-0.5" />
        </div>

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card ring-1 ring-foreground/10">
              <Music className="size-5 text-muted-foreground" />
            </div>
            <p className="truncate text-xs text-muted-foreground">Nothing playing</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Shuffle" disabled>
              <Shuffle className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Previous song"
              disabled
            >
              <SkipBack className="size-4 fill-current" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label={`Rewind ${SKIP_SECONDS} seconds`}
              disabled
            >
              <Rewind className="size-4 fill-current" />
            </Button>
            <button aria-label="Play" className="text-muted-foreground" disabled>
              <Play className="size-8 fill-current" />
            </button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label={`Fast forward ${SKIP_SECONDS} seconds`}
              disabled
            >
              <FastForward className="size-4 fill-current" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Next song" disabled>
              <SkipForward className="size-4 fill-current" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Repeat current song"
              disabled
            >
              <Repeat className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Volume" disabled>
              <Volume2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Lyrics and chords"
              disabled
            >
              <FileMusic className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Key and pitch"
              disabled
            >
              <Music2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Tempo" disabled>
              <Metronome className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Loop section" disabled>
              <Repeat2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Stems" disabled>
              <AudioLines className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Song details"
              disabled
            >
              <ListMusic className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!song) {
    return <MusicPlayerBarSkeleton />
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
        {/* The active A-B loop region, if any - a highlighted range under
          the track itself rather than just the two popover labels, so it's
          visible at a glance while scrubbing or glancing at the bar. */}
        {loopSection && canControlPlayback && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-1 rounded-full bg-primary/40"
            style={{
              left: `${(loopSection.start / duration) * 100}%`,
              width: `${((loopSection.end - loopSection.start) / duration) * 100}%`,
            }}
          />
        )}

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
            <p className="truncate text-muted-foreground tabular-nums">
              {formatTime(displayTime)} / {formatTime(duration)}
            </p>
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

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="rounded-full"
                  aria-label={`Rewind ${SKIP_SECONDS} seconds`}
                  disabled={!canControlPlayback}
                  onClick={() => skip(-SKIP_SECONDS)}
                >
                  <Rewind className="size-4 fill-current" />
                </Button>
              }
            />
            <TooltipContent>Rewind {SKIP_SECONDS}s</TooltipContent>
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
                  aria-label={`Fast forward ${SKIP_SECONDS} seconds`}
                  disabled={!canControlPlayback}
                  onClick={() => skip(SKIP_SECONDS)}
                >
                  <FastForward className="size-4 fill-current" />
                </Button>
              }
            />
            <TooltipContent>Forward {SKIP_SECONDS}s</TooltipContent>
          </Tooltip>

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

          <SongKeyPopover key={`key-${song.id}`} song={song} />
          <SongTempoPopover key={`tempo-${song.id}`} song={song} />
          <LoopSectionPopover key={`loop-${song.id}`} />
          <StemsPopover key={`stems-${song.id}`} song={song} />

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
          {/* Keyed by song id so the transpose stepper's local state resets
            when the displayed song changes, same reasoning as
            EditChordProDialog below. */}
          <SongLyricsChords key={song.id} song={song} />
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
