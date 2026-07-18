import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupRosterSection } from "@/components/line-ups/LineupRosterSection"
import type { Lineup } from "@/components/line-ups/LineupList"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { toast } = await import("@workspace/ui/components/Sonner")

afterEach(() => {
  vi.clearAllMocks()
})

function createMockMember(overrides: Partial<Lineup["members"][number]> = {}): Lineup["members"][number] {
  return {
    id: "lm-1",
    instruments: [],
    isAvailable: true,
    user: { id: "user-1", name: "Ben Ortega", image: null },
    ...overrides,
  }
}

const BEN = createMockMember({
  instruments: ["bass", "drums"],
  user: { id: "user-1", name: "Ben Ortega", image: "https://example.com/ben.png" },
})
const CASEY = createMockMember({
  id: "lm-2",
  isAvailable: false,
  user: { id: "user-3", name: "Casey Reyes", image: null },
})

function mockUsers(users: { id: string; name: string; email: string; image: string | null }[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/users") return Promise.resolve({ data: users, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("LineupRosterSection", () => {
  it("shows 'No roster yet.' when there are no members and no devo leader", () => {
    mockUsers([])
    render(<LineupRosterSection lineupId="lineup-1" members={[]} devoLeader={null} />)

    expect(screen.getByText("No roster yet.")).toBeInTheDocument()
  })

  it("shows the member count, including the devo leader", () => {
    mockUsers([])
    render(
      <LineupRosterSection
        lineupId="lineup-1"
        members={[BEN, CASEY]}
        devoLeader={{ id: "user-2", name: "Dana Cruz", image: null }}
      />
    )

    expect(screen.getByText("3 members")).toBeInTheDocument()
  })

  it("uses singular 'member' for exactly one person on the roster", () => {
    mockUsers([])
    render(<LineupRosterSection lineupId="lineup-1" members={[BEN]} devoLeader={null} />)

    expect(screen.getByText("1 member")).toBeInTheDocument()
  })

  it("reveals a member's role, instruments, and availability on hover", async () => {
    const user = userEvent.setup()
    mockUsers([])
    render(<LineupRosterSection lineupId="lineup-1" members={[BEN, CASEY]} devoLeader={null} />)

    await user.hover(screen.getAllByRole("button")[0]!)

    expect(await screen.findByText("Bass, Drums")).toBeInTheDocument()

    await user.hover(screen.getAllByRole("button")[1]!)

    expect(await screen.findByText("Unavailable")).toBeInTheDocument()
    expect(screen.getByText("Team member")).toBeInTheDocument()
  })

  it("removes a member when 'Remove from lineup' is clicked", async () => {
    const user = userEvent.setup()
    mockUsers([])
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupRosterSection lineupId="lineup-1" members={[BEN]} devoLeader={null} />)

    await user.hover(screen.getAllByRole("button")[0]!)
    await user.click(await screen.findByRole("button", { name: "Remove from lineup" }))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/lineups/{id}/members/{memberId}", {
        params: { path: { id: "lineup-1", memberId: "lm-1" } },
      })
    })
  })

  it("shows an error toast when removing a member fails", async () => {
    const user = userEvent.setup()
    mockUsers([])
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupRosterSection lineupId="lineup-1" members={[BEN]} devoLeader={null} />)

    await user.hover(screen.getAllByRole("button")[0]!)
    await user.click(await screen.findByRole("button", { name: "Remove from lineup" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to remove member.", {
        position: "top-center",
      })
    })
  })

  it("shows 'No users found.' when the user list fails to load", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupRosterSection lineupId="lineup-1" members={[]} devoLeader={null} />)

    await user.click(screen.getByRole("button", { name: "Add to roster" }))
    const input = await screen.findByPlaceholderText("Search members to add...")
    await user.click(input)
    await user.type(input, "a")

    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("collapses overflow avatars into a '+N' count past the visible cap", () => {
    mockUsers([])
    const members = Array.from({ length: 22 }, (_, i) =>
      createMockMember({ id: `lm-${i}`, user: { id: `user-${i}`, name: `Member ${i}`, image: null } })
    )
    render(<LineupRosterSection lineupId="lineup-1" members={members} devoLeader={null} />)

    expect(screen.getByText("+2")).toBeInTheDocument()
  })

  it("adds a member found via the search combobox, excluding those already on the roster", async () => {
    const user = userEvent.setup()
    mockUsers([
      { id: "user-1", name: "Ben Ortega", email: "ben@example.com", image: null },
      { id: "user-9", name: "Riley Chen", email: "riley@example.com", image: null },
    ])
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupRosterSection lineupId="lineup-1" members={[BEN]} devoLeader={null} />)

    await user.click(screen.getByRole("button", { name: "Add to roster" }))
    const input = await screen.findByPlaceholderText("Search members to add...")
    await user.click(input)
    await user.type(input, "e")

    await waitFor(() => {
      expect(screen.getByText("Riley Chen")).toBeInTheDocument()
    })
    expect(screen.queryByText("Ben Ortega")).not.toBeInTheDocument()

    await user.click(screen.getByText("Riley Chen"))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/members", {
        params: { path: { id: "lineup-1" } },
        body: { userId: "user-9" },
      })
    })
  })

  it("shows an error toast when adding a member fails", async () => {
    const user = userEvent.setup()
    mockUsers([{ id: "user-9", name: "Riley Chen", email: "riley@example.com", image: null }])
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupRosterSection lineupId="lineup-1" members={[]} devoLeader={null} />)

    await user.click(screen.getByRole("button", { name: "Add to roster" }))
    const input = await screen.findByPlaceholderText("Search members to add...")
    await user.click(input)
    await user.type(input, "Riley")
    await user.click(await screen.findByText("Riley Chen"))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to add member.", {
        position: "top-center",
      })
    })
  })
})
