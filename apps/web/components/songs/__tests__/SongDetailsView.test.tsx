import { describe, expect, it, vi } from "vitest"
import { SongDetailsView } from "@/components/SongDetailsView"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../test/fixtures"
import { renderWithProviders, screen, waitFor } from "../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock("@/components/SongPlayerProvider", () => ({ usePlayer: vi.fn() }))

function mockSongResponse(
  song: ReturnType<typeof createMockSong> | undefined,
  error?: unknown,
  albumUrlError?: unknown
) {
  vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
    if (path === "/api/songs/{id}") {
      if (error) return { data: undefined, error }
      return { data: song, error: undefined }
    }
    if (path === "/api/songs/{id}/album-url") {
      if (albumUrlError) return { data: undefined, error: albumUrlError }
      return { data: { url: "https://example.com/art.png" }, error: undefined }
    }
    return { data: undefined, error: undefined }
  })
}

describe("SongDetailsView", () => {
  it("renders a loading skeleton while the song query is pending", () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)

    const { container } = renderWithProviders(<SongDetailsView songId="song-1" />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("renders song details, badges, and waveform (no album art) on success", async () => {
    const selectSong = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ selectSong }))
    const song = createMockSong({
      title: "Amazing Grace",
      artist: "Traditional",
      musicalKey: "G",
      tempo: 72,
      hasAlbumArt: false,
    })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
    expect(screen.getByText("Key of G")).toBeInTheDocument()
    expect(screen.getByText("72 BPM")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Amazing Grace album art" })).not.toBeInTheDocument()

    await waitFor(() => expect(selectSong).toHaveBeenCalledTimes(1))
    expect(selectSong).toHaveBeenCalledWith(song)
  })

  it("does not render the musicalKey badge when absent", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ musicalKey: null, tempo: 72, hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText("72 BPM")
    expect(screen.queryByText(/Key of/)).not.toBeInTheDocument()
  })

  it("does not render the tempo badge when absent", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ musicalKey: "G", tempo: null, hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText("Key of G")
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument()
  })

  it("renders no badge row when both musicalKey and tempo are absent", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ title: "No Badges", musicalKey: null, tempo: null, hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText("No Badges")
    expect(screen.queryByText(/Key of/)).not.toBeInTheDocument()
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument()
  })

  it("renders album art via next/image when albumArt data resolves", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ title: "Amazing Grace", hasAlbumArt: true })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    const image = await screen.findByRole("img", { name: "Amazing Grace album art" })
    expect(image).toBeInTheDocument()
  })

  it("falls back to the waveform when the album-url query errors", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ title: "Amazing Grace", hasAlbumArt: true })
    mockSongResponse(song, undefined, { status: 500, message: "boom" })

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText("Amazing Grace")
    await waitFor(() =>
      expect(screen.queryByRole("img", { name: "Amazing Grace album art" })).not.toBeInTheDocument()
    )
  })

  it("falls back to 'Unknown artist' when artist is null", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    const song = createMockSong({ artist: null, hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    expect(await screen.findByText("Unknown artist")).toBeInTheDocument()
  })

  it("reflects isCurrentlyPlaying when activeSongId matches the song and isPlaying is true", async () => {
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true, isLoadingSongId: "song-1" })
    )
    const song = createMockSong({ id: "song-1", hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText(song.title)
    expect(document.querySelector(".z-10")).toBeInTheDocument()
  })

  it("shows the 'Song not found' empty state for a 404 error", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    mockSongResponse(undefined, { status: 404, message: "Not found" })

    renderWithProviders(<SongDetailsView songId="song-1" />)

    expect(await screen.findByText("Song not found")).toBeInTheDocument()
    expect(screen.getByText("The requested song could not be found.")).toBeInTheDocument()
  })

  it("shows the same 'Song not found' empty state for a non-404 error", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    mockSongResponse(undefined, { status: 500, message: "Server error" })

    renderWithProviders(<SongDetailsView songId="song-1" />)

    expect(await screen.findByText("Song not found")).toBeInTheDocument()
  })

  it("does not auto-select the song when activeSongId is already set", async () => {
    const selectSong = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "already-active", selectSong })
    )
    const song = createMockSong({ hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText(song.title)
    expect(selectSong).not.toHaveBeenCalled()
  })

  it("shows a loading spinner overlay when this song is the one currently loading", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ isLoadingSongId: "song-1" }))
    const song = createMockSong({ id: "song-1", hasAlbumArt: false })
    mockSongResponse(song)

    renderWithProviders(<SongDetailsView songId="song-1" />)

    await screen.findByText(song.title)
    expect(document.querySelector(".z-10")).toBeInTheDocument()
  })
})
