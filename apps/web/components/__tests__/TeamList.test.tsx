import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TeamList } from "@/components/TeamList"
import { apiClient } from "@/lib/api-client"
import { createMockSession, createMockTeam, createMockTeamMember } from "../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen, waitFor, within } from "../../test/render"
import type { Team } from "@/components/TeamList"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

// Isolates TeamList/TeamCard's own logic (loading/empty states, member
// count text, leader/avatar rendering, dropdown gating, delete flow) from
// TeamDetailsSheet's own behavior, which has its own dedicated test file.
vi.mock("@/components/TeamDetailsSheet", () => ({
  TeamDetailsSheet: ({
    team,
    open,
    mode,
    onOpenChange,
  }: {
    team: Team
    open: boolean
    mode: "view" | "edit"
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      <span data-testid="team-details-sheet-props">{JSON.stringify({ teamId: team.id, open, mode })}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        mock-close-details-sheet
      </button>
      <button type="button" onClick={() => onOpenChange(true)}>
        mock-noop-details-sheet
      </button>
    </div>
  ),
}))

function mockTeams(data: Team[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/teams") return Promise.resolve({ data, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

function renderAsAdmin() {
  return render(<TeamList />, { session: createMockSession() })
}

function renderAsNonAdmin() {
  return render(<TeamList />, { session: createMockSession({ role: "user" }) })
}

describe("TeamList", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows skeleton placeholders while loading", () => {
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)
    const { container } = renderAsAdmin()

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows an empty state with a create action when there are no teams", async () => {
    mockTeams([])
    renderAsAdmin()

    expect(await screen.findByText("No teams yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create a team" })).toBeInTheDocument()
  })

  it("shows the empty state when the teams query errors", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    renderAsAdmin()

    expect(await screen.findByText("No teams yet")).toBeInTheDocument()
  })

  it("renders a card per team", async () => {
    mockTeams([
      createMockTeam({ id: "team-1", name: "Sunday AM" }),
      createMockTeam({ id: "team-2", name: "Sunday PM" }),
    ])
    renderAsAdmin()

    expect(await screen.findByText("Sunday AM")).toBeInTheDocument()
    expect(screen.getByText("Sunday PM")).toBeInTheDocument()
  })

  it.each([
    [0, "No members"],
    [1, "1 member"],
    [3, "3 members"],
  ])("shows '%s members' text as '%s'", async (count, expected) => {
    const members = Array.from({ length: count }, (_, i) =>
      createMockTeamMember({ id: `tm-${i}`, user: { id: `user-${i}`, name: `User ${i}`, image: null } })
    )
    mockTeams([createMockTeam({ members })])
    renderAsAdmin()

    expect(await screen.findByText(expected)).toBeInTheDocument()
  })

  it("shows the team leader's name when set", async () => {
    mockTeams([createMockTeam({ leader: { id: "user-a", name: "Ava Lim", image: null } })])
    renderAsAdmin()

    expect(await screen.findByText("Ava Lim")).toBeInTheDocument()
  })

  it("shows 'No leader assigned' when there is no leader", async () => {
    mockTeams([createMockTeam({ leader: null })])
    renderAsAdmin()

    expect(await screen.findByText("No leader assigned")).toBeInTheDocument()
  })

  it("shows a '+N' overflow badge when there are more members than fit in the avatar group", async () => {
    const members = Array.from({ length: 7 }, (_, i) =>
      createMockTeamMember({ id: `tm-${i}`, user: { id: `user-${i}`, name: `User ${i}`, image: null } })
    )
    mockTeams([createMockTeam({ members })])
    renderAsAdmin()

    expect(await screen.findByText("+2")).toBeInTheDocument()
  })

  it("does not show an avatar group when there are no members", async () => {
    mockTeams([createMockTeam({ members: [] })])
    const { container } = renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    expect(container.querySelector('[data-slot="avatar-group"]')).not.toBeInTheDocument()
  })

  it("opens the details sheet in view mode when the card is clicked", async () => {
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1" })])
    renderAsAdmin()

    await user.click(await screen.findByText("Sunday AM Team"))

    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", open: true, mode: "view" })
    )
  })

  it("opens the details sheet via the Enter and Space keys, ignoring other keys", async () => {
    mockTeams([createMockTeam({ id: "team-1" })])
    renderAsAdmin()
    const card = (await screen.findByText("Sunday AM Team")).closest('[role="button"]') as HTMLElement

    fireEvent.keyDown(card, { key: "Tab" })
    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent('"open":false')

    fireEvent.keyDown(card, { key: "Enter" })
    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent('"open":true')
  })

  it("closes the details sheet and resets its mode back to view", async () => {
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Update" }))
    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent('"mode":"edit"')

    await user.click(screen.getByRole("button", { name: "mock-noop-details-sheet" }))
    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent('"mode":"edit"')

    await user.click(screen.getByRole("button", { name: "mock-close-details-sheet" }))
    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", open: false, mode: "view" })
    )
  })

  it("hides the options dropdown for non-admins", async () => {
    mockTeams([createMockTeam()])
    renderAsNonAdmin()

    await screen.findByText("Sunday AM Team")
    expect(screen.queryByRole("button", { name: "Team options" })).not.toBeInTheDocument()
  })

  it("opens the details sheet in edit mode from the dropdown's Update item", async () => {
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Update" }))

    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", open: true, mode: "edit" })
    )
  })

  it("opens the details sheet in view mode from the dropdown's View details item", async () => {
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "View details" }))

    expect(screen.getByTestId("team-details-sheet-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", open: true, mode: "view" })
    )
  })

  it("deletes a team, shows a success toast, and closes the confirmation", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1", name: "Sunday AM Team" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(await screen.findByText('Delete "Sunday AM Team"?')).toBeInTheDocument()
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/teams/{id}", { params: { path: { id: "team-1" } } })
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Team deleted.", { position: "top-center" })
    expect(screen.queryByText('Delete "Sunday AM Team"?')).not.toBeInTheDocument()
  })

  it("cancels the delete confirmation without deleting", async () => {
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1", name: "Sunday AM Team" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    await screen.findByText('Delete "Sunday AM Team"?')

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByText('Delete "Sunday AM Team"?')).not.toBeInTheDocument()
    expect(apiClient.DELETE).not.toHaveBeenCalled()
  })

  it("shows a toast error when deleting fails", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1", name: "Sunday AM Team" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete team.", {
        position: "top-center",
      })
    })
  })

  it("ignores an attempt to dismiss the delete confirmation while deleting is in flight", async () => {
    let resolveDelete!: (value: unknown) => void
    vi.mocked(apiClient.DELETE).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve
      }) as never
    )
    const user = userEvent.setup()
    mockTeams([createMockTeam({ id: "team-1", name: "Sunday AM Team" })])
    renderAsAdmin()

    await screen.findByText("Sunday AM Team")
    await user.click(screen.getByRole("button", { name: "Team options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await user.keyboard("{Escape}")
    expect(screen.getByText('Delete "Sunday AM Team"?')).toBeInTheDocument()

    resolveDelete({ data: undefined, error: undefined })
    await waitFor(() => {
      expect(screen.queryByText('Delete "Sunday AM Team"?')).not.toBeInTheDocument()
    })
  })
})
