"use client"

import type { SoundTouchNode } from "@soundtouchjs/audio-worklet"
import { toast } from "@workspace/ui/components/Sonner"
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { apiClient } from "@/lib/api-client"
import type { Song } from "@/components/songs/NowPlayingCard"
import { shuffleArray } from "@/utils/shuffle"

export interface LoopSection {
  start: number
  end: number
}

const MIN_SPEED = 0.5
const MAX_SPEED = 1.5
const MIN_TRANSPOSE_SEMITONES = -12
const MAX_TRANSPOSE_SEMITONES = 12

interface PlayerContextValue {
  activeSongId: string | null
  isPlaying: boolean
  isLoadingSongId: string | null
  currentTime: number
  duration: number
  analyserNode: AnalyserNode | null
  volume: number
  setVolume: (value: number) => void
  speed: number
  setSpeed: (value: number) => void
  transposeSemitones: number
  setTransposeSemitones: (value: number) => void
  loopSection: LoopSection | null
  setLoopSection: (section: LoopSection | null) => void
  // The songs that auto-play in order after the active one ends - see
  // `selectSong`/`playOrToggle` below for how it's populated.
  queue: Song[]
  isShuffling: boolean
  toggleShuffle: () => void
  // `queue` in shuffled order when `isShuffling` is on, otherwise `queue`
  // itself - what `playNext`/`playPrevious`/auto-advance actually step
  // through.
  playbackOrder: Song[]
  repeatCurrentSong: boolean
  toggleRepeatCurrentSong: () => void
  // `queue`, when provided, replaces the current play queue - the songs that
  // auto-play in order after this one ends. Omit it to just resume/pause
  // whatever's already loaded (e.g. from the mini player's own controls).
  //
  // selectSong: loads a song (and sets it as featured in the mini player)
  // without starting playback - for browsing the list without interrupting
  // whatever's already playing until the user explicitly presses play.
  // playOrToggle: loads and immediately plays a new song, or toggles
  // play/pause if it's already the loaded one - for explicit play buttons.
  selectSong: (song: Song, queue?: Song[]) => void
  playOrToggle: (song: Song, queue?: Song[]) => void
  playNext: () => void
  playPrevious: () => void
  skip: (seconds: number) => void
  seek: (time: number) => void
  // Stops playback and clears the active song, but only if `songId` is the
  // one currently loaded - otherwise just suppresses the error toast from
  // any `loadSong` request still in flight for it. Called after deleting a
  // song (see SongList.tsx's handleDelete) so a deleted-but-still-playing
  // track doesn't keep playing with its now-stale data on screen, and a
  // pending load that 404s as a result doesn't surface a misleading error.
  stopIfActive: (songId: string) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error("usePlayer must be used within a SongPlayerProvider")
  }
  return context
}

export const SongPlayerProvider: FunctionComponent<PropsWithChildren> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  // createMediaElementSource can only ever be called once per <audio>
  // element, so the audio graph is built lazily on first playback and cached
  // here rather than recreated per song.
  const audioContextRef = useRef<AudioContext | null>(null)
  const soundTouchNodeRef = useRef<SoundTouchNode | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const [activeSongId, setActiveSongId] = useState<string | null>(null)
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [speed, setSpeedState] = useState(1)
  const [transposeSemitones, setTransposeSemitonesState] = useState(0)
  const [loopSection, setLoopSection] = useState<LoopSection | null>(null)
  const [isShuffling, setIsShuffling] = useState(false)
  const [repeatCurrentSong, setRepeatCurrentSong] = useState(false)

  // The songs to auto-advance through when the current one ends. Mirrored
  // into refs so the "ended" listener (registered once on mount) always
  // reads the latest queue/song instead of a stale closure.
  const [queue, setQueue] = useState<Song[]>([])
  // Recomputed only when `queue` itself changes, so toggling shuffle on/off
  // doesn't reshuffle mid-session - order stays stable for the life of a
  // given queue.
  const shuffledQueue = useMemo(() => shuffleArray(queue), [queue])
  const playbackOrder = isShuffling ? shuffledQueue : queue
  const playbackOrderRef = useRef<Song[]>([])
  const queueRef = useRef<Song[]>([])
  const activeSongIdRef = useRef<string | null>(null)
  // Song ids `stopIfActive` has been called for - a `loadSong` request can
  // still be in flight for one of these (e.g. the auto-select-first-song
  // effect below, or a play click right before the row's deleted), and by
  // the time it resolves the API 404s since the row is gone. Without this,
  // that surfaces as a misleading "Failed to load song" toast even though
  // the delete itself succeeded - see `loadSong`'s catch block.
  const cancelledLoadIdsRef = useRef<Set<string>>(new Set())
  // The `timeupdate` listener is registered once on mount, so it needs a ref
  // (not the `loopSection` state directly) to always read the latest value
  // instead of a stale closure.
  const loopSectionRef = useRef<LoopSection | null>(null)
  const repeatCurrentSongRef = useRef(false)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    playbackOrderRef.current = playbackOrder
  }, [playbackOrder])

  useEffect(() => {
    activeSongIdRef.current = activeSongId
  }, [activeSongId])

  useEffect(() => {
    loopSectionRef.current = loopSection
  }, [loopSection])

  useEffect(() => {
    repeatCurrentSongRef.current = repeatCurrentSong
  }, [repeatCurrentSong])

  const ensureAudioGraph = async () => {
    const audio = audioRef.current
    if (!audio || audioContextRef.current) return

    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)

    // SoundTouchNode will drive speed (time-stretch) and transpose
    // (pitch-shift) independently, in real time, once the UI controls for
    // them return - the native element's own `playbackRate` is deliberately
    // left untouched (see setSpeed) so there's only one source of truth for
    // tempo. It's registered and instantiated eagerly so setSpeed/
    // setTransposeSemitones have a live node to write to, but it's not
    // wired into the signal path below yet (bypassed, source connects
    // straight to the analyser) - keep it that way until it's re-verified
    // end to end.
    //
    // Imported dynamically rather than as a static top-level import: the
    // package's SoundTouchNode class declaration does `extends
    // AudioWorkletNode`, which evaluates immediately at module load - a
    // static import would crash when this "use client" module gets
    // evaluated during SSR, since Node has no AudioWorkletNode global. A
    // dynamic import here only ever runs inside this browser-only function.
    const { SoundTouchNode } = await import("@soundtouchjs/audio-worklet")
    await SoundTouchNode.register(context, "/soundtouch-processor.js")
    const soundTouch = new SoundTouchNode({ context })
    soundTouchNodeRef.current = soundTouch

    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8

    // Analyser sits inline in the graph rather than as a side-tap, so it must
    // also connect to destination or the audio element goes silent.
    source.connect(analyser)
    analyser.connect(context.destination)

    audioContextRef.current = context
    setAnalyserNode(analyser)
  }

  // audio.play() rejects for two very different reasons: AbortError, which
  // just means a subsequent pause()/src change interrupted this same play
  // request (expected, not a real failure - e.g. rapid clicking between
  // rows), and everything else (e.g. NotSupportedError, most often seen here
  // when a presigned stream URL expired - 1hr TTL - while paused, so
  // resuming can no longer fetch the unbuffered remainder). Both must be
  // caught here regardless, since play() is called fire-and-forget from
  // onClick handlers with nothing else to catch a rejection.
  const safePlay = async (audio: HTMLAudioElement): Promise<"played" | "aborted" | "failed"> => {
    try {
      await audio.play()
      return "played"
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "aborted"
      return "failed"
    }
  }

  const loadSong = async (song: Song, { autoplay }: { autoplay: boolean }) => {
    const audio = audioRef.current
    // The <audio> ref is attached synchronously on mount and every caller
    // of this function only runs after that, so this is unreachable in
    // practice - kept as a defensive guard, not exercised by tests.
    /* v8 ignore next */
    if (!audio) return

    setLoadingSongId(song.id)
    try {
      const { data, error } = await apiClient.GET("/api/songs/{id}/stream-url", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to load audio.")

      audio.pause()
      audio.src = data.url
      setActiveSongId(song.id)
      setCurrentTime(0)
      setDuration(0)
      // A loop range is a time offset into a specific track - meaningless
      // once the track changes.
      setLoopSection(null)
      if (autoplay) {
        const result = await safePlay(audio)
        if (result === "failed") {
          toast.error("Failed to play song.", { position: "top-center" })
        }
      } else {
        // Assigning `src` doesn't reliably fire a synchronous "pause" event
        // across browsers, so isPlaying can otherwise be left stale from
        // whatever was previously loaded - force it rather than trust that.
        setIsPlaying(false)
      }
    } catch {
      if (!cancelledLoadIdsRef.current.has(song.id)) {
        toast.error("Failed to load song.", { position: "top-center" })
      }
    } finally {
      setLoadingSongId(null)
    }
  }

  // Mirrored into a ref for the same reason as `queueRef` etc. above - the
  // "ended" listener below is registered once on mount, so calling `loadSong`
  // directly would close over the function from that first render.
  const loadSongRef = useRef(loadSong)
  useEffect(() => {
    loadSongRef.current = loadSong
  })

  useEffect(() => {
    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)

      if (repeatCurrentSongRef.current) {
        audio.currentTime = 0
        void safePlay(audio)
        return
      }

      const order = playbackOrderRef.current
      const currentIndex = order.findIndex((song) => song.id === activeSongIdRef.current)
      const next = currentIndex >= 0 ? order[currentIndex + 1] : undefined

      if (next) {
        void loadSongRef.current(next, { autoplay: true })
      } else {
        setActiveSongId(null)
      }
    }
    const handleTimeUpdate = () => {
      const loop = loopSectionRef.current
      if (loop && audio.currentTime >= loop.end) {
        audio.currentTime = loop.start
      }
      setCurrentTime(audio.currentTime)
    }
    const handleLoadedMetadata = () => setDuration(audio.duration)

    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)

    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
    }
  }, [])

  const selectSong = async (song: Song, songQueue?: Song[]) => {
    await ensureAudioGraph()

    if (songQueue) {
      setQueue(songQueue)
    }

    if (activeSongId === song.id) return

    await loadSong(song, { autoplay: false })
  }

  const playOrToggle = async (song: Song, songQueue?: Song[]) => {
    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return

    await ensureAudioGraph()
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    if (songQueue) {
      setQueue(songQueue)
    }

    if (activeSongId === song.id) {
      if (audio.paused) {
        const resumeTime = audio.currentTime
        const result = await safePlay(audio)
        // Most likely cause: the presigned URL (1hr TTL) expired while this
        // was paused, so the browser can no longer fetch the unbuffered
        // remainder - reload a fresh URL and pick back up where it left off.
        if (result === "failed") {
          await loadSong(song, { autoplay: true })
          seek(resumeTime)
        }
      } else {
        audio.pause()
      }
      return
    }

    await loadSong(song, { autoplay: true })
  }

  const playNext = async () => {
    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return

    await ensureAudioGraph()
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    const currentIndex = playbackOrder.findIndex((song) => song.id === activeSongId)
    const next = currentIndex >= 0 ? playbackOrder[currentIndex + 1] : playbackOrder[0]
    if (next) await loadSong(next, { autoplay: true })
  }

  const playPrevious = async () => {
    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return

    await ensureAudioGraph()
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    const currentIndex = playbackOrder.findIndex((song) => song.id === activeSongId)
    const previous = currentIndex > 0 ? playbackOrder[currentIndex - 1] : undefined
    if (previous) await loadSong(previous, { autoplay: true })
  }

  const toggleShuffle = () => setIsShuffling((prev) => !prev)

  const toggleRepeatCurrentSong = () => setRepeatCurrentSong((prev) => !prev)

  const skip = (seconds: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration)
  }

  const seek = (time: number) => {
    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return
    audio.currentTime = time
  }

  const stopIfActive = (songId: string) => {
    cancelledLoadIdsRef.current.add(songId)

    if (activeSongIdRef.current !== songId) return

    const audio = audioRef.current
    // See setVolume's identical guard below - unreachable once mounted.
    /* v8 ignore else */
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    setActiveSongId(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }

  const setVolume = (value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1)
    const audio = audioRef.current
    // audio is always populated once mounted (see loadSong above) - the
    // `if` here (rather than an early return) is just to keep state/audio
    // writes together, not a real conditional in practice.
    /* v8 ignore next */
    if (audio) audio.volume = clamped
    setVolumeState(clamped)
  }

  const setSpeed = (value: number) => {
    const clamped = Math.min(Math.max(value, MIN_SPEED), MAX_SPEED)
    const soundTouch = soundTouchNodeRef.current
    if (soundTouch) soundTouch.playbackRate.value = clamped
    setSpeedState(clamped)
  }

  const setTransposeSemitones = (value: number) => {
    const clamped = Math.min(Math.max(value, MIN_TRANSPOSE_SEMITONES), MAX_TRANSPOSE_SEMITONES)
    const soundTouch = soundTouchNodeRef.current
    if (soundTouch) soundTouch.pitchSemitones.value = clamped
    setTransposeSemitonesState(clamped)
  }

  return (
    <PlayerContext.Provider
      value={{
        activeSongId,
        isPlaying,
        isLoadingSongId: loadingSongId,
        currentTime,
        duration,
        analyserNode,
        volume,
        setVolume,
        speed,
        setSpeed,
        transposeSemitones,
        setTransposeSemitones,
        loopSection,
        setLoopSection,
        queue,
        isShuffling,
        toggleShuffle,
        playbackOrder,
        repeatCurrentSong,
        toggleRepeatCurrentSong,
        selectSong,
        playOrToggle,
        playNext,
        playPrevious,
        skip,
        seek,
        stopIfActive,
      }}
    >
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
      {children}
    </PlayerContext.Provider>
  )
}
