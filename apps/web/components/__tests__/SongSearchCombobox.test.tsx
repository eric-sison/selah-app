import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SongSearchCombobox } from "@/components/SongSearchCombobox"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import { createMockPlayerContextValue, createMockSong } from "../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen } from "../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock("@/components/SongPlayerProvider", () => ({ usePlayer: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

describe("SongSearchCombobox", () => {
  beforeEach(() => {
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue())
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as never)
    // vitest.config.ts doesn't set clearMocks/resetMocks, so call history
    // would otherwise leak across tests in this file (they share the same
    // module-level apiClient.GET vi.fn()).
    vi.mocked(apiClient.GET).mockReset()
  })

  it("debounces rapid typing into a single search request", async () => {
    vi.useFakeTimers()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")

    fireEvent.input(input, { target: { value: "g" } })
    fireEvent.input(input, { target: { value: "gr" } })
    fireEvent.input(input, { target: { value: "gra" } })
    fireEvent.input(input, { target: { value: "grac" } })
    fireEvent.input(input, { target: { value: "grace" } })

    expect(apiClient.GET).not.toHaveBeenCalled()

    // Step forward in small increments rather than one large jump - a single
    // big advance can move the virtual clock past a timer's scheduled fire
    // time without giving React's effects (which schedule the *next* timer
    // in the debounce -> state update -> query-fetch chain) a chance to run
    // in between, so the chained timer never gets registered in time.
    for (let elapsed = 0; elapsed < 1000; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50)
    }

    expect(apiClient.GET).toHaveBeenCalledTimes(1)
    expect(apiClient.GET).toHaveBeenCalledWith("/api/songs", { params: { query: { q: "grace" } } })

    vi.useRealTimers()
  })

  it("shows the 'Start typing to search.' prompt when input is empty", async () => {
    const user = userEvent.setup()
    render(<SongSearchCombobox />)

    await user.click(screen.getByPlaceholderText("Search songs by title or artist..."))

    expect(await screen.findByText("Start typing to search.")).toBeInTheDocument()
    expect(apiClient.GET).not.toHaveBeenCalled()
  })

  it("shows results after the debounce settles", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", artist: "Traditional" })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [song], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("Amazing Grace", {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it("shows 'Searching...' while the query is in flight, then 'No songs found.' for an empty result", async () => {
    const user = userEvent.setup()
    let resolveGet!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolveGet = resolve
    })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") return pending as never
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("Searching...")).toBeInTheDocument()

    resolveGet({ data: { items: [], nextCursor: null }, error: undefined })

    expect(await screen.findByText("No songs found.")).toBeInTheDocument()
  })

  it("selects a result: calls selectSong, navigates to the song, and clears the input", async () => {
    const user = userEvent.setup()
    const selectSong = vi.fn()
    const push = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ selectSong }))
    vi.mocked(useRouter).mockReturnValue({ push } as never)
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", artist: "Traditional" })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [song], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...") as HTMLInputElement
    await user.click(input)
    await user.type(input, "grace")

    const option = await screen.findByText("Amazing Grace")
    await user.click(option)

    expect(selectSong).toHaveBeenCalledWith(song)
    expect(push).toHaveBeenCalledWith("/songs/song-1")
    // The component calls setInputValue("") in its onValueChange handler,
    // but base-ui's Combobox re-syncs the (controlled) input to the
    // selected item's label right after via the same onInputValueChange
    // callback, so the input actually ends up showing the selection, not
    // empty - verified empirically, not just per source reading.
    expect(input.value).toBe("Amazing Grace")
  })

  it("renders album art within a result item, and falls back to 'Unknown artist' when artist is absent", async () => {
    const user = userEvent.setup()
    const songWithArt = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    const songNoArt = createMockSong({
      id: "song-2",
      title: "How Great Thou Art",
      artist: null,
      hasAlbumArt: false,
    })
    vi.mocked(apiClient.GET).mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
        if (path === "/api/songs") {
          return Promise.resolve({
            data: { items: [songWithArt, songNoArt], nextCursor: null },
            error: undefined,
          }) as never
        }
        if (path === "/api/songs/{id}/album-url" && options?.params?.path?.id === "song-1") {
          return Promise.resolve({ data: { url: "https://example.com/art.jpg" }, error: undefined }) as never
        }
        throw new Error(`Unexpected path/id: ${path} ${JSON.stringify(options)}`)
      }
    )

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")
    await user.click(input)
    await user.type(input, "art")

    expect(await screen.findByAltText("Amazing Grace album art")).toBeInTheDocument()
    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    expect(screen.getByText("Unknown artist")).toBeInTheDocument()
    expect(screen.queryByAltText("How Great Thou Art album art")).not.toBeInTheDocument()
  })

  it("shows 'No songs found.' when the search query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("No songs found.")).toBeInTheDocument()
  })

  it("falls back to the Music icon when a result's album art query errors", async () => {
    const user = userEvent.setup()
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", hasAlbumArt: true })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [song], nextCursor: null }, error: undefined }) as never
      }
      if (path === "/api/songs/{id}/album-url") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.queryByAltText("Amazing Grace album art")).not.toBeInTheDocument()
  })

  it("ignores a null selection from the combobox's clear control", async () => {
    const user = userEvent.setup()
    const selectSong = vi.fn()
    const push = vi.fn()
    vi.mocked(usePlayer).mockReturnValue(createMockPlayerContextValue({ selectSong }))
    vi.mocked(useRouter).mockReturnValue({ push } as never)
    const song = createMockSong({ id: "song-1", title: "Amazing Grace", artist: "Traditional" })
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: { items: [song], nextCursor: null }, error: undefined }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    const { container } = render(<SongSearchCombobox />)
    const input = screen.getByPlaceholderText("Search songs by title or artist...") as HTMLInputElement
    await user.click(input)
    await user.type(input, "grace")
    await user.click(await screen.findByText("Amazing Grace"))

    selectSong.mockClear()
    push.mockClear()

    const clearButton = container.querySelector('[data-slot="combobox-clear"]') as HTMLButtonElement
    expect(clearButton).toBeInTheDocument()
    await user.click(clearButton)

    expect(input.value).toBe("")
    expect(selectSong).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
