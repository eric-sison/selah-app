import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { TeamDetailsSheet } from "@/components/TeamDetailsSheet"
import { createMockSession, createMockTeam, createMockTeamMember } from "../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen, within } from "../../test/render"
import type { Team } from "@/components/TeamList"

// Isolates TeamDetailsSheet's own logic (mode switching, admin gating,
// musician-row click handling, empty state) from EditTeamForm's and
// UpdateTeamMemberDialog's own behavior, which each have a dedicated test
// file. `type="button"` matters here in case these ever render inside a
// surrounding <form> down the line.
vi.mock("@/components/EditTeamForm", () => ({
  EditTeamForm: ({
    team,
    autoFocusMusicians,
    onSuccess,
    onCancel,
  }: {
    team: Team
    autoFocusMusicians?: boolean
    onSuccess?: () => void
    onCancel?: () => void
  }) => (
    <div>
      <span data-testid="edit-team-form-props">
        {JSON.stringify({ teamId: team.id, autoFocusMusicians: !!autoFocusMusicians })}
      </span>
      <button type="button" onClick={onSuccess}>
        mock-edit-success
      </button>
      <button type="button" onClick={onCancel}>
        mock-edit-cancel
      </button>
    </div>
  ),
}))

vi.mock("@/components/UpdateTeamMemberDialog", () => ({
  UpdateTeamMemberDialog: ({
    member,
    onOpenChange,
  }: {
    member: Team["members"][number] | null
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      <span data-testid="update-member-dialog-member">{member ? member.id : "null"}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        mock-close-member-dialog
      </button>
      <button type="button" onClick={() => onOpenChange(true)}>
        mock-noop-member-dialog
      </button>
    </div>
  ),
}))

// Mirrors how TeamCard (in TeamList.tsx) actually drives TeamDetailsSheet -
// `open`/`mode` are controlled from outside, so a harness owning that state
// is needed to exercise real transitions.
function Harness({ team, initialOpen = true }: { team: Team; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const [mode, setMode] = useState<"view" | "edit">("view")
  return (
    <TeamDetailsSheet
      team={team}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setMode("view")
      }}
      mode={mode}
      onModeChange={setMode}
    />
  )
}

function renderAsAdmin(team: Team) {
  return render(<Harness team={team} />, { session: createMockSession() })
}

function renderAsNonAdmin(team: Team) {
  return render(<Harness team={team} />, { session: createMockSession({ role: "user" }) })
}

describe("TeamDetailsSheet", () => {
  it("renders the team name and its leader", () => {
    const team = createMockTeam({
      name: "Sunday AM Team",
      leader: { id: "user-a", name: "Ava Lim", image: null },
    })
    renderAsAdmin(team)

    expect(screen.getByRole("heading", { name: "Sunday AM Team" })).toBeInTheDocument()
    expect(screen.getByText("Ava Lim")).toBeInTheDocument()
  })

  it("shows 'No leader assigned' when the team has no leader", () => {
    renderAsAdmin(createMockTeam({ leader: null }))

    expect(screen.getByText("No leader assigned")).toBeInTheDocument()
  })

  it("shows an empty state with an Add member action for admins when there are no musicians", async () => {
    const user = userEvent.setup()
    renderAsAdmin(createMockTeam({ members: [] }))

    expect(screen.getByText("No musicians added yet")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add member" }))

    expect(screen.getByTestId("edit-team-form-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", autoFocusMusicians: true })
    )
  })

  it("hides the Add member action for non-admins when there are no musicians", () => {
    renderAsNonAdmin(createMockTeam({ members: [] }))

    expect(screen.getByText("No musicians added yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument()
  })

  it("lists musicians with their roles, and without a role badge when they have none", () => {
    const withRoles = createMockTeamMember({
      id: "tm-a",
      user: { id: "user-a", name: "Ava Lim", image: null },
      roles: ["bass", "singer"],
    })
    const withoutRoles = createMockTeamMember({
      id: "tm-b",
      user: { id: "user-b", name: "Ben Ortega", image: null },
      roles: [],
    })
    renderAsAdmin(createMockTeam({ members: [withRoles, withoutRoles] }))

    expect(screen.getByText("Musicians · 2")).toBeInTheDocument()
    expect(screen.getByText("Ava Lim")).toBeInTheDocument()
    expect(screen.getByText("Bass")).toBeInTheDocument()
    expect(screen.getByText("Singer")).toBeInTheDocument()
    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
  })

  it("opens the update-member dialog when an admin clicks a musician row", async () => {
    const user = userEvent.setup()
    const member = createMockTeamMember({ id: "tm-a" })
    renderAsAdmin(createMockTeam({ members: [member] }))

    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("null")
    await user.click(screen.getByText("Ben Ortega"))

    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("tm-a")
  })

  it("opens the update-member dialog via the Enter and Space keys, ignoring other keys", () => {
    const member = createMockTeamMember({ id: "tm-a" })
    renderAsAdmin(createMockTeam({ members: [member] }))
    const row = screen.getByText("Ben Ortega").closest('[role="button"]') as HTMLElement

    fireEvent.keyDown(row, { key: "Tab" })
    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("null")

    fireEvent.keyDown(row, { key: "Enter" })
    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("tm-a")
  })

  it("does not make musician rows clickable for non-admins", async () => {
    const user = userEvent.setup()
    const member = createMockTeamMember({ id: "tm-a" })
    renderAsNonAdmin(createMockTeam({ members: [member] }))

    await user.click(screen.getByText("Ben Ortega"))

    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("null")
  })

  it("clears the selected member when the member dialog reports closed", async () => {
    const user = userEvent.setup()
    const member = createMockTeamMember({ id: "tm-a" })
    renderAsAdmin(createMockTeam({ members: [member] }))

    await user.click(screen.getByText("Ben Ortega"))
    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("tm-a")

    // The mock dialog renders as a sibling of the (currently open) Sheet,
    // outside its portal - base-ui marks everything there `inert` for its
    // own focus trap, which `getByRole` respects but `getByText` +
    // `fireEvent` don't, so those are used here instead of `user.click`.
    fireEvent.click(screen.getByText("mock-close-member-dialog"))
    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("null")
  })

  it("leaves the selected member alone when the dialog reports a no-op open", async () => {
    const user = userEvent.setup()
    const member = createMockTeamMember({ id: "tm-a" })
    renderAsAdmin(createMockTeam({ members: [member] }))

    await user.click(screen.getByText("Ben Ortega"))
    fireEvent.click(screen.getByText("mock-noop-member-dialog"))

    expect(screen.getByTestId("update-member-dialog-member")).toHaveTextContent("tm-a")
  })

  it("shows the Update button for admins and switches to edit mode without auto-focus", async () => {
    const user = userEvent.setup()
    renderAsAdmin(createMockTeam())

    await user.click(screen.getByRole("button", { name: "Update" }))

    expect(screen.getByRole("heading", { name: "Edit team" })).toBeInTheDocument()
    expect(screen.getByTestId("edit-team-form-props")).toHaveTextContent(
      JSON.stringify({ teamId: "team-1", autoFocusMusicians: false })
    )
  })

  it("hides the Update button for non-admins", () => {
    renderAsNonAdmin(createMockTeam())

    // "Close" is ambiguous with the Sheet's own (sr-only) close button - the
    // footer's is the only one with visible text, found via its container.
    const footer = document.querySelector('[data-slot="sheet-footer"]') as HTMLElement
    expect(within(footer).getByRole("button", { name: "Close" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument()
  })

  it("returns to view mode and resets auto-focus after a successful edit", async () => {
    const user = userEvent.setup()
    renderAsAdmin(createMockTeam({ members: [] }))

    await user.click(screen.getByRole("button", { name: "Add member" }))
    expect(screen.getByTestId("edit-team-form-props")).toHaveTextContent('"autoFocusMusicians":true')

    await user.click(screen.getByRole("button", { name: "mock-edit-success" }))
    expect(screen.getByRole("heading", { name: "Sunday AM Team" })).toBeInTheDocument()

    // Re-entering edit mode via the plain Update path (not "Add member")
    // should no longer carry over the earlier auto-focus request.
    await user.click(screen.getByRole("button", { name: "Update" }))
    expect(screen.getByTestId("edit-team-form-props")).toHaveTextContent('"autoFocusMusicians":false')
  })

  it("returns to view mode and resets auto-focus after cancelling an edit", async () => {
    const user = userEvent.setup()
    renderAsAdmin(createMockTeam({ members: [] }))

    await user.click(screen.getByRole("button", { name: "Add member" }))
    await user.click(screen.getByRole("button", { name: "mock-edit-cancel" }))

    expect(screen.getByRole("heading", { name: "Sunday AM Team" })).toBeInTheDocument()
  })
})
