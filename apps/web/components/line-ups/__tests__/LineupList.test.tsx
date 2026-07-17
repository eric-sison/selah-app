import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupList } from "@/components/line-ups/LineupList"
import { apiClient } from "@/lib/api-client"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

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
    mockLineups([])
    render(<LineupList />, { session: createMockSession() })

    expect(await screen.findByText("No line ups yet")).toBeInTheDocument()
    expect(screen.getByText("Create a lineup to organize songs for services.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add a line up" })).toBeInTheDocument()
  })

  it("hides the create action for a non-admin", async () => {
    mockLineups([])
    render(<LineupList />, { session: createMockSession({ role: "user" }) })

    expect(await screen.findByText("No line ups yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a line up" })).not.toBeInTheDocument()
  })
})
