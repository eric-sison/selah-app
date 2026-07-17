import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UpdateTeamMemberDialog } from "@/components/teams/UpdateTeamMemberDialog"
import { apiClient } from "@/lib/api-client"
import { createMockTeamMember } from "../../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render"
import type { Team } from "@/components/teams/TeamList"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const MEMBER_A = createMockTeamMember({
  id: "tm-a",
  user: { id: "user-a", name: "Ava Lim", image: "https://example.com/ava.jpg" },
  musicianId: "musician-a",
  instruments: ["bass"],
})
const MEMBER_B = createMockTeamMember({
  id: "tm-b",
  user: { id: "user-b", name: "Ben Ortega", image: null },
  musicianId: "musician-b",
  instruments: [],
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

  it("opens with the selected member's name, avatar, and current instruments", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Ava Lim")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("re-seeds its instrument draft when a different member is opened", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()

    // Close (Cancel), then open Ben - who holds no instruments - to confirm
    // the draft reflects his instruments, not Ava's leftover selection.
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "select-ben" }))

    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
  })

  it("toggles an instrument on and off by clicking its badge", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Drums", pressed: true }))
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("toggles an instrument via the Enter and Space keys, and ignores other keys", async () => {
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

  it("saves the full instrument set in one PATCH, shows a success toast, and closes", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ava" }))
    // Ava starts with just Bass - remove it, add Drums.
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Instruments updated.", {
        position: "top-center",
      })
    })
    expect(apiClient.PATCH).toHaveBeenCalledWith("/api/musicians/{id}", {
      params: { path: { id: "musician-a" } },
      body: { instruments: ["drums"] },
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("saves an unchanged instrument set the same way", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
    expect(apiClient.PATCH).toHaveBeenCalledWith("/api/musicians/{id}", {
      params: { path: { id: "musician-b" } },
      body: { instruments: [] },
    })
  })

  it("shows a toast error when saving fails", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update instruments.", {
        position: "top-center",
      })
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("disables the buttons and shows a pending label while saving", async () => {
    let resolvePatch!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePatch = resolve
    })
    vi.mocked(apiClient.PATCH).mockReturnValue(pending as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePatch({ data: {}, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("ignores an attempt to dismiss the dialog while a save is in flight", async () => {
    let resolvePatch!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePatch = resolve
    })
    vi.mocked(apiClient.PATCH).mockReturnValue(pending as never)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "select-ben" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Saving..." })

    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    resolvePatch({ data: {}, error: undefined })
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
    expect(apiClient.PATCH).not.toHaveBeenCalled()
  })
})
