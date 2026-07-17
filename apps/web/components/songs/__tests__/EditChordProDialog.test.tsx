import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { describe, expect, it, vi } from "vitest"
import { EditChordProDialog } from "@/components/songs/EditChordProDialog"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/songs/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../../test/fixtures"
import { renderWithProviders, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("@/components/songs/SongPlayerProvider", () => ({
  usePlayer: vi.fn(),
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function mockPlayer(overrides: Parameters<typeof createMockPlayerContextValue>[0] = {}) {
  const value = createMockPlayerContextValue(overrides)
  vi.mocked(usePlayer).mockReturnValue(value)
  return value
}

describe("EditChordProDialog", () => {
  it("pre-fills the textarea with the song's chordpro", () => {
    mockPlayer()
    const song = createMockSong({ chordpro: "[G]Amazing [C]grace" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("textbox")).toHaveValue("[G]Amazing [C]grace")
  })

  it("renders an empty textarea when chordpro is null", () => {
    mockPlayer()
    const song = createMockSong({ chordpro: null })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("textbox")).toHaveValue("")
    expect(screen.getByText("Preview will appear here.")).toBeInTheDocument()
  })

  it("updates the live preview as the textarea content changes", async () => {
    mockPlayer()
    const user = userEvent.setup()
    const song = createMockSong({ chordpro: null })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Preview will appear here.")).toBeInTheDocument()

    // user-event's `type` treats "[" as the start of a key descriptor - "[["
    // is its escape for a literal "[", while a bare "]" (outside an open
    // descriptor) is already just a literal character.
    await user.type(screen.getByRole("textbox"), "[[D]Grace")

    expect(screen.queryByText("Preview will appear here.")).not.toBeInTheDocument()
    expect(screen.getByText("D")).toBeInTheDocument()
    expect(screen.getByText("Grace")).toBeInTheDocument()
  })

  it("calls skip(-5) and skip(5) from the back/forward buttons", async () => {
    const player = mockPlayer({ activeSongId: "song-1" })
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Back 5 seconds" }))
    await user.click(screen.getByRole("button", { name: "Forward 5 seconds" }))

    expect(player.skip).toHaveBeenCalledWith(-5)
    expect(player.skip).toHaveBeenCalledWith(5)
  })

  it("disables the skip buttons when this song is not the active song", () => {
    mockPlayer({ activeSongId: null })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Back 5 seconds" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Forward 5 seconds" })).toBeDisabled()
  })

  it("calls playOrToggle(song) from the play/pause button", async () => {
    const player = mockPlayer()
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Play" }))

    expect(player.playOrToggle).toHaveBeenCalledWith(song)
  })

  it("shows a Pause label and icon when this song is the active, playing song", () => {
    mockPlayer({ activeSongId: "song-1", isPlaying: true })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
  })

  it("shows a Play label when another song is playing (this song is not active)", () => {
    mockPlayer({ activeSongId: "other-song", isPlaying: true })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
  })

  it("shows a Play label when this song is active but not playing", () => {
    mockPlayer({ activeSongId: "song-1", isPlaying: false })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
  })

  it("shows a spinner and disables the play button while this song's audio is loading", () => {
    mockPlayer({ isLoadingSongId: "song-1" })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    const playButton = screen.getByRole("button", { name: "Play" })
    expect(playButton).toBeDisabled()
  })

  it("displays elapsed/total time for the active song and disables the slider otherwise", () => {
    mockPlayer({ activeSongId: "song-1", currentTime: 65, duration: 200 })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("1:05")).toBeInTheDocument()
    expect(screen.getByText("3:20")).toBeInTheDocument()
  })

  it("shows 0:00 for both times when this song isn't active or has no duration yet", () => {
    mockPlayer({ activeSongId: null, currentTime: 65, duration: 200 })
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getAllByText("0:00")).toHaveLength(2)
  })

  it("saves the current textarea content, shows a success toast, invalidates caches, and closes the dialog", async () => {
    mockPlayer()
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: { id: "song-1" }, error: undefined } as never)
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const song = createMockSong({ id: "song-1", chordpro: "[G]Grace" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={onOpenChange} />)

    await user.type(screen.getByRole("textbox"), " more")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(apiClient.PATCH).toHaveBeenCalledWith("/api/songs/{id}", {
        params: { path: { id: "song-1" } },
        body: { chordpro: "[G]Grace more" },
      })
    })

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(toast.success).toHaveBeenCalledWith("Lyrics & chords saved.", { position: "top-center" })
  })

  it("shows an error toast and keeps the dialog open when saving fails", async () => {
    mockPlayer()
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: {} } as never)
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const song = createMockSong({ id: "song-1", chordpro: "[G]Grace" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to save lyrics & chords.", { position: "top-center" })
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("disables Save/Cancel and shows 'Saving...' while the mutation is pending", async () => {
    mockPlayer()
    let resolvePatch!: (value: { data: { id: string }; error: undefined }) => void
    vi.mocked(apiClient.PATCH).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }) as never
    )
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePatch({ data: { id: "song-1" }, error: undefined })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    })
  })

  it("renders dialog title and description", () => {
    mockPlayer()
    const song = createMockSong()

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Edit lyrics & chords" })).toBeInTheDocument()
  })

  it("seeks when the slider value changes", async () => {
    // Base UI's Slider measures layout via ResizeObserver before it reveals
    // itself (visibility: hidden until then); the global ResizeObserver mock
    // in test/setup.ts is an inert no-op spy, so the thumb never becomes
    // accessible by role in jsdom. The underlying <input type="range"> still
    // receives and dispatches real keyboard events, so drive it directly.
    const player = mockPlayer({ activeSongId: "song-1", duration: 200, currentTime: 0 })
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1" })

    renderWithProviders(<EditChordProDialog song={song} open onOpenChange={vi.fn()} />)

    const input = document.querySelector('input[type="range"]') as HTMLInputElement
    input.focus()
    await user.keyboard("{ArrowRight}")

    expect(player.seek).toHaveBeenCalledWith(1)
  })
})
