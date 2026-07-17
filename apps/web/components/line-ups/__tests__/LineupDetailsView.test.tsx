import { describe, expect, it, vi } from "vitest"
import { LineupDetailsView } from "@/components/line-ups/LineupDetailsView"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
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
    wordReference: "John 3:16",
    wordText: "For God so loved the world...",
    direction: "Keep it worshipful.",
    devoLeader: { id: "user-2", name: "Dana Cruz", image: "https://example.com/dana.png" },
    songs: [
      {
        id: "ls-1",
        position: 0,
        song: { id: "song-1", title: "Amazing Grace", artist: null, musicalKey: "G", tempo: 72 },
      },
      {
        id: "ls-2",
        position: 1,
        song: { id: "song-2", title: "How Great Thou Art", artist: null, musicalKey: null, tempo: null },
      },
    ],
    members: [
      {
        id: "lm-1",
        instruments: ["bass", "drums"],
        isAvailable: true,
        user: { id: "user-1", name: "Ben Ortega", image: "https://example.com/ben.png" },
      },
      {
        id: "lm-2",
        instruments: [],
        isAvailable: false,
        user: { id: "user-3", name: "Casey Reyes", image: null },
      },
    ],
    commentCount: 3,
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

  it("renders a fully populated lineup", async () => {
    mockLineupResponse(createMockLineup())

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Sermon")).toBeInTheDocument()
    expect(screen.getByText("When We Gather")).toBeInTheDocument()
    expect(screen.getByText("Sermon").parentElement?.textContent).toContain("Sunday AM Team")
    expect(screen.getByText("John 3:16")).toBeInTheDocument()
    expect(screen.getByText("For God so loved the world...")).toBeInTheDocument()
    expect(screen.getByText("Keep it worshipful.")).toBeInTheDocument()
    expect(screen.getByText("Dana Cruz")).toBeInTheDocument()
    expect(screen.getByText("Devo Leader")).toBeInTheDocument()
    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.getByText("Bass, Drums")).toBeInTheDocument()
    expect(screen.getByText("Casey Reyes")).toBeInTheDocument()
    expect(screen.getByText("Unavailable")).toBeInTheDocument()
    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Key of G · 72 BPM")).toBeInTheDocument()
    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument()
    expect(screen.getByText("3 comments")).toBeInTheDocument()
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("renders a minimal lineup with no series, word content, roster, or songs", async () => {
    mockLineupResponse(
      createMockLineup({
        seriesName: null,
        topic: null,
        wordReference: null,
        wordText: null,
        direction: null,
        devoLeader: null,
        songs: [],
        members: [],
        commentCount: 1,
      })
    )

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Untitled")).toBeInTheDocument()
    expect(screen.queryByText("When We Gather")).not.toBeInTheDocument()
    expect(screen.queryByText("Word")).not.toBeInTheDocument()
    expect(screen.getByText("No roster yet.")).toBeInTheDocument()
    expect(screen.getByText("No songs yet.")).toBeInTheDocument()
    expect(screen.getByText("1 comment")).toBeInTheDocument()
  })

  it("renders the word card with only a reference (no text or direction)", async () => {
    mockLineupResponse(
      createMockLineup({
        wordReference: "Psalm 23",
        wordText: null,
        direction: null,
      })
    )

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Psalm 23")).toBeInTheDocument()
    expect(screen.queryByText("Direction")).not.toBeInTheDocument()
  })

  it("renders the word card with only direction (no reference or text)", async () => {
    mockLineupResponse(
      createMockLineup({
        wordReference: null,
        wordText: null,
        direction: "Keep it worshipful.",
      })
    )

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Direction")).toBeInTheDocument()
    expect(await screen.findByText("Keep it worshipful.")).toBeInTheDocument()
  })

  it("renders a devo leader with no avatar image", async () => {
    mockLineupResponse(
      createMockLineup({
        devoLeader: { id: "user-2", name: "Dana Cruz", image: null },
      })
    )

    renderWithProviders(<LineupDetailsView lineupId="lineup-1" />)

    expect(await screen.findByText("Dana Cruz")).toBeInTheDocument()
  })
})
