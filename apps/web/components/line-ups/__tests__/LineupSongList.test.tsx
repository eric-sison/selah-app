import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupSongList } from "@/components/line-ups/LineupSongList"
import type { Lineup } from "@/components/line-ups/LineupList"
import { apiClient } from "@/lib/api-client"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { toast } = await import("@workspace/ui/components/Sonner")

afterEach(() => {
  vi.clearAllMocks()
})

function createMockSongEntry(overrides: Partial<Lineup["songs"][number]> = {}): Lineup["songs"][number] {
  return {
    id: "ls-1",
    position: 0,
    song: {
      id: "song-1",
      title: "Amazing Grace",
      artist: null,
      musicalKey: "G",
      tempo: 72,
      hasAlbumArt: false,
    },
    singer: null,
    ...overrides,
  }
}

function createMockMember(overrides: Partial<Lineup["members"][number]> = {}): Lineup["members"][number] {
  return {
    id: "lm-1",
    instruments: [],
    isAvailable: true,
    user: { id: "user-1", name: "Ben Ortega", image: null },
    ...overrides,
  }
}

function mockApi({
  searchResults = [],
  albumUrl,
}: {
  searchResults?: { id: string; title: string; artist: string | null; hasAlbumArt: boolean }[]
  albumUrl?: string
} = {}) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/songs")
      return Promise.resolve({ data: { items: searchResults }, error: undefined }) as never
    if (path === "/api/songs/{id}/album-url") {
      return Promise.resolve({ data: { url: albumUrl }, error: undefined }) as never
    }
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("LineupSongList", () => {
  it("shows an empty state when there are no songs", () => {
    mockApi()
    render(<LineupSongList lineupId="lineup-1" songs={[]} members={[]} />)

    expect(screen.getByText("No songs yet")).toBeInTheDocument()
    expect(screen.getByText("Search above to build the song list.")).toBeInTheDocument()
  })

  it("renders a song's title, artist fallback, key/tempo meta, and album art fallback icon", () => {
    mockApi()
    const entry = createMockSongEntry({ song: { ...createMockSongEntry().song, artist: null } })
    render(<LineupSongList lineupId="lineup-1" songs={[entry]} members={[]} />)

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Unknown artist")).toBeInTheDocument()
    expect(screen.getByText("Key of G · 72 BPM")).toBeInTheDocument()
  })

  it("omits the meta line when a song has no key or tempo", () => {
    mockApi()
    const entry = createMockSongEntry({
      song: { ...createMockSongEntry().song, musicalKey: null, tempo: null },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[entry]} members={[]} />)

    expect(screen.queryByText("Key of G · 72 BPM")).not.toBeInTheDocument()
  })

  it("falls back to the Music icon when the album art fails to load", async () => {
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs/{id}/album-url") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    const entry = createMockSongEntry({
      song: { ...createMockSongEntry().song, hasAlbumArt: true },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[entry]} members={[]} />)

    await waitFor(() => {
      expect(screen.queryByAltText("Amazing Grace album art")).not.toBeInTheDocument()
    })
  })

  it("renders album art once its presigned url resolves", async () => {
    mockApi({ albumUrl: "https://example.com/art.png" })
    const entry = createMockSongEntry({
      song: { ...createMockSongEntry().song, hasAlbumArt: true },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[entry]} members={[]} />)

    expect(await screen.findByAltText("Amazing Grace album art")).toBeInTheDocument()
  })

  it("shows the 'Start typing to search.' prompt before any input", async () => {
    const user = userEvent.setup()
    mockApi()
    render(<LineupSongList lineupId="lineup-1" songs={[]} members={[]} />)

    await user.click(screen.getByPlaceholderText("Search songs to add..."))

    expect(await screen.findByText("Start typing to search.")).toBeInTheDocument()
  })

  it("shows 'Searching...' while a search is in flight, then the result", async () => {
    const user = userEvent.setup()
    let resolveGet!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolveGet = resolve
    })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") return pending as never
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<LineupSongList lineupId="lineup-1" songs={[]} members={[]} />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "how")

    expect(await screen.findByText("Searching...")).toBeInTheDocument()

    resolveGet({
      data: { items: [{ id: "song-2", title: "How Great Thou Art", artist: null, hasAlbumArt: false }] },
      error: undefined,
    })

    expect(await screen.findByText("How Great Thou Art")).toBeInTheDocument()
  })

  it("shows 'No songs found.' when the search query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<LineupSongList lineupId="lineup-1" songs={[]} members={[]} />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("No songs found.", {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it("excludes an already-added song from the combobox results and adds a new one on selection", async () => {
    const user = userEvent.setup()
    mockApi({
      searchResults: [
        { id: "song-1", title: "Amazing Grace", artist: null, hasAlbumArt: false },
        { id: "song-2", title: "How Great Thou Art", artist: null, hasAlbumArt: false },
      ],
    })
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[]} />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "a")

    await waitFor(() => {
      expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    })
    // "Amazing Grace" still appears once - as the existing set-list row, not
    // a second (combobox option) match.
    expect(screen.getAllByText("Amazing Grace")).toHaveLength(1)

    await user.click(screen.getByText("How Great Thou Art"))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/songs", {
        params: { path: { id: "lineup-1" } },
        body: { songId: "song-2" },
      })
    })
  })

  it("shows an error toast when adding a song fails", async () => {
    const user = userEvent.setup()
    mockApi({
      searchResults: [{ id: "song-2", title: "How Great Thou Art", artist: null, hasAlbumArt: false }],
    })
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupSongList lineupId="lineup-1" songs={[]} members={[]} />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "how")
    await user.click(await screen.findByText("How Great Thou Art"))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to add song.", { position: "top-center" })
    })
  })

  it("removes a song from the set list via the overflow menu", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for Amazing Grace" }))
    await user.click(screen.getByRole("menuitem", { name: "Remove" }))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: "lineup-1", songId: "song-1" } },
      })
    })
  })

  it("shows an error toast when removing a song fails", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for Amazing Grace" }))
    await user.click(screen.getByRole("menuitem", { name: "Remove" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to remove song.", {
        position: "top-center",
      })
    })
  })

  it("disables 'Move up' on the first song and 'Move down' on the last", async () => {
    const user = userEvent.setup()
    mockApi()
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for Amazing Grace" }))
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute("data-disabled")
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("button", { name: "More actions for How Great Thou Art" }))
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Move up" })).not.toHaveAttribute("data-disabled")
  })

  it("moves a song down and calls the reorder mutation with the new order", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PUT).mockResolvedValue({ data: {}, error: undefined } as never)
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for Amazing Grace" }))
    await user.click(screen.getByRole("menuitem", { name: "Move down" }))

    await waitFor(() => {
      expect(apiClient.PUT).toHaveBeenCalledWith("/api/lineups/{id}/songs-order", {
        params: { path: { id: "lineup-1" } },
        body: { songIds: ["song-2", "song-1"] },
      })
    })
  })

  it("moves a song up and calls the reorder mutation with the new order", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PUT).mockResolvedValue({ data: {}, error: undefined } as never)
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for How Great Thou Art" }))
    await user.click(screen.getByRole("menuitem", { name: "Move up" }))

    await waitFor(() => {
      expect(apiClient.PUT).toHaveBeenCalledWith("/api/lineups/{id}/songs-order", {
        params: { path: { id: "lineup-1" } },
        body: { songIds: ["song-2", "song-1"] },
      })
    })
  })

  it("shows an error toast when reordering fails", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PUT).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    await user.click(screen.getByRole("button", { name: "More actions for Amazing Grace" }))
    await user.click(screen.getByRole("menuitem", { name: "Move down" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to reorder songs.", {
        position: "top-center",
      })
    })
  })

  it("reorders songs by dragging the handle and calls the reorder mutation", async () => {
    mockApi()
    vi.mocked(apiClient.PUT).mockResolvedValue({ data: {}, error: undefined } as never)
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    const handle = screen.getByRole("button", { name: "Reorder Amazing Grace" })
    fireEvent.mouseDown(handle, { clientY: 0 })
    fireEvent.mouseMove(document, { clientY: 200 })
    fireEvent.mouseUp(document, { clientY: 200 })

    await waitFor(() => {
      expect(apiClient.PUT).toHaveBeenCalledWith("/api/lineups/{id}/songs-order", {
        params: { path: { id: "lineup-1" } },
        body: { songIds: ["song-2", "song-1"] },
      })
    })
  })

  it("does not call the reorder mutation when a drag ends back where it started", async () => {
    mockApi()
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    // Already first - dragging further up clamps back to the same index.
    const handle = screen.getByRole("button", { name: "Reorder Amazing Grace" })
    fireEvent.mouseDown(handle, { clientY: 200 })
    fireEvent.mouseMove(document, { clientY: 0 })
    fireEvent.mouseUp(document, { clientY: 0 })

    expect(apiClient.PUT).not.toHaveBeenCalled()
  })

  it("drags back up above every other row when dragged upward", async () => {
    mockApi()
    vi.mocked(apiClient.PUT).mockResolvedValue({ data: {}, error: undefined } as never)
    const first = createMockSongEntry({ id: "ls-1", song: { ...createMockSongEntry().song, id: "song-1" } })
    const second = createMockSongEntry({
      id: "ls-2",
      song: { ...createMockSongEntry().song, id: "song-2", title: "How Great Thou Art" },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[first, second]} members={[]} />)

    const handle = screen.getByRole("button", { name: "Reorder How Great Thou Art" })
    fireEvent.mouseDown(handle, { clientY: 200 })
    fireEvent.mouseMove(document, { clientY: 0 })
    fireEvent.mouseUp(document, { clientY: 0 })

    await waitFor(() => {
      expect(apiClient.PUT).toHaveBeenCalledWith("/api/lineups/{id}/songs-order", {
        params: { path: { id: "lineup-1" } },
        body: { songIds: ["song-2", "song-1"] },
      })
    })
  })

  it("disables the singer picker when there's no roster to pick from", () => {
    mockApi()
    render(<LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[]} />)

    expect(screen.getByRole("button", { name: "No one on the roster yet" })).toBeDisabled()
  })

  it("groups vocalists ahead of the rest of the roster and assigns a singer on selection", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    const vocalist = createMockMember({
      id: "lm-1",
      instruments: ["singer"],
      user: { id: "user-1", name: "Alex Vocalist", image: null },
    })
    const otherMember = createMockMember({
      id: "lm-2",
      instruments: ["bass"],
      user: { id: "user-2", name: "Sam Bassist", image: null },
    })
    render(
      <LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[vocalist, otherMember]} />
    )

    await user.click(screen.getByRole("button", { name: /Assign a singer/ }))

    expect(screen.getByText("Singers")).toBeInTheDocument()
    expect(screen.getByText("Other members")).toBeInTheDocument()

    await user.click(screen.getByText("Alex Vocalist"))

    await waitFor(() => {
      expect(apiClient.PATCH).toHaveBeenCalledWith("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: "lineup-1", songId: "song-1" } },
        body: { singerId: "user-1" },
      })
    })
  })

  it("clears the singer when 'Unassigned' is selected", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    const member = createMockMember()
    const entry = createMockSongEntry({
      singer: { id: "user-1", name: "Ben Ortega", image: null },
    })
    render(<LineupSongList lineupId="lineup-1" songs={[entry]} members={[member]} />)

    await user.click(screen.getByRole("button", { name: /Ben Ortega/ }))
    await user.click(screen.getByText("Unassigned"))

    await waitFor(() => {
      expect(apiClient.PATCH).toHaveBeenCalledWith("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: "lineup-1", songId: "song-1" } },
        body: { singerId: null },
      })
    })
  })

  it("shows an error toast when updating the singer fails", async () => {
    const user = userEvent.setup()
    mockApi()
    vi.mocked(apiClient.PATCH).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    const member = createMockMember()
    render(<LineupSongList lineupId="lineup-1" songs={[createMockSongEntry()]} members={[member]} />)

    await user.click(screen.getByRole("button", { name: /Assign a singer/ }))
    await user.click(screen.getByText("Ben Ortega"))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update singer.", {
        position: "top-center",
      })
    })
  })
})
