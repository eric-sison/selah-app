import { useSearchParams } from "next/navigation"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupList } from "@/components/line-ups/LineupList"
import { apiClient } from "@/lib/api-client"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }))

function mockSearchParams(query = "") {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(query) as never)
}

function mockLineups(data: unknown[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/lineups") return Promise.resolve({ data, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("LineupList", () => {
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

  it("passes q/from/to/status through to the API as query params", async () => {
    mockSearchParams("q=rooted&from=2026-07-01&to=2026-07-31&status=pending,approved")
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    await screen.findByText("No line ups match your filters")
    expect(apiClient.GET).toHaveBeenCalledWith("/api/lineups", {
      params: { query: { q: "rooted", from: "2026-07-01", to: "2026-07-31", status: "pending,approved" } },
    })
  })
})
