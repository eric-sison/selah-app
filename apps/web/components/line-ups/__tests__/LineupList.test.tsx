import { useRouter, useSearchParams } from "next/navigation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LineupList, type Lineup } from "@/components/line-ups/LineupList"
import { apiClient } from "@/lib/api-client"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn(), useRouter: vi.fn() }))

function mockSearchParams(query = "") {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(query) as never)
}

function mockLineups(data: unknown[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/lineups") return Promise.resolve({ data, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

function createMockLineup(overrides: Partial<Lineup> = {}): Lineup {
  return {
    id: "lineup-1",
    status: "draft",
    serviceType: "sunday_service",
    serviceDate: "2026-07-19T00:00:00.000Z",
    rehearsalDate: null,
    team: { id: "team-1", name: "Sunday AM Team" },
    seriesName: "When We Gather",
    topic: "Sermon",
    wordReference: "",
    wordText: null,
    direction: null,
    devoLeader: null,
    songs: [],
    members: [],
    commentCount: 0,
    approvedBy: null,
    approvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function createMockLineupMember(
  overrides: Partial<Lineup["members"][number]> = {}
): Lineup["members"][number] {
  return {
    id: "lm-1",
    instruments: [],
    isAvailable: true,
    user: { id: "user-1", name: "Ben Ortega", image: null },
    ...overrides,
  }
}

describe("LineupList", () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows the empty state with a create action for an admin", async () => {
    mockSearchParams()
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("No line ups yet")).toBeInTheDocument()
    expect(screen.getByText("Create a lineup to organize songs for services.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add a line up" })).toBeInTheDocument()
  })

  it("hides the create action for a non-admin", async () => {
    mockSearchParams()
    mockLineups([])
    render(<LineupList />, { session: createMockSession({ role: "user" }) })

    expect(await screen.findByText("No line ups yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a line up" })).not.toBeInTheDocument()
  })

  it("shows a filtered-empty state (no create action) when a filter is active and nothing matches", async () => {
    mockSearchParams("q=zzz")
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("No line ups match your filters")).toBeInTheDocument()
    expect(screen.getByText("Try a different search or clear the filters above.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a line up" })).not.toBeInTheDocument()
  })

  it("falls back to the empty state when the API returns an error", async () => {
    mockSearchParams()
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { message: "boom" },
    } as never)
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("No line ups yet")).toBeInTheDocument()
  })

  it("passes q/from/to/status/sort through to the API as query params", async () => {
    mockSearchParams("q=rooted&from=2026-07-01&to=2026-07-31&status=pending,approved&sort=desc")
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    await screen.findByText("No line ups match your filters")
    expect(apiClient.GET).toHaveBeenCalledWith("/api/lineups", {
      params: {
        query: {
          q: "rooted",
          from: "2026-07-01",
          to: "2026-07-31",
          status: "pending,approved",
          sort: "desc",
        },
      },
    })
  })

  it("defaults `sort` to 'asc' when no sort param is in the URL", async () => {
    mockSearchParams()
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    await screen.findByText("No line ups yet")
    expect(apiClient.GET).toHaveBeenCalledWith("/api/lineups", {
      params: {
        query: { q: undefined, from: undefined, to: undefined, status: undefined, sort: "asc" },
      },
    })
  })

  it("renders a draft lineup with no roster and no songs", async () => {
    mockSearchParams()
    mockLineups([
      createMockLineup({
        status: "draft",
        seriesName: "When We Gather",
        topic: "Sermon",
        songs: [],
        members: [],
        commentCount: 0,
      }),
    ])
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("When We Gather")).toBeInTheDocument()
    expect(screen.getByText("Sermon")).toBeInTheDocument()
    expect(screen.getByText("No roster yet")).toBeInTheDocument()
    expect(screen.getByText("No songs yet")).toBeInTheDocument()
    expect(screen.getByText("Sunday AM Team")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("hides the series line and falls back to 'Untitled' when seriesName and topic are null", async () => {
    mockSearchParams()
    mockLineups([createMockLineup({ seriesName: null, topic: null, wordReference: null })])
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("Untitled")).toBeInTheDocument()
    expect(screen.queryByText("When We Gather")).not.toBeInTheDocument()
  })

  it("renders a pending lineup with a singular song count and a small roster", async () => {
    mockSearchParams()
    mockLineups([
      createMockLineup({
        status: "pending",
        songs: [
          {
            id: "ls-1",
            position: 0,
            song: {
              id: "song-1",
              title: "Amazing Grace",
              artist: null,
              musicalKey: null,
              tempo: null,
              hasAlbumArt: false,
            },
            singer: null,
          },
        ],
        members: [createMockLineupMember()],
      }),
    ])
    render(<LineupList />, { session: createMockSession() })

    await screen.findByText("When We Gather")
    expect(screen.getByText("1 song")).toBeInTheDocument()
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.queryByText("No roster yet")).not.toBeInTheDocument()
  })

  it("renders an approved lineup with a plural song count and a collapsed '+N' roster overflow", async () => {
    mockSearchParams()
    mockLineups([
      createMockLineup({
        status: "approved",
        songs: [
          {
            id: "ls-1",
            position: 0,
            song: {
              id: "song-1",
              title: "Amazing Grace",
              artist: null,
              musicalKey: null,
              tempo: null,
              hasAlbumArt: false,
            },
            singer: null,
          },
          {
            id: "ls-2",
            position: 1,
            song: {
              id: "song-2",
              title: "How Great Thou Art",
              artist: null,
              musicalKey: null,
              tempo: null,
              hasAlbumArt: false,
            },
            singer: null,
          },
        ],
        members: Array.from({ length: 7 }, (_, i) =>
          createMockLineupMember({
            id: `lm-${i}`,
            user: { id: `user-${i}`, name: `Member ${i}`, image: null },
          })
        ),
      }),
    ])
    render(<LineupList />, { session: createMockSession() })

    await screen.findByText("When We Gather")
    expect(screen.getByText("2 songs")).toBeInTheDocument()
    expect(screen.getByText("Approved")).toBeInTheDocument()
    expect(screen.getByText("+2")).toBeInTheDocument()
  })
})
