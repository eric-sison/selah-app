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
import { computeDriftCorrections } from "@/utils/stem-sync"
import { STEM_NAMES } from "@/utils/stems"
import type { StemName, StemUrls } from "@/utils/stems"

export interface LoopSection {
  start: number
  end: number
}

const DEFAULT_STEM_VOLUMES: Record<StemName, number> = {
  vocals: 1,
  drums: 1,
  bass: 1,
  guitar: 1,
  piano: 1,
  other: 1,
}
const DEFAULT_STEM_MUTED: Record<StemName, boolean> = {
  vocals: false,
  drums: false,
  bass: false,
  guitar: false,
  piano: false,
  other: false,
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
  // 6-stem playback for the active song, additive to the single-file
  // playback above - see enableStemsMode/disableStemsMode below for how the
  // two modes hand off between each other. `stemsEnabled` is always reset to
  // `false` (and the mix settings below to their defaults) whenever a new
  // song loads - stems are per-song and must be explicitly re-enabled.
  stemsEnabled: boolean
  enableStemsMode: (urls: StemUrls) => Promise<void>
  disableStemsMode: () => void
  stemVolumes: Record<StemName, number>
  setStemVolume: (stem: StemName, value: number) => void
  stemMuted: Record<StemName, boolean>
  toggleStemMute: (stem: StemName) => void
  soloedStem: StemName | null
  setSoloedStem: (stem: StemName | null) => void
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

  // 6 additional hidden <audio> elements, always mounted (see the JSX below)
  // so createMediaElementSource can be called on them exactly once, same
  // constraint as the single `audioRef` above. "vocals" is the sync leader -
  // see the second listener effect below - the other 5 are only ever driven
  // imperatively (play/pause/seek), never listened to directly.
  const stemAudioRefs = useRef<Record<StemName, HTMLAudioElement | null>>({
    vocals: null,
    drums: null,
    bass: null,
    guitar: null,
    piano: null,
    other: null,
  })
  // Built lazily, once, the first time stems mode is actually entered -
  // source -> gain -> soundTouch per stem, fanned into the same SoundTouch
  // node the single-file path uses, so pitch/tempo-shift and the waveform
  // keep working unchanged on the summed 6-stem signal.
  const stemsGraphBuiltRef = useRef(false)
  const stemGainNodesRef = useRef<Partial<Record<StemName, GainNode>>>({})
  const [stemsEnabled, setStemsEnabled] = useState(false)
  const [stemVolumes, setStemVolumes] = useState<Record<StemName, number>>(DEFAULT_STEM_VOLUMES)
  const [stemMuted, setStemMuted] = useState<Record<StemName, boolean>>(DEFAULT_STEM_MUTED)
  const [soloedStem, setSoloedStem] = useState<StemName | null>(null)

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

  // Recomputes each stem's actual gain whenever its volume, mute, or the
  // soloed stem changes - a no-op per stem until ensureStemsGraph has built
  // its GainNode (i.e. before stems mode has ever been entered this
  // session).
  useEffect(() => {
    for (const stem of STEM_NAMES) {
      const gainNode = stemGainNodesRef.current[stem]
      if (!gainNode) continue
      const silenced = stemMuted[stem] || (soloedStem !== null && soloedStem !== stem)
      gainNode.gain.value = silenced ? 0 : stemVolumes[stem]
    }
  }, [stemVolumes, stemMuted, soloedStem])

  const ensureAudioGraph = async () => {
    const audio = audioRef.current
    if (!audio || audioContextRef.current) return

    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)

    // SoundTouchNode drives speed (time-stretch) and transpose (pitch-shift)
    // independently, in real time - the native element's own `playbackRate`
    // is deliberately left untouched (see setSpeed) so there's only one
    // source of truth for tempo. It sits inline in the graph (source ->
    // soundTouch -> analyser -> destination) below so both take effect on
    // whatever's actually playing, not just the values stored in state.
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
    // soundTouch sits ahead of it so both it and the waveform reflect the
    // pitch/time-stretched signal, not the original.
    source.connect(soundTouch)
    soundTouch.connect(analyser)
    analyser.connect(context.destination)

    audioContextRef.current = context
    setAnalyserNode(analyser)
  }

  // Builds the 6 stems' own graph nodes (source -> gain -> soundTouch, fanned
  // into the same SoundTouch node ensureAudioGraph already built) the first
  // time stems mode is actually entered, rather than unconditionally in
  // ensureAudioGraph - most songs never use stems, so this avoids 4 extra
  // createMediaElementSource calls (and their one-per-element lifetime limit)
  // for sessions that don't need them.
  const ensureStemsGraph = async () => {
    await ensureAudioGraph()
    if (stemsGraphBuiltRef.current) return

    const context = audioContextRef.current
    const soundTouch = soundTouchNodeRef.current
    // ensureAudioGraph (awaited above) guarantees both are set - defensive only.
    /* v8 ignore next */
    if (!context || !soundTouch) return

    for (const stem of STEM_NAMES) {
      const audio = stemAudioRefs.current[stem]
      // Every stem <audio> element is rendered unconditionally (see the JSX
      // below), so this is unreachable in practice - kept as a defensive
      // guard, not exercised by tests.
      /* v8 ignore next */
      if (!audio) continue

      const source = context.createMediaElementSource(audio)
      const gain = context.createGain()
      source.connect(gain)
      gain.connect(soundTouch)
      stemGainNodesRef.current[stem] = gain
    }

    stemsGraphBuiltRef.current = true
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

  const setTransposeSemitones = (value: number) => {
    const clamped = Math.min(Math.max(value, MIN_TRANSPOSE_SEMITONES), MAX_TRANSPOSE_SEMITONES)
    const soundTouch = soundTouchNodeRef.current
    if (soundTouch) soundTouch.pitchSemitones.value = clamped
    setTransposeSemitonesState(clamped)
  }

  // Atomic transport primitives for stems mode - every stems-mode branch
  // below (playOrToggle, skip, seek, loop enforcement) goes through these
  // instead of touching individual stem elements directly, so all 4 always
  // move together.
  const pauseAllStems = () => {
    for (const stem of STEM_NAMES) stemAudioRefs.current[stem]?.pause()
  }

  const playAllStems = async (): Promise<void> => {
    await Promise.all(
      STEM_NAMES.map((stem) => {
        const audio = stemAudioRefs.current[stem]
        return audio ? safePlay(audio) : Promise.resolve("aborted" as const)
      })
    )
  }

  // Seeks all 4 directly (rather than the leader alone + waiting for the
  // timeupdate drift-correction pass to catch the followers up) so an
  // explicit seek/skip/loop-restart doesn't have an audible desync window.
  const seekAllStems = (time: number) => {
    for (const stem of STEM_NAMES) {
      const audio = stemAudioRefs.current[stem]
      if (audio) audio.currentTime = time
    }
  }

  const loadSong = async (song: Song, { autoplay }: { autoplay: boolean }) => {
    const audio = audioRef.current
    // The <audio> ref is attached synchronously on mount and every caller
    // of this function only runs after that, so this is unreachable in
    // practice - kept as a defensive guard, not exercised by tests.
    /* v8 ignore next */
    if (!audio) return

    // A new song always starts in single-track mode - stems are per-song, so
    // whatever was enabled/mixed for the previous song doesn't carry over.
    if (stemsEnabled) {
      pauseAllStems()
      setStemsEnabled(false)
    }
    setStemVolumes(DEFAULT_STEM_VOLUMES)
    setStemMuted(DEFAULT_STEM_MUTED)
    setSoloedStem(null)

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
      // A transpose is relative to this specific track's own key - carrying
      // it over to a different song would silently mis-pitch it.
      setTransposeSemitones(0)
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

  // Shared tail of both "ended" handlers below (single-track and stems-mode)
  // once the repeat-current-song case has been ruled out by each - reads
  // only refs, so it's safe to define once here rather than duplicated
  // inside both effects.
  const advanceQueueOrStop = () => {
    const order = playbackOrderRef.current
    const currentIndex = order.findIndex((song) => song.id === activeSongIdRef.current)
    const next = currentIndex >= 0 ? order[currentIndex + 1] : undefined

    if (next) {
      void loadSongRef.current(next, { autoplay: true })
    } else {
      setActiveSongId(null)
    }
  }

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

      advanceQueueOrStop()
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

  // Stems-mode counterpart of the listener effect above, bound to the
  // "vocals" stem as the sync leader instead of the single-file `audioRef`.
  // Both effects stay registered for the component's whole lifetime, but
  // only one element is ever actually playing at a time (enableStemsMode/
  // disableStemsMode always pause whichever side isn't active), so only one
  // side's events ever fire in practice.
  useEffect(() => {
    const leader = stemAudioRefs.current.vocals
    // Every stem <audio> element is rendered unconditionally (see the JSX
    // below), so this is unreachable in practice - kept as a defensive
    // guard, not exercised by tests.
    /* v8 ignore next */
    if (!leader) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)

      if (repeatCurrentSongRef.current) {
        seekAllStems(0)
        void playAllStems()
        return
      }

      advanceQueueOrStop()
    }
    const handleTimeUpdate = () => {
      const loop = loopSectionRef.current
      if (loop && leader.currentTime >= loop.end) {
        seekAllStems(loop.start)
      } else {
        const followerTimes: Partial<Record<StemName, number>> = {}
        for (const stem of STEM_NAMES) {
          if (stem === "vocals") continue
          const follower = stemAudioRefs.current[stem]
          if (follower) followerTimes[stem] = follower.currentTime
        }

        const corrections = computeDriftCorrections(leader.currentTime, followerTimes)
        for (const [stem, time] of Object.entries(corrections) as [StemName, number][]) {
          const follower = stemAudioRefs.current[stem]
          if (follower) follower.currentTime = time
        }
      }
      setCurrentTime(leader.currentTime)
    }
    const handleLoadedMetadata = () => setDuration(leader.duration)

    leader.addEventListener("play", handlePlay)
    leader.addEventListener("pause", handlePause)
    leader.addEventListener("ended", handleEnded)
    leader.addEventListener("timeupdate", handleTimeUpdate)
    leader.addEventListener("loadedmetadata", handleLoadedMetadata)

    return () => {
      leader.removeEventListener("play", handlePlay)
      leader.removeEventListener("pause", handlePause)
      leader.removeEventListener("ended", handleEnded)
      leader.removeEventListener("timeupdate", handleTimeUpdate)
      leader.removeEventListener("loadedmetadata", handleLoadedMetadata)
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
      if (stemsEnabled) {
        const leader = stemAudioRefs.current.vocals
        if (leader?.paused) {
          await playAllStems()
        } else {
          pauseAllStems()
        }
        return
      }

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
    if (stemsEnabled) {
      const leader = stemAudioRefs.current.vocals
      if (!leader || !Number.isFinite(leader.duration)) return
      seekAllStems(Math.min(Math.max(leader.currentTime + seconds, 0), leader.duration))
      return
    }

    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration)
  }

  const seek = (time: number) => {
    if (stemsEnabled) {
      seekAllStems(time)
      return
    }

    const audio = audioRef.current
    // See loadSong's identical guard above - unreachable once mounted.
    /* v8 ignore next */
    if (!audio) return
    audio.currentTime = time
  }

  const stopIfActive = (songId: string) => {
    cancelledLoadIdsRef.current.add(songId)

    if (activeSongIdRef.current !== songId) return

    if (stemsEnabled) {
      pauseAllStems()
      setStemsEnabled(false)
    }

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
    // Master volume is applied per-element (there's no single node it'd
    // otherwise pass through) - written to all 6 stems too so the one
    // volume control keeps working regardless of which mode is active. This
    // is independent of each stem's own relative mix level (stemVolumes,
    // applied via its GainNode) - the two multiply together.
    for (const stem of STEM_NAMES) {
      const stemAudio = stemAudioRefs.current[stem]
      if (stemAudio) stemAudio.volume = clamped
    }
    setVolumeState(clamped)
  }

  const setSpeed = (value: number) => {
    const clamped = Math.min(Math.max(value, MIN_SPEED), MAX_SPEED)
    const soundTouch = soundTouchNodeRef.current
    if (soundTouch) soundTouch.playbackRate.value = clamped
    setSpeedState(clamped)
  }

  // Hands playback off from the single-file element to the 6 stem elements
  // at the same position/play-state - see the guiding constraint in the
  // feature's plan doc: the single-file path above stays untouched, this is
  // purely additive. Only callable once stems are known to exist for the
  // active song (the popover UI is responsible for that check, since it's
  // the one polling separation status).
  const enableStemsMode = async (urls: StemUrls) => {
    if (stemsEnabled) return
    await ensureStemsGraph()

    const audio = audioRef.current
    const resumeTime = audio?.currentTime ?? 0
    const wasPlaying = isPlaying
    audio?.pause()

    for (const stem of STEM_NAMES) {
      const stemAudio = stemAudioRefs.current[stem]
      if (!stemAudio) continue
      stemAudio.volume = volume
      stemAudio.src = urls[stem]
      stemAudio.currentTime = resumeTime
    }

    setStemsEnabled(true)

    if (wasPlaying) await playAllStems()
  }

  const disableStemsMode = () => {
    if (!stemsEnabled) return

    const leader = stemAudioRefs.current.vocals
    const resumeTime = leader?.currentTime ?? currentTime
    const wasPlaying = isPlaying
    pauseAllStems()
    setStemsEnabled(false)

    const audio = audioRef.current
    if (audio) {
      audio.currentTime = resumeTime
      if (wasPlaying) void safePlay(audio)
    }
  }

  const setStemVolume = (stem: StemName, value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1)
    setStemVolumes((prev) => ({ ...prev, [stem]: clamped }))
  }

  const toggleStemMute = (stem: StemName) => {
    setStemMuted((prev) => ({ ...prev, [stem]: !prev[stem] }))
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
        stemsEnabled,
        enableStemsMode,
        disableStemsMode,
        stemVolumes,
        setStemVolume,
        stemMuted,
        toggleStemMute,
        soloedStem,
        setSoloedStem,
      }}
    >
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
      {STEM_NAMES.map((stem) => (
        <audio
          key={stem}
          ref={(el) => {
            stemAudioRefs.current[stem] = el
          }}
          className="hidden"
          crossOrigin="anonymous"
        />
      ))}
      {children}
    </PlayerContext.Provider>
  )
}
