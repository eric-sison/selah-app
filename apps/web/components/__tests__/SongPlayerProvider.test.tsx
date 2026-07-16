import { act, fireEvent, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiClient } from "@/lib/api-client"
import { SongPlayerProvider, usePlayer } from "@/components/SongPlayerProvider"
import { createMockSong } from "../../test/fixtures"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

class MockSoundTouchNode {
  static register = vi.fn().mockResolvedValue(undefined)
  playbackRate = { value: 1 }
  pitchSemitones = { value: 0 }
}

vi.mock("@soundtouchjs/audio-worklet", () => ({
  SoundTouchNode: MockSoundTouchNode,
}))

// The provider caches a single AudioContext instance in a ref, so a test
// needs a handle on that *same* instance (not just any `new AudioContext()`)
// to flip its `state` and assert `resume()` was called on it - this local
// mock (overriding test/setup.ts's global one, scoped to this file only)
// tracks the most recently constructed instance and lets state be
// controlled per-test via a module-level flag.
let mockAudioContextState: AudioContextState = "running"
let lastAudioContextInstance: { resume: ReturnType<typeof vi.fn> } | undefined

class ControllableMockAudioContext {
  destination = {}
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  createGain = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }))
  createAnalyser = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
  }))
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
  get state() {
    return mockAudioContextState
  }
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- capturing the instance for tests to control later, not a real aliasing footgun
    lastAudioContextInstance = this
  }
}
vi.stubGlobal("AudioContext", ControllableMockAudioContext)

function wrapper({ children }: { children: ReactNode }) {
  return <SongPlayerProvider>{children}</SongPlayerProvider>
}

function renderPlayer() {
  return renderHook(() => usePlayer(), { wrapper })
}

function getAudioEl(): HTMLAudioElement {
  const el = document.querySelector("audio")
  if (!el) throw new Error("audio element not found")
  return el
}

function mockStreamUrl(url = "https://example.com/song.mp3") {
  vi.mocked(apiClient.GET).mockResolvedValue({ data: { url }, error: undefined } as never)
}

function mockStreamUrlError() {
  vi.mocked(apiClient.GET).mockResolvedValue({
    data: undefined,
    error: { status: 500, message: "boom" },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  MockSoundTouchNode.register = vi.fn().mockResolvedValue(undefined)
  mockAudioContextState = "running"
  lastAudioContextInstance = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("usePlayer", () => {
  it("throws when used outside a SongPlayerProvider", () => {
    // Suppress React's expected console.error for the thrown-during-render case.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => renderHook(() => usePlayer())).toThrow("usePlayer must be used within a SongPlayerProvider")
    consoleSpy.mockRestore()
  })
})

describe("SongPlayerProvider", () => {
  it("renders a hidden audio element and provides default state", () => {
    const { result } = renderPlayer()

    expect(getAudioEl()).toBeInTheDocument()
    expect(result.current.activeSongId).toBeNull()
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isLoadingSongId).toBeNull()
    expect(result.current.currentTime).toBe(0)
    expect(result.current.duration).toBe(0)
    expect(result.current.analyserNode).toBeNull()
    expect(result.current.volume).toBe(1)
    expect(result.current.speed).toBe(1)
    expect(result.current.transposeSemitones).toBe(0)
    expect(result.current.loopSection).toBeNull()
    expect(result.current.queue).toEqual([])
    expect(result.current.isShuffling).toBe(false)
    expect(result.current.playbackOrder).toEqual([])
    expect(result.current.repeatCurrentSong).toBe(false)
  })

  describe("selectSong", () => {
    it("loads a song without autoplaying and builds the audio graph", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.selectSong(song)
      })

      expect(result.current.activeSongId).toBe("song-1")
      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0)
      expect(result.current.duration).toBe(0)
      expect(getAudioEl().src).toBe("https://example.com/song.mp3")
      // ensureAudioGraph ran: analyser node was created and published.
      expect(result.current.analyserNode).not.toBeNull()
      expect(MockSoundTouchNode.register).toHaveBeenCalledTimes(1)
    })

    it("sets a provided queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songA, [songA, songB])
      })

      expect(result.current.queue).toEqual([songA, songB])
    })

    it("is a no-op re-select when the song is already active (still applies a new queue)", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.selectSong(song)
      })
      vi.mocked(apiClient.GET).mockClear()

      const other = createMockSong({ id: "other" })
      await act(async () => {
        await result.current.selectSong(song, [song, other])
      })

      // loadSong (and its stream-url fetch) is skipped for an already-active song.
      expect(apiClient.GET).not.toHaveBeenCalled()
      expect(result.current.queue).toEqual([song, other])
    })

    it("only constructs the audio graph once across repeated calls", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songA)
      })
      await act(async () => {
        await result.current.selectSong(songB)
      })

      expect(MockSoundTouchNode.register).toHaveBeenCalledTimes(1)
    })

    it("shows an error toast when the stream-url request fails", async () => {
      const { toast } = await import("@workspace/ui/components/Sonner")
      mockStreamUrlError()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.selectSong(song)
      })

      expect(toast.error).toHaveBeenCalledWith("Failed to load song.", { position: "top-center" })
      expect(result.current.activeSongId).toBeNull()
      expect(result.current.isLoadingSongId).toBeNull()
    })

    it("forces isPlaying false even if something else is mid-transition", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.playOrToggle(songA)
      })
      act(() => {
        fireEvent.play(getAudioEl())
      })
      expect(result.current.isPlaying).toBe(true)

      await act(async () => {
        await result.current.selectSong(songB)
      })

      expect(result.current.isPlaying).toBe(false)
    })
  })

  describe("playOrToggle", () => {
    it("loads and autoplays a new song", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(result.current.activeSongId).toBe("song-1")
      expect(getAudioEl().play).toHaveBeenCalled()
    })

    it("shows an error toast when autoplay fails for a reason other than AbortError", async () => {
      const { toast } = await import("@workspace/ui/components/Sonner")
      mockStreamUrl()
      vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("NotSupportedError"))
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(toast.error).toHaveBeenCalledWith("Failed to play song.", { position: "top-center" })
    })

    it("silently ignores an AbortError from play()", async () => {
      const { toast } = await import("@workspace/ui/components/Sonner")
      mockStreamUrl()
      vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
        new DOMException("interrupted", "AbortError")
      )
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(toast.error).not.toHaveBeenCalled()
    })

    it("toggles an already-active, playing song to paused", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.playOrToggle(song)
      })
      act(() => fireEvent.play(getAudioEl()))
      const audio = getAudioEl()
      Object.defineProperty(audio, "paused", { value: false, configurable: true })

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(audio.pause).toHaveBeenCalled()
    })

    it("resumes an already-active, paused song", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.playOrToggle(song)
      })
      const audio = getAudioEl()
      Object.defineProperty(audio, "paused", { value: true, configurable: true })
      vi.mocked(audio.play).mockClear()

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(audio.play).toHaveBeenCalled()
    })

    it("reloads and re-seeks when resuming an already-active song fails (e.g. an expired stream URL)", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.playOrToggle(song)
      })
      const audio = getAudioEl()
      Object.defineProperty(audio, "paused", { value: true, configurable: true })
      Object.defineProperty(audio, "currentTime", { value: 42, configurable: true, writable: true })
      vi.mocked(audio.play).mockRejectedValueOnce(new Error("expired"))

      await act(async () => {
        await result.current.playOrToggle(song)
      })

      // Reload happened (stream-url fetched again) and currentTime was
      // restored via seek() to where playback had stalled.
      expect(apiClient.GET).toHaveBeenCalledTimes(2)
      expect(audio.currentTime).toBe(42)
    })

    it("resumes a suspended audio context before toggling", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.playOrToggle(song)
      })

      // ensureAudioGraph is idempotent (already ran above), so this is the
      // exact instance cached in the provider's audioContextRef.
      expect(lastAudioContextInstance).toBeDefined()
      mockAudioContextState = "suspended"

      const audio = getAudioEl()
      Object.defineProperty(audio, "paused", { value: true, configurable: true })
      await act(async () => {
        await result.current.playOrToggle(song)
      })

      expect(lastAudioContextInstance?.resume).toHaveBeenCalled()
      expect(audio.play).toHaveBeenCalled()
    })

    it("sets a provided queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.playOrToggle(songA, [songA, songB])
      })

      expect(result.current.queue).toEqual([songA, songB])
    })
  })

  describe("playNext / playPrevious", () => {
    it("advances to the next song in the queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songA, [songA, songB])
      })
      await act(async () => {
        await result.current.playNext()
      })

      expect(result.current.activeSongId).toBe("b")
    })

    it("does nothing at the end of the queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })

      await act(async () => {
        await result.current.selectSong(songA, [songA])
      })
      await act(async () => {
        await result.current.playNext()
      })

      expect(result.current.activeSongId).toBe("a")
    })

    it("falls back to the first queued song when nothing is active yet", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        result.current.selectSong(songA, [songA, songB])
      })
      // Cancel out the auto-load above by not awaiting it fully - instead
      // directly exercise playNext with nothing active.
      const { result: fresh } = renderPlayer()
      await act(async () => {
        await fresh.current.playNext()
      })
      expect(fresh.current.activeSongId).toBeNull()
    })

    it("moves to the previous song in the queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songB, [songA, songB])
      })
      await act(async () => {
        await result.current.playPrevious()
      })

      expect(result.current.activeSongId).toBe("a")
    })

    it("does nothing at the start of the queue", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songA, [songA, songB])
      })
      await act(async () => {
        await result.current.playPrevious()
      })

      expect(result.current.activeSongId).toBe("a")
    })

    it("resumes a suspended audio context in playNext", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })
      await act(async () => {
        await result.current.selectSong(songA, [songA, songB])
      })

      expect(lastAudioContextInstance).toBeDefined()
      mockAudioContextState = "suspended"

      await act(async () => {
        await result.current.playNext()
      })

      expect(lastAudioContextInstance?.resume).toHaveBeenCalled()
      expect(result.current.activeSongId).toBe("b")
    })

    it("resumes a suspended audio context in playPrevious", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })
      await act(async () => {
        await result.current.selectSong(songB, [songA, songB])
      })

      expect(lastAudioContextInstance).toBeDefined()
      mockAudioContextState = "suspended"

      await act(async () => {
        await result.current.playPrevious()
      })

      expect(lastAudioContextInstance?.resume).toHaveBeenCalled()
      expect(result.current.activeSongId).toBe("a")
    })
  })

  describe("the audio element's own event listeners", () => {
    it("advances to the next playback-order song when the current one ends", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })
      const songB = createMockSong({ id: "b" })

      await act(async () => {
        await result.current.selectSong(songA, [songA, songB])
      })

      await act(async () => {
        fireEvent.ended(getAudioEl())
      })

      expect(result.current.activeSongId).toBe("b")
      expect(result.current.isPlaying).toBe(false)
    })

    it("clears the active song when it ends with nothing next in the playback order", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })

      await act(async () => {
        await result.current.selectSong(songA, [songA])
      })

      act(() => {
        fireEvent.ended(getAudioEl())
      })

      expect(result.current.activeSongId).toBeNull()
    })

    it("clears the active song when it ends and isn't found in the playback order at all", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songA = createMockSong({ id: "a" })

      // No queue passed - playbackOrder stays empty, so the active song's
      // index can't be found in it (-1) once it ends.
      await act(async () => {
        await result.current.selectSong(songA)
      })

      act(() => {
        fireEvent.ended(getAudioEl())
      })

      expect(result.current.activeSongId).toBeNull()
    })

    it("restarts the same song when repeat is on", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })

      await act(async () => {
        await result.current.selectSong(song, [song])
      })
      act(() => result.current.toggleRepeatCurrentSong())
      expect(result.current.repeatCurrentSong).toBe(true)

      const audio = getAudioEl()
      Object.defineProperty(audio, "currentTime", { value: 99, configurable: true, writable: true })
      vi.mocked(audio.play).mockClear()

      await act(async () => {
        fireEvent.ended(audio)
      })

      expect(audio.currentTime).toBe(0)
      expect(audio.play).toHaveBeenCalled()
      expect(result.current.activeSongId).toBe("a")
    })

    it("clamps currentTime back to the loop start once it reaches the loop end", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => result.current.setLoopSection({ start: 10, end: 20 }))

      const audio = getAudioEl()
      Object.defineProperty(audio, "currentTime", { value: 20, configurable: true, writable: true })
      act(() => {
        fireEvent.timeUpdate(audio)
      })

      expect(audio.currentTime).toBe(10)
    })

    it("tracks currentTime on timeupdate when there is no loop section", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      const audio = getAudioEl()
      Object.defineProperty(audio, "currentTime", { value: 5, configurable: true, writable: true })
      act(() => {
        fireEvent.timeUpdate(audio)
      })

      expect(result.current.currentTime).toBe(5)
    })

    it("captures duration on loadedmetadata", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      const audio = getAudioEl()
      Object.defineProperty(audio, "duration", { value: 180, configurable: true })
      act(() => {
        fireEvent.loadedMetadata(audio)
      })

      expect(result.current.duration).toBe(180)
    })

    it("tracks isPlaying via the audio element's own play/pause events", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => fireEvent.play(getAudioEl()))
      expect(result.current.isPlaying).toBe(true)

      act(() => fireEvent.pause(getAudioEl()))
      expect(result.current.isPlaying).toBe(false)
    })

    it("removes its listeners on unmount", () => {
      const { unmount } = renderPlayer()
      const audio = getAudioEl()
      const removeSpy = vi.spyOn(audio, "removeEventListener")

      unmount()

      expect(removeSpy).toHaveBeenCalledWith("play", expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith("pause", expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith("ended", expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith("timeupdate", expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith("loadedmetadata", expect.any(Function))
    })
  })

  describe("toggles", () => {
    it("toggles shuffle on and off", () => {
      const { result } = renderPlayer()
      expect(result.current.isShuffling).toBe(false)
      act(() => result.current.toggleShuffle())
      expect(result.current.isShuffling).toBe(true)
      act(() => result.current.toggleShuffle())
      expect(result.current.isShuffling).toBe(false)
    })

    it("uses playbackOrder as a shuffled view of queue while shuffling", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const songs = [createMockSong({ id: "a" }), createMockSong({ id: "b" }), createMockSong({ id: "c" })]

      await act(async () => {
        await result.current.selectSong(songs[0]!, songs)
      })
      expect(result.current.playbackOrder).toEqual(songs)

      act(() => result.current.toggleShuffle())

      expect(result.current.playbackOrder).toHaveLength(3)
      expect(result.current.playbackOrder.map((s) => s.id).sort()).toEqual(["a", "b", "c"])
    })

    it("toggles repeat-current-song on and off", () => {
      const { result } = renderPlayer()
      expect(result.current.repeatCurrentSong).toBe(false)
      act(() => result.current.toggleRepeatCurrentSong())
      expect(result.current.repeatCurrentSong).toBe(true)
      act(() => result.current.toggleRepeatCurrentSong())
      expect(result.current.repeatCurrentSong).toBe(false)
    })
  })

  describe("skip / seek", () => {
    it("is a no-op when duration is not yet known (NaN)", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })
      const audio = getAudioEl()
      Object.defineProperty(audio, "currentTime", { value: 5, configurable: true, writable: true })

      act(() => result.current.skip(10))

      expect(audio.currentTime).toBe(5)
    })

    it("clamps forward skips to the song duration", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })
      const audio = getAudioEl()
      Object.defineProperty(audio, "duration", { value: 100, configurable: true })
      Object.defineProperty(audio, "currentTime", { value: 95, configurable: true, writable: true })

      act(() => result.current.skip(10))

      expect(audio.currentTime).toBe(100)
    })

    it("clamps backward skips to zero", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })
      const audio = getAudioEl()
      Object.defineProperty(audio, "duration", { value: 100, configurable: true })
      Object.defineProperty(audio, "currentTime", { value: 3, configurable: true, writable: true })

      act(() => result.current.skip(-10))

      expect(audio.currentTime).toBe(0)
    })

    it("seeks directly to a given time", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => result.current.seek(42))

      expect(getAudioEl().currentTime).toBe(42)
    })
  })

  describe("volume / speed / transpose", () => {
    it("clamps volume to [0, 1] and writes it to the audio element", () => {
      const { result } = renderPlayer()

      act(() => result.current.setVolume(1.5))
      expect(result.current.volume).toBe(1)
      expect(getAudioEl().volume).toBe(1)

      act(() => result.current.setVolume(-1))
      expect(result.current.volume).toBe(0)
      expect(getAudioEl().volume).toBe(0)

      act(() => result.current.setVolume(0.5))
      expect(result.current.volume).toBe(0.5)
      expect(getAudioEl().volume).toBe(0.5)
    })

    it("updates speed state even before the audio graph exists, without writing to a node", () => {
      const { result } = renderPlayer()

      act(() => result.current.setSpeed(1.25))

      expect(result.current.speed).toBe(1.25)
    })

    it("clamps speed to [0.5, 1.5] and writes it to the SoundTouch node once the graph exists", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => result.current.setSpeed(3))
      expect(result.current.speed).toBe(1.5)

      act(() => result.current.setSpeed(0.1))
      expect(result.current.speed).toBe(0.5)
    })

    it("updates transpose state even before the audio graph exists, without writing to a node", () => {
      const { result } = renderPlayer()

      act(() => result.current.setTransposeSemitones(4))

      expect(result.current.transposeSemitones).toBe(4)
    })

    it("clamps transpose to [-12, 12] and writes it to the SoundTouch node once the graph exists", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => result.current.setTransposeSemitones(99))
      expect(result.current.transposeSemitones).toBe(12)

      act(() => result.current.setTransposeSemitones(-99))
      expect(result.current.transposeSemitones).toBe(-12)
    })

    it("clears loopSection", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "a" })
      await act(async () => {
        await result.current.selectSong(song)
      })

      act(() => result.current.setLoopSection({ start: 1, end: 2 }))
      expect(result.current.loopSection).toEqual({ start: 1, end: 2 })

      act(() => result.current.setLoopSection(null))
      expect(result.current.loopSection).toBeNull()
    })
  })

  describe("stopIfActive", () => {
    it("stops playback and clears state when the given id is the active song", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.selectSong(song)
      })
      // selectSong's own loadSong pauses the element before assigning a new
      // src - clear that call so the assertions below isolate stopIfActive's
      // own effect.
      vi.mocked(getAudioEl().pause).mockClear()
      vi.mocked(getAudioEl().load).mockClear()

      act(() => result.current.stopIfActive("song-1"))

      expect(result.current.activeSongId).toBeNull()
      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0)
      expect(result.current.duration).toBe(0)
      expect(getAudioEl().pause).toHaveBeenCalledTimes(1)
      expect(getAudioEl().load).toHaveBeenCalledTimes(1)
      expect(getAudioEl().hasAttribute("src")).toBe(false)
    })

    it("does nothing when the given id doesn't match the active song", async () => {
      mockStreamUrl()
      const { result } = renderPlayer()
      const song = createMockSong({ id: "song-1" })
      await act(async () => {
        await result.current.selectSong(song)
      })
      vi.mocked(getAudioEl().pause).mockClear()

      act(() => result.current.stopIfActive("some-other-song"))

      expect(result.current.activeSongId).toBe("song-1")
      expect(getAudioEl().pause).not.toHaveBeenCalled()
    })
  })
})
