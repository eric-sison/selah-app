import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { InviteForm } from "@/components/auth/InviteForm"
import { renderWithProviders, screen, waitFor } from "../../../test/render"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe("InviteForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("blocks submission with an invalid email and does not call fetch", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const user = userEvent.setup()
    renderWithProviders(<InviteForm />)

    await user.type(screen.getByLabelText("Email Address"), "not-an-email")
    await user.click(screen.getByRole("button", { name: /send invite/i }))

    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("submits a valid email, posts JSON, shows a success toast, and resets the form", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ email: "newhire@example.com" }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderWithProviders(<InviteForm />)

    const input = screen.getByLabelText("Email Address") as HTMLInputElement
    await user.type(input, "newhire@example.com")
    await user.click(screen.getByRole("button", { name: /send invite/i }))

    expect(fetchMock).toHaveBeenCalledWith("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "newhire@example.com" }),
    })

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Invitation sent to newhire@example.com.", {
        position: "top-center",
      })
    })
    expect(input.value).toBe("")
  })

  it("shows the server-provided message when the request fails with a parseable error body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Already invited." }, false, 409))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderWithProviders(<InviteForm />)

    await user.type(screen.getByLabelText("Email Address"), "newhire@example.com")
    await user.click(screen.getByRole("button", { name: /send invite/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Already invited.", { position: "top-center" })
    })
  })

  it("falls back to a generic message when the error response body isn't parseable JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderWithProviders(<InviteForm />)

    await user.type(screen.getByLabelText("Email Address"), "newhire@example.com")
    await user.click(screen.getByRole("button", { name: /send invite/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to send invitation.", {
        position: "top-center",
      })
    })
  })

  it("shows the pending label while the invite request is in flight", async () => {
    let resolveFetch: (() => void) | undefined
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(jsonResponse({ email: "newhire@example.com" }))
        })
    )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderWithProviders(<InviteForm />)

    await user.type(screen.getByLabelText("Email Address"), "newhire@example.com")
    await user.click(screen.getByRole("button", { name: /send invite/i }))

    expect(await screen.findByRole("button", { name: /sending\.\.\./i })).toBeInTheDocument()

    resolveFetch?.()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /sending\.\.\./i })).not.toBeInTheDocument()
    })
  })
})
