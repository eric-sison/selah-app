import userEvent from "@testing-library/user-event"
import { Sheet } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CreateTeamForm } from "@/components/teams/CreateTeamForm"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders, screen, waitFor } from "../../../test/render"

// CreateTeamForm renders <SheetClose> (from its SheetFooter), which reads
// base-ui's dialog root context - it's only ever mounted inside a <Sheet>
// in the app (see CreateTeamSheet.tsx), so tests need the same wrapper.
function renderForm(props: Parameters<typeof CreateTeamForm>[0] = {}) {
  return renderWithProviders(
    <Sheet open>
      <CreateTeamForm {...props} />
    </Sheet>
  )
}

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

// Isolates CreateTeamForm's own logic (name validation, submit payload,
// mutation outcome) from TeamMembershipFields' own combobox/popover
// behavior, which has its own dedicated test file.
vi.mock("@/components/teams/TeamMembershipFields", () => ({
  TeamMembershipFields: ({
    onTeamLeaderIdChange,
    onMembersChange,
  }: {
    onTeamLeaderIdChange: (id: string | null) => void
    onMembersChange: (members: unknown[]) => void
  }) => (
    <div>
      {/* type="button" is essential here - these render inside
        CreateTeamForm's real <form>, so a plain button (default
        type="submit") would prematurely submit it on click. */}
      <button type="button" onClick={() => onTeamLeaderIdChange("user-1")}>
        mock-set-leader
      </button>
      <button
        type="button"
        onClick={() =>
          onMembersChange([
            { musicianId: "musician-2", user: { id: "user-2", name: "Ben Ortega", image: null }, instruments: ["bass"] },
          ])
        }
      >
        mock-add-member
      </button>
    </div>
  ),
}))

describe("CreateTeamForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("blocks submission and shows an inline error when name is empty", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Create team" }))

    expect(await screen.findByText("Name is required.")).toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("submits with just a name when no leader or musicians are chosen", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Name"), "Worship Team")
    await user.click(screen.getByRole("button", { name: "Create team" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/teams", {
        body: { name: "Worship Team", teamLeaderId: undefined, members: [] },
      })
    })
  })

  it("includes the selected leader and musicians in the submit payload", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Name"), "Worship Team")
    await user.click(screen.getByRole("button", { name: "mock-set-leader" }))
    await user.click(screen.getByRole("button", { name: "mock-add-member" }))
    await user.click(screen.getByRole("button", { name: "Create team" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/teams", {
        body: {
          name: "Worship Team",
          teamLeaderId: "user-1",
          members: [{ userId: "user-2" }],
        },
      })
    })
  })

  it("shows a success toast and calls onSuccess after a successful create", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSuccess })

    await user.type(screen.getByLabelText("Name"), "Worship Team")
    await user.click(screen.getByRole("button", { name: "Create team" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Team created.", { position: "top-center" })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("shows a toast error when apiClient.POST returns an error", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Name"), "Worship Team")
    await user.click(screen.getByRole("button", { name: "Create team" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to create team.", {
        position: "top-center",
      })
    })
  })
})
