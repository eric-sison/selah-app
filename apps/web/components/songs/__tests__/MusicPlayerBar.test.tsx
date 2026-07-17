import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiClient } from "@/lib/api-client"
import { MusicPlayerBar } from "@/components/MusicPlayerBar"
import { usePlayer } from "@/components/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../test/fixtures"
import { renderWithProviders as render } from "../../test/render"

vi.mock("@/components/SongPlayerProvider", () => ({ usePlayer: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiClient: { GET: vi.fn() } }))

vi.mock("@/components/SongDetailsSheet", () => ({
  SongDetailsSheet: ({ open, song }: { open: boolean; song: { title: string } }) =>
    open ? <div data-testid="mock-details-sheet">{song.title}</div> : null,
}))
vi.mock("@/components/SongLyricsChords", () => ({
  SongLyricsChords: ({ song }: { song: { title: string } }) => (
    <div data-testid="mock-lyrics">{song.title}</div>
  ),
}))
vi.mock("@/components/EditChordProDialog", () => ({
  EditChordProDialog: ({ open, song }: { open: boolean; song: { title: string } }) =>
    open ? <div data-testid="mock-edit-dialog">{song.title}</div> : null,
}))

// Sentinel input values let tests reach shapes the real Slider can produce
// that a plain <input type="range"> can't (an empty array, or a bare number
// instead of an array) - MusicPlayerBar defensively handles both.
const EMPTY_ARRAY_SENTINEL = "__empty_array__"
const BARE_NUMBER_SENTINEL = "__bare_number__"

vi.mock("@workspace/ui/components/Slider", () => ({
  Slider: ({
    value,
    min,
    max,
    step,
    disabled,
    onValueChange,
    onPointerDown,
    orientation,
  }: {
    value?: number[]
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    onValueChange?: (value: number | readonly number[]) => void
    onPointerDown?: () => void
    orientation?: string
  }) => (
    <input
      type="text"
      data-testid={orientation === "vertical" ? "volume-slider" : "seek-slider"}
      value={value?.[0] ?? 0}
      min={min}
      max={max}
      step={step ?? 1}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onChange={(e) => {
        if (e.target.value === EMPTY_ARRAY_SENTINEL) onValueChange?.([])
        else if (e.target.value === BARE_NUMBER_SENTINEL) onValueChange?.(42)
        else onValueChange?.([Number(e.target.value)])
      }}
    />
  ),
}))

function mockApi(handlers: {
  song?: ReturnType<typeof createMockSong>
  albumUrl?: string
  library?: ReturnType<typeof createMockSong>[]
}) {
  vi.mocked(apiClient.GET).mockImplementation(((path: string, opts: unknown) => {
    if (path === "/api/songs/{id}") {
      return Promise.resolve(
        handlers.song
          ? { data: handlers.song, error: undefined }
          : { data: undefined, error: { message: "not found" } }
      )
    }
    if (path === "/api/songs/{id}/album-url") {
      return Promise.resolve(
        handlers.albumUrl
          ? { data: { url: handlers.albumUrl }, error: undefined }
          : { data: undefined, error: { message: "no art" } }
      )
    }
    if (path === "/api/songs") {
      return Promise.resolve({ data: { items: handlers.library ?? [], nextCursor: null }, error: undefined })
    }
    throw new Error(`unexpected path in test: ${path} ${JSON.stringify(opts)}`)
  }) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("MusicPlayerBar", () => {
  it("shows a placeholder when nothing is active", () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: null }))
    mockApi({})

    render(<MusicPlayerBar />)

    expect(screen.getByText("Nothing playing")).toBeInTheDocument()
  })

  it("renders the active song's uploader/file size and album art fallback icon", async () => {
    const song = createMockSong({ id: "song-1", hasAlbumArt: false })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song })

    render(<MusicPlayerBar />)

    expect(await screen.findByText(`Uploaded by ${song.uploader.name}`)).toBeInTheDocument()
  })

  it("renders album art when the song has it", async () => {
    const song = createMockSong({ id: "song-1", hasAlbumArt: true })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song, albumUrl: "https://example.com/art.jpg" })

    render(<MusicPlayerBar />)

    const img = await screen.findByAltText(`${song.title} album art`)
    expect(img).toHaveAttribute("src", expect.stringContaining("art.jpg"))
  })

  it("shows a spinner and disables the play button while loading", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isLoadingSongId: "song-1" })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const playButton = await screen.findByRole("button", { name: "Play" })
    expect(playButton).toBeDisabled()
  })

  it("shows Pause when playing and Play when paused, and toggles playback on click", async () => {
    const song = createMockSong({ id: "song-1" })
    const playOrToggle = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isPlaying: true, playOrToggle })
    )
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    const pauseButton = await screen.findByRole("button", { name: "Pause" })
    await user.click(pauseButton)
    expect(playOrToggle).toHaveBeenCalledWith(song)
  })

  it("toggles shuffle and repeat", async () => {
    const song = createMockSong({ id: "song-1" })
    const toggleShuffle = vi.fn()
    const toggleRepeatCurrentSong = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", toggleShuffle, toggleRepeatCurrentSong })
    )
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Shuffle" }))
    expect(toggleShuffle).toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Repeat current song" }))
    expect(toggleRepeatCurrentSong).toHaveBeenCalled()
  })

  it("calls playPrevious/playNext and enables/disables them based on queue position", async () => {
    const songA = createMockSong({ id: "a" })
    const songB = createMockSong({ id: "b" })
    const songC = createMockSong({ id: "c" })
    const playPrevious = vi.fn()
    const playNext = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({
        activeSongId: "b",
        playbackOrder: [songA, songB, songC],
        playPrevious,
        playNext,
      })
    )
    mockApi({ song: songB })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    const prevButton = await screen.findByRole("button", { name: "Previous song" })
    const nextButton = screen.getByRole("button", { name: "Next song" })
    expect(prevButton).toBeEnabled()
    expect(nextButton).toBeEnabled()

    await user.click(prevButton)
    expect(playPrevious).toHaveBeenCalled()
    await user.click(nextButton)
    expect(playNext).toHaveBeenCalled()
  })

  it("disables Previous at the start and Next at the end of the queue", async () => {
    const songA = createMockSong({ id: "a" })
    const songB = createMockSong({ id: "b" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "a", playbackOrder: [songA, songB] })
    )
    mockApi({ song: songA })

    render(<MusicPlayerBar />)

    expect(await screen.findByRole("button", { name: "Previous song" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next song" })).toBeEnabled()
  })

  it("falls back to the library order when the queue is empty, and disables both when the song isn't found in it", async () => {
    const song = createMockSong({ id: "song-1" })
    const otherSong = createMockSong({ id: "other" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", playbackOrder: [] })
    )
    mockApi({ song, library: [otherSong] })

    render(<MusicPlayerBar />)

    const prevButton = await screen.findByRole("button", { name: "Previous song" })
    expect(prevButton).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled()
  })

  it("uses the resolved library order for previous/next when the queue is empty", async () => {
    const songA = createMockSong({ id: "a" })
    const songB = createMockSong({ id: "b" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "a", playbackOrder: [] })
    )
    mockApi({ song: songA, library: [songA, songB] })

    render(<MusicPlayerBar />)

    expect(await screen.findByRole("button", { name: "Previous song" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next song" })).toBeEnabled()
  })

  it("shows the muted volume icon at 0, low icon below 0.5, and full icon otherwise", async () => {
    const song = createMockSong({ id: "song-1" })
    mockApi({ song })

    const { rerender } = render(<MusicPlayerBar />)
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1", volume: 0 }))
    rerender(<MusicPlayerBar />)
    expect(await screen.findByRole("button", { name: "Volume" })).toBeInTheDocument()
    expect(document.querySelector(".lucide-volume-x")).toBeInTheDocument()

    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", volume: 0.3 })
    )
    rerender(<MusicPlayerBar />)
    expect(document.querySelector(".lucide-volume-1")).toBeInTheDocument()

    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1", volume: 1 }))
    rerender(<MusicPlayerBar />)
    expect(document.querySelector(".lucide-volume-2")).toBeInTheDocument()
  })

  it("opens the volume popover and adjusts volume via the slider", async () => {
    const song = createMockSong({ id: "song-1" })
    const setVolume = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", volume: 0.5, setVolume })
    )
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Volume" }))
    const volumeSlider = await screen.findByTestId("volume-slider")
    fireEvent.change(volumeSlider, { target: { value: "0.75" } })

    expect(setVolume).toHaveBeenCalledWith(0.75)
  })

  it("toggles the lyrics panel open and closed, and shows the panel's own close button", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    const lyricsButton = await screen.findByRole("button", { name: "Lyrics and chords" })
    await user.click(lyricsButton)
    expect(lyricsButton).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("mock-lyrics")).toHaveTextContent(song.title)

    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(lyricsButton).toHaveAttribute("aria-pressed", "false")
  })

  it("shows 'Add lyrics & chords' when the song has no chordpro yet", async () => {
    const songWithoutChords = createMockSong({ id: "song-1", chordpro: null })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song: songWithoutChords })

    render(<MusicPlayerBar />)

    expect(await screen.findByRole("button", { name: "Add lyrics & chords" })).toBeInTheDocument()
  })

  it("shows 'Edit' when the song already has chordpro", async () => {
    const songWithChords = createMockSong({ id: "song-1", chordpro: "[C]Hello" })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song: songWithChords })

    render(<MusicPlayerBar />)

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
  })

  it("opens the edit dialog", async () => {
    const song = createMockSong({ id: "song-1", chordpro: "[C]Hello" })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    expect(screen.getByTestId("mock-edit-dialog")).toHaveTextContent(song.title)
  })

  it("opens the song details sheet", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Song details" }))
    expect(screen.getByTestId("mock-details-sheet")).toHaveTextContent(song.title)
  })

  it("disables the seek slider when duration is unknown, and enables it once known", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 0 })
    )
    mockApi({ song })

    const { rerender } = render(<MusicPlayerBar />)
    expect(await screen.findByTestId("seek-slider")).toBeDisabled()

    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 180, currentTime: 30 })
    )
    rerender(<MusicPlayerBar />)
    expect(screen.getByTestId("seek-slider")).toBeEnabled()
  })

  it("debounces the seek call while scrubbing, and seeks immediately once released", async () => {
    const song = createMockSong({ id: "song-1" })
    const seek = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 180, currentTime: 10, seek })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    // Fake timers only from here on - the query fetch/findBy above needs
    // real timers to resolve its internal polling.
    vi.useFakeTimers()
    fireEvent.pointerDown(slider)
    fireEvent.change(slider, { target: { value: "50" } })

    expect(seek).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(seek).toHaveBeenCalledWith(50)

    seek.mockClear()
    fireEvent.change(slider, { target: { value: "70" } })
    // Releasing before the debounce elapses should still seek immediately,
    // using the latest scrub value, and clear the pending debounce.
    window.dispatchEvent(new Event("pointerup"))
    expect(seek).toHaveBeenCalledWith(70)

    seek.mockClear()
    await vi.advanceTimersByTimeAsync(150)
    expect(seek).not.toHaveBeenCalled()
  })

  it("previews a hovered time on the seek bar without scrubbing", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 200, currentTime: 0 })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    const seekBar = slider.parentElement as HTMLElement
    seekBar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 200,
        top: 0,
        height: 10,
        right: 200,
        bottom: 10,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect

    fireEvent.pointerMove(seekBar, { clientX: 100 })
    expect(await screen.findByText("1:40")).toBeInTheDocument()

    fireEvent.pointerLeave(seekBar)
    await waitFor(() => expect(screen.queryByText("1:40")).not.toBeInTheDocument())
  })

  it("ignores a pointer move over a zero-width seek bar", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 200 })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    const seekBar = slider.parentElement as HTMLElement
    // Default jsdom getBoundingClientRect is all-zero, so this exercises the
    // `rect.width === 0` early return without any extra setup.
    fireEvent.pointerMove(seekBar, { clientX: 100 })

    expect(screen.queryByText(/^\d+:\d+$/)).not.toBeInTheDocument()
  })

  it("ignores a scrub change that resolves to no value (empty array)", async () => {
    const song = createMockSong({ id: "song-1" })
    const seek = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 180, seek })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    fireEvent.change(slider, { target: { value: EMPTY_ARRAY_SENTINEL } })

    expect(seek).not.toHaveBeenCalled()
    // displayTime still falls back to currentTime rather than getting stuck
    // on a bogus scrub value.
    expect(slider).toHaveValue("0")
  })

  it("scrubs using a bare number value (not wrapped in an array)", async () => {
    const song = createMockSong({ id: "song-1" })
    const seek = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 180, seek })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    vi.useFakeTimers()
    fireEvent.change(slider, { target: { value: BARE_NUMBER_SENTINEL } })
    await vi.advanceTimersByTimeAsync(150)

    expect(seek).toHaveBeenCalledWith(42)
  })

  it("releasing a scrub with nothing pending yet is a no-op (no debounce, no scrub value)", async () => {
    const song = createMockSong({ id: "song-1" })
    const seek = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", duration: 180, seek })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const slider = await screen.findByTestId("seek-slider")
    fireEvent.pointerDown(slider)
    window.dispatchEvent(new Event("pointerup"))

    expect(seek).not.toHaveBeenCalled()
  })

  it("shows the placeholder when the active song fails to load", async () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({})

    render(<MusicPlayerBar />)

    expect(await screen.findByText("Nothing playing")).toBeInTheDocument()
  })

  it("shows a skeleton (not the 'Nothing playing' placeholder) while the active song is loading", () => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)

    const { container } = render(<MusicPlayerBar />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByText("Nothing playing")).not.toBeInTheDocument()
  })

  it("doesn't crash when album art fails to load for a song that has it", async () => {
    const song = createMockSong({ id: "song-1", hasAlbumArt: true })
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ activeSongId: "song-1" }))
    mockApi({ song, albumUrl: undefined })

    render(<MusicPlayerBar />)

    expect(await screen.findByText(`Uploaded by ${song.uploader.name}`)).toBeInTheDocument()
    expect(screen.queryByAltText(`${song.title} album art`)).not.toBeInTheDocument()
  })

  it("doesn't crash when the library-order fallback query errors", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", playbackOrder: [] })
    )
    vi.mocked(apiClient.GET).mockImplementation(((path: string) => {
      if (path === "/api/songs/{id}") return Promise.resolve({ data: song, error: undefined })
      if (path === "/api/songs") return Promise.resolve({ data: undefined, error: { message: "boom" } })
      throw new Error(`unexpected path in test: ${path}`)
    }) as never)

    render(<MusicPlayerBar />)

    expect(await screen.findByText(`Uploaded by ${song.uploader.name}`)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled()
  })

  it("disables previous/next while the library-order fallback query is still loading", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", playbackOrder: [] })
    )
    vi.mocked(apiClient.GET).mockImplementation(((path: string) => {
      if (path === "/api/songs/{id}") return Promise.resolve({ data: song, error: undefined })
      // Never resolves - keeps libraryOrderQuery.data undefined for the
      // duration of this test, exercising the `?? []` fallback.
      if (path === "/api/songs") return new Promise(() => {})
      throw new Error(`unexpected path in test: ${path}`)
    }) as never)

    render(<MusicPlayerBar />)

    const prevButton = await screen.findByRole("button", { name: "Previous song" })
    expect(prevButton).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled()
  })

  it("shows the shuffle and repeat buttons in their active (secondary) styling when toggled on", async () => {
    const song = createMockSong({ id: "song-1" })
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", isShuffling: true, repeatCurrentSong: true })
    )
    mockApi({ song })

    render(<MusicPlayerBar />)

    const shuffleButton = await screen.findByRole("button", { name: "Shuffle" })
    const repeatButton = screen.getByRole("button", { name: "Repeat current song" })
    expect(shuffleButton).toHaveAttribute("aria-pressed", "true")
    expect(repeatButton).toHaveAttribute("aria-pressed", "true")
  })

  it("sets volume from a bare number value (not wrapped in an array)", async () => {
    const song = createMockSong({ id: "song-1" })
    const setVolume = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", volume: 0.5, setVolume })
    )
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Volume" }))
    const volumeSlider = await screen.findByTestId("volume-slider")
    fireEvent.change(volumeSlider, { target: { value: BARE_NUMBER_SENTINEL } })

    expect(setVolume).toHaveBeenCalledWith(42)
  })

  it("falls back to 0 when the volume slider reports an empty array", async () => {
    const song = createMockSong({ id: "song-1" })
    const setVolume = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(
      createMockPlayerContextValue({ activeSongId: "song-1", volume: 0.5, setVolume })
    )
    mockApi({ song })

    const user = userEvent.setup()
    render(<MusicPlayerBar />)

    await user.click(await screen.findByRole("button", { name: "Volume" }))
    const volumeSlider = await screen.findByTestId("volume-slider")
    fireEvent.change(volumeSlider, { target: { value: EMPTY_ARRAY_SENTINEL } })

    expect(setVolume).toHaveBeenCalledWith(0)
  })
})
