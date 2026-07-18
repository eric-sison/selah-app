import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LineupDetailsView } from "@/components/line-ups/LineupDetailsView"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

// LineupDetailsView's own job is fetching the lineup and assembling the
// title/meta block plus its three "lego" sections around it - each section
// owns its own data fetching/mutations and has its own test file
// (LineupRosterSection, LineupSongList, LineupDiscussion), so those are
// stubbed here to keep this file focused on the shell: loading/error states,
// the title/meta rendering, and that each section receives the right slice
// of the lineup. EditLineupSheet pulls in CreateLineupForm's much larger
// dependency tree and isn't this file's concern either - just that it's
// wired to the "Update details" button.
vi.mock("@/components/line-ups/LineupRosterSection", () => ({
  LineupRosterSection: ({ members }: { members: { id: string }[] }) => (
    <div data-testid="roster-section">{members.length} roster members</div>
  ),
}))
vi.mock("@/components/line-ups/LineupSongList", () => ({
  LineupSongList: ({ songs }: { songs: { id: string }[] }) => (
    <div data-testid="song-list">{songs.length} songs</div>
  ),
}))
vi.mock("@/components/line-ups/LineupDiscussion", () => ({
  LineupDiscussion: () => <div data-testid="discussion" />,
}))
vi.mock("@/components/line-ups/EditLineupSheet", () => ({
  EditLineupSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="edit-sheet" /> : null),
}))

function mockLineupResponse(data: unknown, error?: unknown) {
  vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
    if (path === "/api/lineups/{id}") {
      if (error) return { data: undefined, error }
      return { data, error: undefined }
    }
    return { data: undefined, error: undefined }
  })
}

function createMockLineup(overrides: Record<string, unknown> = {}) {
  return {
    id: "lineup-1",
    status: "draft",
    serviceType: "sunday_service",
    serviceDate: "2026-07-19T00:00:00.000Z",
    rehearsalDate: null,
    team: { id: "team-1", name: "Sunday AM Team" },
    seriesName: "When We Gather",
    topic: "Sermon",
    wordReference: null,
    wordText: null,
    direction: null,
    devoLeader: null,
    songs: [
      {
        id: "ls-1",
        position: 0,
        song: { id: "song-1", title: "Amazing Grace", artist: null, musicalKey: "G", tempo: 72 },
        singer: null,
      },
    ],
    members: [
      {
        id: "lm-1",
        instruments: ["bass"],
        isAvailable: true,
        user: { id: "user-1", name: "Ben Ortega", image: null },
      },
    ],
    commentCount: 0,
    approvedBy: null,
    approvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("LineupDetailsView", () => {
  it("renders a loading skeleton while the lineup query is pending", () => {
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)

    const { container } = renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows a 'Line up not found' empty state on error", async () => {
    mockLineupResponse(undefined, { status: 404, message: "Not found" })

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Line up not found")).toBeInTheDocument()
    expect(screen.getByText("The requested line up could not be found.")).toBeInTheDocument()
  })

  it("disables 'Update details' until the lineup has loaded", async () => {
    mockLineupResponse(createMockLineup())

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(screen.getByRole("button", { name: "Update details" })).toBeDisabled()
    await screen.findByText("Sermon")
    expect(screen.getByRole("button", { name: "Update details" })).toBeEnabled()
  })

  it("renders the title, series name, status badge, and meta line", async () => {
    mockLineupResponse(createMockLineup())

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Sermon")).toBeInTheDocument()
    expect(screen.getByText("When We Gather")).toBeInTheDocument()
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Sermon").parentElement?.textContent).toContain("Sunday AM Team")
  })

  it("falls back to 'Untitled' and hides the series line when there's no topic or series", async () => {
    mockLineupResponse(createMockLineup({ seriesName: null, topic: null }))

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Untitled")).toBeInTheDocument()
    expect(screen.queryByText("When We Gather")).not.toBeInTheDocument()
  })

  it("shows the rehearsal date when set", async () => {
    mockLineupResponse(createMockLineup({ rehearsalDate: "2026-07-17T18:00:00.000Z" }))

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText(/Rehearsal:/)).toBeInTheDocument()
  })

  it("hides the rehearsal line when there's no rehearsal date", async () => {
    mockLineupResponse(createMockLineup({ rehearsalDate: null }))

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    await screen.findByText("Sermon")
    expect(screen.queryByText(/Rehearsal:/)).not.toBeInTheDocument()
  })

  it("assembles the roster, song list, and discussion sections with the lineup's data", async () => {
    mockLineupResponse(createMockLineup())

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByTestId("roster-section")).toHaveTextContent("1 roster members")
    expect(screen.getByTestId("song-list")).toHaveTextContent("1 songs")
    expect(screen.getByTestId("discussion")).toBeInTheDocument()
  })

  it("opens the edit sheet when 'Update details' is clicked", async () => {
    const user = userEvent.setup()
    mockLineupResponse(createMockLineup())

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    await screen.findByText("Sermon")
    expect(screen.queryByTestId("edit-sheet")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Update details" }))

    expect(screen.getByTestId("edit-sheet")).toBeInTheDocument()
  })
})
