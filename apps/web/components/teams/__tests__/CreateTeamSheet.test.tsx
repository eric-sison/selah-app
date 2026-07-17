import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CreateTeamSheet } from "@/components/teams/CreateTeamSheet"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/components/teams/CreateTeamForm", () => ({
  CreateTeamForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>mock-create-team-form-success</button>
  ),
}))

describe("CreateTeamSheet", () => {
  it("renders nothing when there is no session", () => {
    const { container } = render(<CreateTeamSheet />, { session: null })

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for a non-admin session", () => {
    const { container } = render(<CreateTeamSheet />, {
      session: createMockSession({ role: "user" }),
    })

    expect(container).toBeEmptyDOMElement()
  })

  it("is closed by default for an admin session", () => {
    render(<CreateTeamSheet />, { session: createMockSession() })

    expect(screen.getByRole("button", { name: "Create a team" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the sheet when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateTeamSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Create a team" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Create a team" })).toBeInTheDocument()
  })

  it("closes the sheet when the create form succeeds", async () => {
    const user = userEvent.setup()
    render(<CreateTeamSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Create a team" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "mock-create-team-form-success" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
