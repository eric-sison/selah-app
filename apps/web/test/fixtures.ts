import { vi } from "vitest"
import type { Song } from "@/components/NowPlayingCard"
import type { Session } from "@/lib/session"
import type { LoopSection } from "@/components/SongPlayerProvider"

// SongPlayerProvider's own PlayerContextValue interface isn't exported -
// this is a structural duplicate kept in sync by hand. Components under
// test only destructure `usePlayer()`'s return value, so this just needs to
// match that shape, not be the literal same type.
export interface MockPlayerContextValue {
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
  queue: Song[]
  isShuffling: boolean
  toggleShuffle: () => void
  playbackOrder: Song[]
  repeatCurrentSong: boolean
  toggleRepeatCurrentSong: () => void
  selectSong: (song: Song, queue?: Song[]) => void
  playOrToggle: (song: Song, queue?: Song[]) => void
  playNext: () => void
  playPrevious: () => void
  skip: (seconds: number) => void
  seek: (time: number) => void
}

export function createMockSong(overrides: Partial<Song> = {}): Song {
  return {
    id: "song-1",
    title: "Amazing Grace",
    artist: "Traditional",
    musicalKey: "G",
    tempo: 72,
    album: null,
    releaseDate: null,
    chordpro: "[G]Amazing [C]grace, how [G]sweet the sound",
    originalFileName: "amazing-grace.mp3",
    mimeType: "audio/mpeg",
    fileSizeBytes: 1024,
    hasAlbumArt: false,
    uploader: { id: "user-1", name: "Admin" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function createMockSession(overrides: Partial<Session["user"]> = {}): Session {
  return {
    user: {
      id: "user-1",
      name: "Admin",
      email: "admin@selah.local",
      role: "admin",
      ...overrides,
    },
    session: {
      id: "session-1",
    },
  }
}

export function createMockPlayerContextValue(
  overrides: Partial<MockPlayerContextValue> = {}
): MockPlayerContextValue {
  return {
    activeSongId: null,
    isPlaying: false,
    isLoadingSongId: null,
    currentTime: 0,
    duration: 0,
    analyserNode: null,
    volume: 1,
    setVolume: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
    transposeSemitones: 0,
    setTransposeSemitones: vi.fn(),
    loopSection: null,
    setLoopSection: vi.fn(),
    queue: [],
    isShuffling: false,
    toggleShuffle: vi.fn(),
    playbackOrder: [],
    repeatCurrentSong: false,
    toggleRepeatCurrentSong: vi.fn(),
    selectSong: vi.fn(),
    playOrToggle: vi.fn(),
    playNext: vi.fn(),
    playPrevious: vi.fn(),
    skip: vi.fn(),
    seek: vi.fn(),
    ...overrides,
  }
}
