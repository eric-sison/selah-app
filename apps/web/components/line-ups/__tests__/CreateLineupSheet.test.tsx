import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CreateLineupSheet } from "@/components/line-ups/CreateLineupSheet"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/components/line-ups/CreateLineupForm", () => ({
  CreateLineupForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>mock-create-lineup-form-success</button>
  ),
}))

describe("CreateLineupSheet", () => {
  it("renders nothing when there is no session", () => {
    const { container } = render(<CreateLineupSheet />, { session: null })

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for a non-admin session", () => {
    const { container } = render(<CreateLineupSheet />, {
      session: createMockSession({ role: "user" }),
    })

    expect(container).toBeEmptyDOMElement()
  })

  it("is closed by default for an admin session", () => {
    render(<CreateLineupSheet />, { session: createMockSession() })

    expect(screen.getByRole("button", { name: "Add a line up" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the sheet when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateLineupSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Add a line up" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Create a line up" })).toBeInTheDocument()
  })

  it("closes the sheet when the create form succeeds", async () => {
    const user = userEvent.setup()
    render(<CreateLineupSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Add a line up" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "mock-create-lineup-form-success" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
