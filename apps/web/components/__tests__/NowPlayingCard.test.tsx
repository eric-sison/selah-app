import { describe, expect, it, vi } from "vitest"
import { NowPlayingCard } from "@/components/NowPlayingCard"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../test/fixtures"
import { renderWithProviders as render, screen, waitFor } from "../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock("@/components/SongPlayerProvider", () => ({ usePlayer: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("NowPlayingCard", () => {
  it("shows loading skeletons while the active song query is pending", () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockReturnValue(deferred().promise as never)

    const { container } = render(<NowPlayingCard />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows loading skeletons while the recent song query is pending", () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))
    vi.mocked(apiClient.GET).mockReturnValue(deferred().promise as never)

    const { container } = render(<NowPlayingCard />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows 'No songs yet' when there is no active song and the recent-song query resolves empty", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    expect(await screen.findByText("No songs yet")).toBeInTheDocument()
  })

  it("renders the active song's title and artist when activeSongId is set", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", artist: "Traditional" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true })
    )
    vi.mocked(apiClient.GET).mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
        if (path === "/api/songs/{id}" && options?.params?.path?.id === "song-1") {
          return Promise.resolve({ data: song, error: undefined }) as never
        }
        throw new Error(`Unexpected path: ${path}`)
      }
    )

    render(<NowPlayingCard />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
  })

  it("falls back to the most recently uploaded song when activeSongId is null", async () => {
    const song = createMockSong({ id: "song-2", title: "How Great Thou Art", artist: "Traditional Hymn" })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [song], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    expect(await screen.findByText("How Great Thou Art")).toBeInTheDocument()
    expect(screen.getByText("Traditional Hymn")).toBeInTheDocument()
  })

  it("renders 'Unknown artist' when the song has no artist", async () => {
    const song = createMockSong({ id: "song-1", title: "Instrumental", artist: null })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: song, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    expect(await screen.findByText("Instrumental")).toBeInTheDocument()
    expect(screen.getByText("Unknown artist")).toBeInTheDocument()
  })

  it("renders album art when present, and omits the LiveWaveform", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: song, error: undefined }) as never
      }
      if (path === "/api/songs/{id}/album-url") {
        return Promise.resolve({ data: { url: "https://example.com/art.jpg" }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    const image = await screen.findByAltText("Amazing Grace album art")
    expect(image).toBeInTheDocument()
    expect(screen.queryByText("Amazing Grace")).toBeInTheDocument()
  })

  it("renders the LiveWaveform with active=true when the active song is currently playing", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: false })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true })
    )
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: song, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    const { container } = render(<NowPlayingCard />)

    await screen.findByText("Amazing Grace")
    await waitFor(() => expect(container.querySelector("canvas")).toBeInTheDocument())
  })

  it("renders the LiveWaveform with active=false when isPlaying is false", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: false })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false })
    )
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: song, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    const { container } = render(<NowPlayingCard />)

    await screen.findByText("Amazing Grace")
    await waitFor(() => expect(container.querySelector("canvas")).toBeInTheDocument())
  })

  it("shows 'No songs yet' when the active song query errors", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    expect(await screen.findByText("No songs yet")).toBeInTheDocument()
  })

  it("shows 'No songs yet' when the recent-song query errors", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<NowPlayingCard />)

    expect(await screen.findByText("No songs yet")).toBeInTheDocument()
  })

  it("falls back to the Music icon when the album art query errors", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: song, error: undefined }) as never
      }
      if (path === "/api/songs/{id}/album-url") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    const { container } = render(<NowPlayingCard />)

    await screen.findByText("Amazing Grace")
    await waitFor(() => expect(container.querySelector("canvas")).toBeInTheDocument())
    expect(screen.queryByAltText("Amazing Grace album art")).not.toBeInTheDocument()
  })
})
