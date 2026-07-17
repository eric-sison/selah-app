import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditTeamForm } from "@/components/teams/EditTeamForm"
import { apiClient } from "@/lib/api-client"
import { createMockTeam, createMockTeamMember } from "../../../test/fixtures"
import { renderWithProviders, screen, waitFor } from "../../../test/render"
import type { TeamMemberDraft } from "@/components/teams/TeamMembershipFields"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

// Shared mutable state a mocked TeamMembershipFields reads from at click
// time - `vi.hoisted` is vitest's documented escape hatch for state that
// must be visible both inside a `vi.mock` factory and in the test body.
const { membersRef } = vi.hoisted(() => ({ membersRef: { current: [] as TeamMemberDraft[] } }))

// Isolates EditTeamForm's own logic (name validation, PATCH + roster
// reconciliation) from TeamMembershipFields' own combobox/popover behavior,
// which has its own dedicated test file. `type="button"` is essential here -
// these render inside EditTeamForm's real <form>, so a plain button
// (default type="submit") would prematurely submit it on click.
vi.mock("@/components/teams/TeamMembershipFields", () => ({
  TeamMembershipFields: ({ onMembersChange }: { onMembersChange: (members: TeamMemberDraft[]) => void }) => (
    <button type="button" onClick={() => onMembersChange(membersRef.current)}>
      mock-apply-members
    </button>
  ),
}))

describe("EditTeamForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
    membersRef.current = []
  })

  it("blocks submission and shows an inline error when name is cleared", async () => {
    const user = userEvent.setup()
    const team = createMockTeam()
    renderWithProviders(<EditTeamForm team={team} />)

    await user.clear(screen.getByLabelText("Name"))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByText("Name is required.")).toBeInTheDocument()
    expect(apiClient.PATCH).not.toHaveBeenCalled()
  })

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(<EditTeamForm team={createMockTeam()} onCancel={onCancel} />)

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("disables the buttons and shows a pending label while saving", async () => {
    let resolvePatch!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePatch = resolve
    })
    vi.mocked(apiClient.PATCH).mockReturnValue(pending as never)
    const user = userEvent.setup()
    renderWithProviders(<EditTeamForm team={createMockTeam()} />)

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePatch({ data: {}, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("reconciles a full roster edit: removes a member and adds a new one in one save", async () => {
    const memberA = createMockTeamMember({
      id: "tm-a",
      user: { id: "user-a", name: "Ava Lim", image: null },
      musicianId: "musician-a",
      instruments: ["bass"],
    })
    const memberB = createMockTeamMember({
      id: "tm-b",
      user: { id: "user-b", name: "Ben Ortega", image: null },
      musicianId: "musician-b",
      instruments: ["bass", "singer"],
    })
    const team = createMockTeam({ members: [memberA, memberB] })

    // Edit: drop Ava entirely, keep Ben as-is, and add a brand-new member,
    // Cara. Instrument edits aren't part of this reconciliation at all - see
    // TeamMembershipFields.tsx's own test file for that (now-immediate)
    // mutation.
    membersRef.current = [
      { musicianId: memberB.musicianId, user: memberB.user, instruments: memberB.instruments },
      { musicianId: "musician-c", user: { id: "user-c", name: "Cara Diaz", image: null }, instruments: [] },
    ]

    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: undefined } as never)
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)

    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithProviders(<EditTeamForm team={team} onSuccess={onSuccess} />)

    await user.click(screen.getByRole("button", { name: "mock-apply-members" }))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Team updated.", { position: "top-center" })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)

    expect(apiClient.PATCH).toHaveBeenCalledWith("/api/teams/{id}", {
      params: { path: { id: team.id } },
      body: { name: team.name, teamLeaderId: null },
    })

    // Ava removed.
    expect(apiClient.DELETE).toHaveBeenCalledWith("/api/teams/{id}/members/{memberId}", {
      params: { path: { id: team.id, memberId: "tm-a" } },
    })

    // Cara added.
    expect(apiClient.POST).toHaveBeenCalledWith("/api/teams/{id}/members", {
      params: { path: { id: team.id } },
      body: { userId: "user-c" },
    })

    // Ben untouched - no DELETE/POST issued for him.
    expect(apiClient.DELETE).not.toHaveBeenCalledWith("/api/teams/{id}/members/{memberId}", {
      params: { path: { id: team.id, memberId: "tm-b" } },
    })
    expect(apiClient.POST).toHaveBeenCalledTimes(1)
  })

  it("shows a toast error and stops when updating the team's own fields fails", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    renderWithProviders(<EditTeamForm team={createMockTeam()} />)

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update team.", {
        position: "top-center",
      })
    })
    expect(apiClient.DELETE).not.toHaveBeenCalled()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("shows a toast error when removing a dropped member fails", async () => {
    const memberA = createMockTeamMember({ id: "tm-a" })
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { message: "bad" },
    } as never)
    const user = userEvent.setup()
    renderWithProviders(<EditTeamForm team={createMockTeam({ members: [memberA] })} />)

    // membersRef.current stays [] - Ava's the only member and she's dropped.
    await user.click(screen.getByRole("button", { name: "mock-apply-members" }))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to remove a team member.", {
        position: "top-center",
      })
    })
  })

  it("shows a toast error when adding a new member fails", async () => {
    membersRef.current = [
      { musicianId: "musician-c", user: { id: "user-c", name: "Cara Diaz", image: null }, instruments: [] },
    ]
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    vi.mocked(apiClient.POST).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    renderWithProviders(<EditTeamForm team={createMockTeam()} />)

    await user.click(screen.getByRole("button", { name: "mock-apply-members" }))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to add a team member.", {
        position: "top-center",
      })
    })
  })
})
