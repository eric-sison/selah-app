"use client"

import { toast } from "@workspace/ui/components/Sonner"
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { apiClient } from "@/lib/api-client"
import type { Song } from "@/components/MiniMusicPlayer"

interface PlayerContextValue {
  activeSongId: string | null
  isPlaying: boolean
  isLoadingSongId: string | null
  currentTime: number
  duration: number
  analyserNode: AnalyserNode | null
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
  skip: (seconds: number) => void
  seek: (time: number) => void
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
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const [activeSongId, setActiveSongId] = useState<string | null>(null)
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // The songs to auto-advance through when the current one ends. Mirrored
  // into refs so the "ended" listener (registered once on mount) always
  // reads the latest queue/song instead of a stale closure.
  const [queue, setQueue] = useState<Song[]>([])
  const queueRef = useRef<Song[]>([])
  const activeSongIdRef = useRef<string | null>(null)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    activeSongIdRef.current = activeSongId
  }, [activeSongId])

  const ensureAudioGraph = async () => {
    const audio = audioRef.current
    if (!audio || audioContextRef.current) return

    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)
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
      toast.error("Failed to load song.", { position: "top-center" })
    } finally {
      setLoadingSongId(null)
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)

      const currentQueue = queueRef.current
      const currentIndex = currentQueue.findIndex((song) => song.id === activeSongIdRef.current)
      const next = currentIndex >= 0 ? currentQueue[currentIndex + 1] : undefined

      if (next) {
        void loadSong(next, { autoplay: true })
      } else {
        setActiveSongId(null)
      }
    }
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
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

  const skip = (seconds: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration)
  }

  const seek = (time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
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
        selectSong,
        playOrToggle,
        skip,
        seek,
      }}
    >
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
      {children}
    </PlayerContext.Provider>
  )
}
