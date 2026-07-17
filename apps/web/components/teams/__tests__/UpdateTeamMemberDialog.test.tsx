import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UpdateTeamMemberDialog } from "@/components/UpdateTeamMemberDialog"
import { apiClient } from "@/lib/api-client"
import { createMockTeamMember } from "../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../test/render"
import type { Team } from "@/components/TeamList"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const MEMBER_A = createMockTeamMember({
  id: "tm-a",
  user: { id: "user-a", name: "Ava Lim", image: "https://example.com/ava.jpg" },
  roles: ["bass"],
})
const MEMBER_B = createMockTeamMember({
  id: "tm-b",
  user: { id: "user-b", name: "Ben Ortega", image: null },
  roles: [],
})

type TeamMember = Team["members"][number]

// UpdateTeamMemberDialog is controlled by its `member` prop (null closes
// it) - this harness supplies the useState a real parent (TeamDetailsSheet)
// would, including the "reopen a member" case that drives the component's
// own render-time re-seeding logic.
function Harness() {
  const [member, setMember] = useState<TeamMember | null>(null)
  return (
    <>
      <button type="button" onClick={() => setMember(MEMBER_A)}>
        select-ava
      </button>
      <button type="button" onClick={() => setMember(MEMBER_B)}>
        select-ben
      </button>
      <UpdateTeamMemberDialog
        teamId="team-1"
        member={member}
        onOpenChange={(open) => {
          if (!open) setMember(null)
        }}
      />
    </>
  )
}

describe("UpdateTeamMemberDialog", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when no member is selected", () => {
    render(<Harness />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens with the selected member's name, avatar, and current roles", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Ava Lim")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("re-seeds its role draft when a different member is opened", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()

    // Close (Cancel), then open Ben - who holds no roles - to confirm the
    // draft reflects his roles, not Ava's leftover selection.
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "select-ben" }))

    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
  })

  it("toggles a role on and off by clicking its badge", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Drums", pressed: true }))
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("toggles a role via the Enter and Space keys, and ignores other keys", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    const drumsBadge = screen.getByRole("button", { name: "Drums", pressed: false })

    fireEvent.keyDown(drumsBadge, { key: "Tab" })
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Drums", pressed: false }), { key: "Enter" })
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Drums", pressed: true }), { key: " " })
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("saves added and removed roles, shows a success toast, and closes", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    // Ava starts with just Bass - remove it, add Drums.
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Roles updated.", { position: "top-center" })
    })
    expect(apiClient.POST).toHaveBeenCalledWith("/api/teams/{id}/members/{memberId}/roles", {
      params: { path: { id: "team-1", memberId: "tm-a" } },
      body: { role: "drums" },
    })
    expect(apiClient.DELETE).toHaveBeenCalledWith("/api/teams/{id}/members/{memberId}/roles/{role}", {
      params: { path: { id: "team-1", memberId: "tm-a", role: "bass" } },
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("saves without calling POST or DELETE when no roles changed", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
    expect(apiClient.POST).not.toHaveBeenCalled()
    expect(apiClient.DELETE).not.toHaveBeenCalled()
  })

  it("shows a toast error when assigning a role fails", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to assign a role.", {
        position: "top-center",
      })
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("shows a toast error when removing a role fails", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to remove a role.", {
        position: "top-center",
      })
    })
  })

  it("disables the buttons and shows a pending label while saving", async () => {
    let resolvePost!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePost = resolve
    })
    vi.mocked(apiClient.POST).mockReturnValue(pending as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePost({ data: {}, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("ignores an attempt to dismiss the dialog while a save is in flight", async () => {
    let resolvePost!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePost = resolve
    })
    vi.mocked(apiClient.POST).mockReturnValue(pending as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Saving..." })

    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    resolvePost({ data: {}, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("cancels without saving", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
    expect(apiClient.DELETE).not.toHaveBeenCalled()
  })
})
