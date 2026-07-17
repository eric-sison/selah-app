import userEvent from "@testing-library/user-event"
import { usePathname } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import { MiniMusicPlayer } from "@/components/songs/MiniMusicPlayer"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/songs/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../../test/fixtures"
import { renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }))
vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock("@/components/songs/SongPlayerProvider", () => ({ usePlayer: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mockGetForSong(song: ReturnType<typeof createMockSong>, albumArtUrl?: string | null) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/songs/{id}") return Promise.resolve({ data: song, error: undefined }) as never
    if (path === "/api/songs/{id}/album-url") {
      return albumArtUrl === null
        ? (Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never)
        : (Promise.resolve({
            data: { url: albumArtUrl ?? "https://example.com/art.jpg" },
            error: undefined,
          }) as never)
    }
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("MiniMusicPlayer", () => {
  it("renders nothing when no song is active", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))

    const { container } = render(<MiniMusicPlayer />)

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing on the songs pages, which already show the full player bar", () => {
    vi.mocked(usePathname).mockReturnValue("/songs/song-1")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockReturnValue(deferred().promise as never)

    const { container } = render(<MiniMusicPlayer />)

    expect(container).toBeEmptyDOMElement()
  })

  it("shows loading skeletons while the active song query is pending", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockReturnValue(deferred().promise as never)

    const { container } = render(<MiniMusicPlayer />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("renders nothing when the active song query errors", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    const { container } = render(<MiniMusicPlayer />)

    await waitFor(() => expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0))
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the active song's title, artist, a Music icon fallback, and links to its detail page", async () => {
    const song = createMockSong({
      id: "song-1",
      title: "Amazing Grace",
      artist: "Traditional",
      hasAlbumArt: false,
    })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAttribute("href", "/songs/song-1")
  })

  it("renders 'Unknown artist' when the song has no artist", async () => {
    const song = createMockSong({ id: "song-1", title: "Instrumental", artist: null })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)

    expect(await screen.findByText("Unknown artist")).toBeInTheDocument()
  })

  it("renders album art when the song has it", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)

    expect(await screen.findByAltText("Amazing Grace album art")).toBeInTheDocument()
  })

  it("falls back to the Music icon when the album art query errors", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song, null)

    render(<MiniMusicPlayer />)

    await screen.findByText("Amazing Grace")
    expect(screen.queryByAltText("Amazing Grace album art")).not.toBeInTheDocument()
  })

  it("calls playPrevious when the previous button is clicked", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    const playPrevious = vi.fn()
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", playPrevious })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Previous song" }))

    expect(playPrevious).toHaveBeenCalled()
  })

  it("calls playNext when the next button is clicked", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    const playNext = vi.fn()
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1", playNext }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Next song" }))

    expect(playNext).toHaveBeenCalled()
  })

  it("calls playOrToggle with the loaded song when the play button is clicked", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    const playOrToggle = vi.fn()
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false, playOrToggle })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Play" }))

    expect(playOrToggle).toHaveBeenCalledWith(song)
  })

  it("shows a Pause button when the song is currently playing", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)

    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument()
  })

  it("shows a spinner and disables the play button while the song is loading", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isLoadingSongId: "song-1" })
    )
    mockGetForSong(song)

    const { container } = render(<MiniMusicPlayer />)

    await screen.findByText("Amazing Grace")
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled()
    expect(container.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
  })

  it("renders a proportional progress ring reflecting currentTime over duration", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", currentTime: 30, duration: 120 })
    )
    mockGetForSong(song)

    const { container } = render(<MiniMusicPlayer />)

    await screen.findByText("Amazing Grace")
    const ring = container.querySelector('[style*="conic-gradient"]')
    expect(ring?.getAttribute("style")).toContain("90deg")
  })

  it("renders a zero-degree progress ring when duration is 0", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", currentTime: 0, duration: 0 })
    )
    mockGetForSong(song)

    const { container } = render(<MiniMusicPlayer />)

    await screen.findByText("Amazing Grace")
    const ring = container.querySelector('[style*="conic-gradient"]')
    expect(ring?.getAttribute("style")).toContain("0deg")
  })

  it("toggles between the full player and the minimized bubble", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")

    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))

    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()
    expect(screen.queryByText("Amazing Grace")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Expand mini player" }))

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Expand mini player" })).not.toBeInTheDocument()
  })

  it("renders album art in the minimized bubble when the song has it", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))

    expect(await screen.findByAltText("Amazing Grace album art")).toBeInTheDocument()
  })

  it("stays expanded on initial mount even when the song is paused", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Expand mini player" })).not.toBeInTheDocument()
  })

  it("minimizes on a route change while the song is paused", async () => {
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false })
    )
    mockGetForSong(song)
    vi.mocked(usePathname).mockReturnValue("/dashboard")

    const { rerender } = render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")

    vi.mocked(usePathname).mockReturnValue("/schedules")
    rerender(<MiniMusicPlayer />)

    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()
    expect(screen.queryByText("Amazing Grace")).not.toBeInTheDocument()
  })

  it("stays minimized on a route change while the song is playing, once explicitly minimized", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true })
    )
    mockGetForSong(song)
    vi.mocked(usePathname).mockReturnValue("/dashboard")

    const { rerender } = render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))
    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()

    vi.mocked(usePathname).mockReturnValue("/schedules")
    rerender(<MiniMusicPlayer />)

    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()
    expect(screen.queryByText("Amazing Grace")).not.toBeInTheDocument()
  })

  it("stays expanded on a route change while the song is paused, once explicitly expanded", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false })
    )
    mockGetForSong(song)
    vi.mocked(usePathname).mockReturnValue("/dashboard")

    const { rerender } = render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))
    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Expand mini player" }))
    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()

    vi.mocked(usePathname).mockReturnValue("/schedules")
    rerender(<MiniMusicPlayer />)

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Expand mini player" })).not.toBeInTheDocument()
  })

  it("calls stopIfActive with the song id when the minimized bubble's close button is clicked", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    const stopIfActive = vi.fn()
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", stopIfActive })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))
    await screen.findByRole("button", { name: "Expand mini player" })
    await user.click(screen.getByRole("button", { name: "Close mini player" }))

    expect(stopIfActive).toHaveBeenCalledWith("song-1")
  })

  it("calls stopIfActive with the song id when the close button is clicked", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    const stopIfActive = vi.fn()
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", stopIfActive })
    )
    mockGetForSong(song)

    render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Close mini player" }))

    expect(stopIfActive).toHaveBeenCalledWith("song-1")
  })

  it("does not change the minimized state when isPlaying changes without a route change", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace" })
    vi.mocked(usePathname).mockReturnValue("/dashboard")
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: false })
    )
    mockGetForSong(song)

    const { rerender } = render(<MiniMusicPlayer />)
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: "Minimize mini player" }))
    expect(await screen.findByRole("button", { name: "Expand mini player" })).toBeInTheDocument()

    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true })
    )
    rerender(<MiniMusicPlayer />)

    expect(screen.getByRole("button", { name: "Expand mini player" })).toBeInTheDocument()
    expect(screen.queryByText("Amazing Grace")).not.toBeInTheDocument()
  })
})
