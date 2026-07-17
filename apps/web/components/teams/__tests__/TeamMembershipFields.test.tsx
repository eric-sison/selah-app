import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TeamMembershipFields, type TeamMemberDraft, type User } from "@/components/TeamMembershipFields"
import { apiClient } from "@/lib/api-client"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const AVA: User = {
  id: "user-1",
  name: "Ava Lim",
  email: "ava@example.com",
  image: "https://example.com/ava.jpg",
}
const BEN: User = { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null }

function mockUsers(data: User[] = [AVA, BEN]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/users") return Promise.resolve({ data, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

interface HarnessProps {
  initialLeaderName?: string
  initialLeaderId?: string | null
  initialMembers?: TeamMemberDraft[]
  autoFocusMembers?: boolean
}

// TeamMembershipFields is fully controlled (it owns no `members`/leader
// state itself) - this harness supplies the useState a real parent
// (CreateTeamForm/EditTeamForm) would, so interactions actually round-trip.
function Harness({
  initialLeaderName,
  initialLeaderId = null,
  initialMembers = [],
  autoFocusMembers,
}: HarnessProps) {
  const [teamLeaderId, setTeamLeaderId] = useState<string | null>(initialLeaderId)
  const [members, setMembers] = useState<TeamMemberDraft[]>(initialMembers)
  return (
    <TeamMembershipFields
      initialLeaderName={initialLeaderName}
      teamLeaderId={teamLeaderId}
      onTeamLeaderIdChange={setTeamLeaderId}
      members={members}
      onMembersChange={setMembers}
      autoFocusMembers={autoFocusMembers}
    />
  )
}

describe("TeamMembershipFields", () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
  })

  it("shows the empty state when no musicians are added", async () => {
    mockUsers()
    render(<Harness />)

    expect(await screen.findByText("No musicians added yet")).toBeInTheDocument()
    expect(screen.getByText("Search above to add someone to the roster.")).toBeInTheDocument()
  })

  it("adds a musician when selected from the combobox", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    expect(await screen.findByText("Add roles")).toBeInTheDocument()
  })

  it("excludes already-added musicians from the combobox's candidate list", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: [] }]} />)

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)

    expect(await screen.findByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.queryByText("ava@example.com")).not.toBeInTheDocument()
  })

  it("removes a musician when its remove button is clicked", async () => {
    const user = userEvent.setup()
    mockUsers()
    // Uses Ben (no avatar image) rather than Ava here so the member card's
    // own `image ?? undefined` fallback (distinct from the combobox item's)
    // gets exercised too.
    render(<Harness initialMembers={[{ user: BEN, roles: [] }]} />)

    await screen.findByText("Add roles")
    await user.click(screen.getByRole("button", { name: "Remove Ben Ortega" }))

    expect(await screen.findByText("No musicians added yet")).toBeInTheDocument()
  })

  it("toggling one musician's role leaves another musician's roles untouched", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(
      <Harness
        initialMembers={[
          { user: AVA, roles: [] },
          { user: BEN, roles: ["drums"] },
        ]}
      />
    )

    const avaTrigger = screen.getAllByText("Add roles")[0]!
    await user.click(avaTrigger)
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))
    await user.keyboard("{Escape}")

    // Ben's own trigger still shows his one assigned role, unaffected by
    // Ava's change - closing Ava's popover first avoids colliding with its
    // own (unselected) "Drums" toggle option, which has the same text.
    expect(await screen.findByText("Drums")).toBeInTheDocument()
  })

  it("shows no candidates when the users query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search users to add...")
    await user.click(input)

    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("toggles a role on for a musician via the roles popover", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: [] }]} />)

    await user.click(await screen.findByText("Add roles"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))

    expect(screen.queryByText("Add roles")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
  })

  it("toggles a role off for a musician already holding it", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: ["bass"] }]} />)

    // The popover is closed here, so its trigger (whose accessible name is
    // now "Bass" too, since it renders the assigned role as a badge) is the
    // only match - open it to reach the toggle badge inside.
    await user.click(screen.getByText("Bass"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))

    expect(await screen.findByText("Add roles")).toBeInTheDocument()
  })

  it("toggles a role via the Enter key", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: [] }]} />)

    await user.click(await screen.findByText("Add roles"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: "Enter" })

    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
  })

  it("toggles a role via the Space key", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: [] }]} />)

    await user.click(await screen.findByText("Add roles"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: " " })

    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
  })

  it("ignores a non-activation key on a role toggle badge", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness initialMembers={[{ user: AVA, roles: [] }]} />)

    await user.click(await screen.findByText("Add roles"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: "Tab" })

    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
  })

  it("selects a team leader from the combobox", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Optional - search users...") as HTMLInputElement
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    expect(input.value).toBe("Ava Lim")
    expect(document.querySelector('[data-slot="combobox-clear"]')).toBeInTheDocument()
  })

  it("seeds the leader input with the given initial name", () => {
    mockUsers()
    render(<Harness initialLeaderName="Ava Lim" initialLeaderId="user-1" />)

    expect(screen.getByPlaceholderText("Optional - search users...")).toHaveValue("Ava Lim")
  })

  it("clears a selected team leader", async () => {
    const user = userEvent.setup()
    mockUsers()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Optional - search users...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    const clearButton = document.querySelector('[data-slot="combobox-clear"]') as HTMLButtonElement
    await user.click(clearButton)

    expect(screen.getByPlaceholderText("Optional - search users...")).toHaveValue("")
    expect(document.querySelector('[data-slot="combobox-clear"]')).not.toBeInTheDocument()
  })

  it("focuses the musicians search input on mount when autoFocusMembers is set", async () => {
    mockUsers()
    render(<Harness autoFocusMembers />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search users to add...")).toHaveFocus()
    })
  })

  it("does not focus the musicians search input on mount by default", async () => {
    mockUsers()
    render(<Harness />)

    await screen.findByText("No musicians added yet")
    expect(screen.getByPlaceholderText("Search users to add...")).not.toHaveFocus()
  })
})
