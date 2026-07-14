import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LinkedAccounts } from "@/components/LinkedAccounts"
import { authClient } from "@/lib/auth-client"
import { toast } from "@workspace/ui/components/Sonner"
import { renderWithProviders, screen, waitFor } from "../../test/render"

vi.mock("@/lib/auth-client", () => ({ authClient: { listAccounts: vi.fn(), linkSocial: vi.fn() } }))
vi.mock("@workspace/ui/components/Sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

describe("LinkedAccounts", () => {
  it("shows a loading state while accounts are being fetched", () => {
    vi.mocked(authClient.listAccounts).mockReturnValue(new Promise(() => {}) as never)

    renderWithProviders(<LinkedAccounts />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("shows the linked message when Facebook is already linked", async () => {
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: [{ providerId: "facebook", id: "acc-1" }],
      error: null,
    } as never)

    renderWithProviders(<LinkedAccounts />)

    expect(await screen.findByText("Your Facebook account is linked.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Link Facebook account" })).not.toBeInTheDocument()
  })

  it("shows the link button when Facebook is not linked", async () => {
    vi.mocked(authClient.listAccounts).mockResolvedValue({ data: [], error: null } as never)

    renderWithProviders(<LinkedAccounts />)

    expect(await screen.findByRole("button", { name: "Link Facebook account" })).toBeInTheDocument()
  })

  it("calls linkSocial with facebook provider and absolute /settings callback URLs on click", async () => {
    const user = userEvent.setup()
    vi.mocked(authClient.listAccounts).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(authClient.linkSocial).mockResolvedValue({ data: null, error: null } as never)

    renderWithProviders(<LinkedAccounts />)

    const button = await screen.findByRole("button", { name: "Link Facebook account" })
    await user.click(button)

    await waitFor(() => expect(authClient.linkSocial).toHaveBeenCalledTimes(1))
    expect(authClient.linkSocial).toHaveBeenCalledWith({
      provider: "facebook",
      callbackURL: `${window.location.origin}/settings`,
      errorCallbackURL: `${window.location.origin}/settings`,
    })
  })

  it("shows 'Redirecting...' while the link mutation is pending", async () => {
    const user = userEvent.setup()
    vi.mocked(authClient.listAccounts).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(authClient.linkSocial).mockReturnValue(new Promise(() => {}) as never)

    renderWithProviders(<LinkedAccounts />)

    const button = await screen.findByRole("button", { name: "Link Facebook account" })
    await user.click(button)

    expect(await screen.findByRole("button", { name: "Redirecting..." })).toBeDisabled()
  })

  it("renders the link button when listAccounts errors with a message (query throws)", async () => {
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: null,
      error: { message: "Could not load accounts." },
    } as never)

    renderWithProviders(<LinkedAccounts />)

    expect(await screen.findByRole("button", { name: "Link Facebook account" })).toBeInTheDocument()
  })

  it("falls back to a default message when listAccounts errors without a message", async () => {
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: null,
      error: {},
    } as never)

    renderWithProviders(<LinkedAccounts />)

    expect(await screen.findByRole("button", { name: "Link Facebook account" })).toBeInTheDocument()
  })

  it("shows an error toast when linkSocial resolves with an error", async () => {
    const user = userEvent.setup()
    vi.mocked(authClient.listAccounts).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(authClient.linkSocial).mockResolvedValue({
      data: null,
      error: { message: "Could not link account." },
    } as never)

    renderWithProviders(<LinkedAccounts />)

    const button = await screen.findByRole("button", { name: "Link Facebook account" })
    await user.click(button)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not link account.", { position: "top-center" })
    )
  })

  it("shows a fallback error toast when linkSocial resolves with an error that has no message", async () => {
    const user = userEvent.setup()
    vi.mocked(authClient.listAccounts).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(authClient.linkSocial).mockResolvedValue({ data: null, error: {} } as never)

    renderWithProviders(<LinkedAccounts />)

    const button = await screen.findByRole("button", { name: "Link Facebook account" })
    await user.click(button)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to link Facebook account.", { position: "top-center" })
    )
  })
})
