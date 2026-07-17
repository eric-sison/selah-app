import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CreateMusicianSheet } from "@/components/musicians/CreateMusicianSheet"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen } from "../../../test/render"

vi.mock("@/components/musicians/CreateMusicianForm", () => ({
  CreateMusicianForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>mock-create-musician-form-success</button>
  ),
}))

describe("CreateMusicianSheet", () => {
  it("renders nothing when there is no session", () => {
    const { container } = render(<CreateMusicianSheet />, { session: null })

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for a non-admin session", () => {
    const { container } = render(<CreateMusicianSheet />, {
      session: createMockSession({ role: "user" }),
    })

    expect(container).toBeEmptyDOMElement()
  })

  it("is closed by default for an admin session", () => {
    render(<CreateMusicianSheet />, { session: createMockSession() })

    expect(screen.getByRole("button", { name: "Add musician" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the sheet when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateMusicianSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Add musician" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Add a musician" })).toBeInTheDocument()
  })

  it("closes the sheet when the create form succeeds", async () => {
    const user = userEvent.setup()
    render(<CreateMusicianSheet />, { session: createMockSession() })

    await user.click(screen.getByRole("button", { name: "Add musician" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "mock-create-musician-form-success" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
