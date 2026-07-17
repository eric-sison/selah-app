import { vi } from "vitest"
import type { Musician } from "@/components/musicians/MusicianList"
import type { Song } from "@/components/songs/NowPlayingCard"
import type { Session } from "@/lib/session"
import type { LoopSection } from "@/components/songs/SongPlayerProvider"
import type { Team } from "@/components/teams/TeamList"
import type { operations } from "@/types/api"

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
  stopIfActive: (songId: string) => void
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

export function createMockTeamMember(
  overrides: Partial<Team["members"][number]> = {}
): Team["members"][number] {
  return {
    id: "member-1",
    user: { id: "user-2", name: "Ben Ortega", image: null },
    musicianId: "musician-1",
    instruments: [],
    ...overrides,
  }
}

export function createMockTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    name: "Sunday AM Team",
    leader: null,
    members: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

type MusicianUser = operations["listUsers"]["responses"][200]["content"]["application/json"][number]

export function createMockUser(overrides: Partial<MusicianUser> = {}): MusicianUser {
  return {
    id: "user-3",
    name: "Cara Diaz",
    email: "cara@example.com",
    image: null,
    ...overrides,
  }
}

export function createMockMusician(overrides: Partial<Musician> = {}): Musician {
  return {
    id: "musician-1",
    user: { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null },
    instruments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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
    stopIfActive: vi.fn(),
    ...overrides,
  }
}
