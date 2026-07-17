import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LineupRosterFields, type LineupMemberDraft } from "@/components/line-ups/LineupRosterFields"
import type { User } from "@/components/teams/TeamMembershipFields"
import type { Musician } from "@/components/musicians/MusicianList"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const AVA_USER: User = {
  id: "user-1",
  name: "Ava Lim",
  email: "ava@example.com",
  image: "https://example.com/ava.jpg",
}
const BEN_USER: User = { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null }

const AVA_MUSICIAN: Musician = {
  id: "musician-1",
  user: AVA_USER,
  instruments: ["bass"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function mockData(users: User[] = [AVA_USER, BEN_USER], musicians: Musician[] = [AVA_MUSICIAN]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/users") return Promise.resolve({ data: users, error: undefined }) as never
    if (path === "/api/musicians") return Promise.resolve({ data: musicians, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

interface HarnessProps {
  initialMembers?: LineupMemberDraft[]
}

// LineupRosterFields is fully controlled (it owns no `members` state itself)
// - this harness supplies the useState a real parent (CreateLineupForm)
// would, so add/remove interactions actually round-trip.
function Harness({ initialMembers = [] }: HarnessProps) {
  const [members, setMembers] = useState<LineupMemberDraft[]>(initialMembers)
  return <LineupRosterFields members={members} onMembersChange={setMembers} />
}

describe("LineupRosterFields", () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
  })

  it("shows the empty state when no members are added", async () => {
    mockData()
    render(<Harness />)

    expect(await screen.findByText("No one added yet")).toBeInTheDocument()
    expect(screen.getByText("Search above to build the roster.")).toBeInTheDocument()
  })

  it("adds a member when selected from the combobox", async () => {
    const user = userEvent.setup()
    mockData()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    expect(screen.getByRole("button", { name: "Remove Ava Lim" })).toBeInTheDocument()
  })

  it("excludes an already-added member from the combobox's candidate list", async () => {
    const user = userEvent.setup()
    mockData()
    render(
      <Harness initialMembers={[{ user: { id: AVA_USER.id, name: AVA_USER.name, image: AVA_USER.image } }]} />
    )

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)

    expect(await screen.findByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.queryByText("ava@example.com")).not.toBeInTheDocument()
  })

  it("removes a member when its remove button is clicked", async () => {
    const user = userEvent.setup()
    mockData()
    // Uses Ben (no avatar image) so the member card's own `image ?? undefined`
    // fallback, distinct from the combobox item's, gets exercised too.
    render(<Harness initialMembers={[{ user: { id: BEN_USER.id, name: BEN_USER.name, image: null } }]} />)

    await screen.findByText("Ben Ortega")
    await user.click(screen.getByRole("button", { name: "Remove Ben Ortega" }))

    expect(await screen.findByText("No one added yet")).toBeInTheDocument()
  })

  it("shows a member's instruments when they're found in the musicians map", async () => {
    mockData()
    render(
      <Harness initialMembers={[{ user: { id: AVA_USER.id, name: AVA_USER.name, image: AVA_USER.image } }]} />
    )

    expect(await screen.findByText("Bass")).toBeInTheDocument()
  })

  it("shows no instrument badges for a member with no matching musician", async () => {
    mockData()
    render(<Harness initialMembers={[{ user: { id: BEN_USER.id, name: BEN_USER.name, image: null } }]} />)

    await screen.findByText("Ben Ortega")

    expect(screen.queryByText("Bass")).not.toBeInTheDocument()
  })

  it("shows no candidates when the users query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      if (path === "/api/musicians") return Promise.resolve({ data: [], error: undefined }) as never
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)

    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("does not crash and shows no instruments when the musicians query errors", async () => {
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") return Promise.resolve({ data: [AVA_USER], error: undefined }) as never
      if (path === "/api/musicians") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(
      <Harness initialMembers={[{ user: { id: AVA_USER.id, name: AVA_USER.name, image: AVA_USER.image } }]} />
    )

    await screen.findByText("Ava Lim")

    expect(screen.queryByText("Bass")).not.toBeInTheDocument()
  })
})
