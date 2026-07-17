import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LineupSongsField, type LineupSongDraft } from "@/components/line-ups/LineupSongsField"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

interface SongResult {
  id: string
  title: string
  artist: string | null
}

const AMAZING_GRACE: SongResult = { id: "song-1", title: "Amazing Grace", artist: "Traditional" }
const HOW_GREAT: SongResult = { id: "song-2", title: "How Great Thou Art", artist: null }

function mockSearchResults(items: SongResult[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/songs") return Promise.resolve({ data: { items }, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

interface HarnessProps {
  initialSongs?: LineupSongDraft[]
}

// LineupSongsField is fully controlled (it owns no `songs` state itself) -
// this harness supplies the useState a real parent (CreateLineupForm) would,
// so add/remove interactions actually round-trip.
function Harness({ initialSongs = [] }: HarnessProps) {
  const [songs, setSongs] = useState<LineupSongDraft[]>(initialSongs)
  return <LineupSongsField songs={songs} onSongsChange={setSongs} />
}

describe("LineupSongsField", () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
  })

  it("shows the empty state when no songs are added", () => {
    render(<Harness />)

    expect(screen.getByText("No songs added yet")).toBeInTheDocument()
    expect(screen.getByText("Search above to build the set list.")).toBeInTheDocument()
  })

  it("shows the 'Start typing to search.' prompt before any input", async () => {
    const user = userEvent.setup()
    mockSearchResults([])
    render(<Harness />)

    await user.click(screen.getByPlaceholderText("Search songs to add..."))

    expect(await screen.findByText("Start typing to search.")).toBeInTheDocument()
    expect(apiClient.GET).not.toHaveBeenCalled()
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
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("Searching...")).toBeInTheDocument()

    resolveGet({ data: { items: [AMAZING_GRACE] }, error: undefined })

    expect(await screen.findByText("Amazing Grace")).toBeInTheDocument()
  })

  it("shows 'No songs found.' when the search returns nothing", async () => {
    const user = userEvent.setup()
    mockSearchResults([])
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("No songs found.", {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it("shows 'No songs found.' when the search query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/songs") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "grace")

    expect(await screen.findByText("No songs found.", {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it("adds a song from the combobox and falls back to 'Unknown artist'", async () => {
    const user = userEvent.setup()
    mockSearchResults([HOW_GREAT])
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "great")

    await user.click(await screen.findByText("How Great Thou Art"))

    expect(await screen.findByText("Unknown artist")).toBeInTheDocument()
  })

  it("excludes an already-added song from the combobox's candidate list", async () => {
    const user = userEvent.setup()
    mockSearchResults([AMAZING_GRACE, HOW_GREAT])
    render(
      <Harness
        initialSongs={[{ id: AMAZING_GRACE.id, title: AMAZING_GRACE.title, artist: AMAZING_GRACE.artist }]}
      />
    )

    const input = screen.getByPlaceholderText("Search songs to add...")
    await user.click(input)
    await user.type(input, "a")

    await waitFor(() => {
      expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    })
    // "Amazing Grace" still appears once - as the set-list card, not as a
    // second (combobox option) match.
    expect(screen.getAllByText("Amazing Grace")).toHaveLength(1)
  })

  it("removes a song and keeps the remaining songs' position numbers in order", async () => {
    const user = userEvent.setup()
    mockSearchResults([])
    render(
      <Harness
        initialSongs={[
          { id: AMAZING_GRACE.id, title: AMAZING_GRACE.title, artist: AMAZING_GRACE.artist },
          { id: HOW_GREAT.id, title: HOW_GREAT.title, artist: HOW_GREAT.artist },
        ]}
      />
    )

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Remove Amazing Grace" }))

    expect(screen.queryByText("Amazing Grace")).not.toBeInTheDocument()
    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })
})
