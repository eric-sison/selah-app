import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TeamMembershipFields, type TeamMemberDraft, type User } from "@/components/teams/TeamMembershipFields"
import type { Musician } from "@/components/musicians/MusicianList"
import { apiClient } from "@/lib/api-client"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

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

const AVA: Musician = {
  id: "musician-1",
  user: AVA_USER,
  instruments: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}
const BEN: Musician = {
  id: "musician-2",
  user: BEN_USER,
  instruments: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function mockData(users: User[] = [AVA_USER, BEN_USER], musicians: Musician[] = [AVA, BEN]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/users") return Promise.resolve({ data: users, error: undefined }) as never
    if (path === "/api/musicians") return Promise.resolve({ data: musicians, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

function mockPatchSuccess() {
  vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: undefined } as never)
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
    vi.mocked(apiClient.PATCH).mockReset()
  })

  it("shows the empty state when no musicians are added", async () => {
    mockData()
    render(<Harness />)

    expect(await screen.findByText("No musicians added yet")).toBeInTheDocument()
    expect(screen.getByText("Search above to add someone to the roster.")).toBeInTheDocument()
  })

  it("adds a musician when selected from the combobox", async () => {
    const user = userEvent.setup()
    mockData()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search musicians to add...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    expect(await screen.findByText("Add instruments")).toBeInTheDocument()
  })

  it("excludes already-added musicians from the combobox's candidate list", async () => {
    const user = userEvent.setup()
    mockData()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: AVA.instruments }]} />)

    const input = screen.getByPlaceholderText("Search musicians to add...")
    await user.click(input)

    expect(await screen.findByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.queryByText("ava@example.com")).not.toBeInTheDocument()
  })

  it("removes a musician when its remove button is clicked", async () => {
    const user = userEvent.setup()
    mockData()
    // Uses Ben (no avatar image) rather than Ava here so the member card's
    // own `image ?? undefined` fallback (distinct from the combobox item's)
    // gets exercised too.
    render(<Harness initialMembers={[{ musicianId: BEN.id, user: BEN.user, instruments: [] }]} />)

    await screen.findByText("Add instruments")
    await user.click(screen.getByRole("button", { name: "Remove Ben Ortega" }))

    expect(await screen.findByText("No musicians added yet")).toBeInTheDocument()
  })

  it("toggling one musician's instrument leaves another musician's instruments untouched", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(
      <Harness
        initialMembers={[
          { musicianId: AVA.id, user: AVA.user, instruments: [] },
          { musicianId: BEN.id, user: BEN.user, instruments: ["drums"] },
        ]}
      />
    )

    const avaTrigger = screen.getAllByText("Add instruments")[0]!
    await user.click(avaTrigger)
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))
    await waitFor(() => expect(apiClient.PATCH).toHaveBeenCalled())
    await user.keyboard("{Escape}")

    // Ben's own trigger still shows his one assigned instrument, unaffected
    // by Ava's change - closing Ava's popover first avoids colliding with
    // its own (unselected) "Drums" toggle option, which has the same text.
    expect(await screen.findByText("Drums")).toBeInTheDocument()
  })

  it("shows no candidates when the musicians query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") return Promise.resolve({ data: [AVA_USER, BEN_USER], error: undefined }) as never
      if (path === "/api/musicians") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<Harness />)

    const input = screen.getByPlaceholderText("Search musicians to add...")
    await user.click(input)

    expect(await screen.findByText("No musicians found.")).toBeInTheDocument()
  })

  it("shows no team-leader candidates when the users query errors", async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      if (path === "/api/musicians") return Promise.resolve({ data: [AVA, BEN], error: undefined }) as never
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<Harness />)

    const input = screen.getByPlaceholderText("Optional - search users...")
    await user.click(input)

    expect(screen.queryByText("Ava Lim")).not.toBeInTheDocument()
  })

  it("toggles an instrument on for a musician via the instruments popover", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: [] }]} />)

    await user.click(await screen.findByText("Add instruments"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))

    expect(await screen.findByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
    expect(screen.queryByText("Add instruments")).not.toBeInTheDocument()
  })

  it("toggles an instrument off for a musician already holding it", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: ["bass"] }]} />)

    // The popover is closed here, so its trigger (whose accessible name is
    // now "Bass" too, since it renders the assigned instrument as a badge)
    // is the only match - open it to reach the toggle badge inside.
    await user.click(screen.getByText("Bass"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))

    expect(await screen.findByText("Add instruments")).toBeInTheDocument()
  })

  it("toggles an instrument via the Enter key", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: [] }]} />)

    await user.click(await screen.findByText("Add instruments"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: "Enter" })

    expect(await screen.findByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
  })

  it("toggles an instrument via the Space key", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: [] }]} />)

    await user.click(await screen.findByText("Add instruments"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: " " })

    expect(await screen.findByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
  })

  it("ignores a non-activation key on an instrument toggle badge", async () => {
    const user = userEvent.setup()
    mockData()
    mockPatchSuccess()
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: [] }]} />)

    await user.click(await screen.findByText("Add instruments"))
    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: "Tab" })

    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
    expect(apiClient.PATCH).not.toHaveBeenCalled()
  })

  it("shows a toast error when updating a musician's instruments fails", async () => {
    const user = userEvent.setup()
    mockData()
    vi.mocked(apiClient.PATCH).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<Harness initialMembers={[{ musicianId: AVA.id, user: AVA.user, instruments: [] }]} />)

    await user.click(await screen.findByText("Add instruments"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update instruments.", {
        position: "top-center",
      })
    )
  })

  it("selects a team leader from the combobox", async () => {
    const user = userEvent.setup()
    mockData()
    render(<Harness />)

    const input = screen.getByPlaceholderText("Optional - search users...") as HTMLInputElement
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))

    expect(input.value).toBe("Ava Lim")
    expect(document.querySelector('[data-slot="combobox-clear"]')).toBeInTheDocument()
  })

  it("seeds the leader input with the given initial name", () => {
    mockData()
    render(<Harness initialLeaderName="Ava Lim" initialLeaderId="user-1" />)

    expect(screen.getByPlaceholderText("Optional - search users...")).toHaveValue("Ava Lim")
  })

  it("clears a selected team leader", async () => {
    const user = userEvent.setup()
    mockData()
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
    mockData()
    render(<Harness autoFocusMembers />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search musicians to add...")).toHaveFocus()
    })
  })

  it("does not focus the musicians search input on mount by default", async () => {
    mockData()
    render(<Harness />)

    await screen.findByText("No musicians added yet")
    expect(screen.getByPlaceholderText("Search musicians to add...")).not.toHaveFocus()
  })
})
