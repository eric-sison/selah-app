import { useRouter } from "next/navigation"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { SignInForm } from "@/components/SignInForm"
import { authClient } from "@/lib/auth-client"
import { renderWithProviders, screen, waitFor } from "../../test/render"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}))

function mockPush() {
  const push = vi.fn()
  vi.mocked(useRouter).mockReturnValue({
    push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>)
  return push
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText("Email Address"), email)
  await user.type(screen.getByLabelText("Password"), password)
  await user.click(screen.getByRole("button", { name: /sign in/i }))
}

describe("SignInForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows validation errors for an invalid email and short password without calling the mutation", async () => {
    mockPush()
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await fillAndSubmit(user, "not-an-email", "short")

    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument()
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument()
    expect(authClient.signIn.email).not.toHaveBeenCalled()
  })

  it("signs in successfully and redirects to the callback URL", async () => {
    const push = mockPush()
    vi.mocked(authClient.signIn.email).mockImplementation(async ({ fetchOptions }) => {
      fetchOptions?.onSuccess?.({} as never)
      return {} as never
    })
    const user = userEvent.setup()
    renderWithProviders(<SignInForm callbackURL="/dashboard" />)

    await fillAndSubmit(user, "jane@example.com", "password123")

    expect(authClient.signIn.email).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@example.com", password: "password123" })
    )
    expect(push).toHaveBeenCalledWith("/dashboard")
  })

  it.each([
    [401, "The email or password you entered is incorrect."],
    [403, "Verify your email address to continue."],
    [404, "We couldn’t find what you’re looking for."],
    [429, "Too many requests. Please try again shortly."],
    [500, "Something went wrong. Please try again."],
    [418, "Something went wrong. Please try again."],
  ])("shows a toast for a %s error response", async (status, message) => {
    mockPush()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(authClient.signIn.email).mockImplementation(async ({ fetchOptions }) => {
      fetchOptions?.onError?.({ error: { status } } as never)
      return {} as never
    })
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await fillAndSubmit(user, "jane@example.com", "password123")

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(message, { position: "top-center" })
  })

  it("shows no oauth error alert when no error prop is given", () => {
    mockPush()
    renderWithProviders(<SignInForm />)

    expect(screen.queryByText("No account found")).not.toBeInTheDocument()
  })

  it("shows the known oauth error message for signup_disabled", () => {
    mockPush()
    renderWithProviders(<SignInForm error="signup_disabled" />)

    expect(screen.getByText("No account found")).toBeInTheDocument()
    expect(screen.getByText("Contact your admin to get an invitation link.")).toBeInTheDocument()
  })

  it("shows a fallback oauth error message for an unknown error code", () => {
    mockPush()
    renderWithProviders(<SignInForm error="some_unknown_code" />)

    expect(screen.getByText("Something went wrong signing you in.")).toBeInTheDocument()
  })

  it("calls authClient.signIn.social with facebook provider and absolute callback URLs", async () => {
    mockPush()
    vi.mocked(authClient.signIn.social).mockResolvedValue({ data: {}, error: null } as never)
    const user = userEvent.setup()
    renderWithProviders(<SignInForm callbackURL="/dashboard" />)

    await user.click(screen.getByRole("button", { name: /continue with facebook/i }))

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "facebook",
      callbackURL: new URL("/dashboard", window.location.origin).toString(),
      errorCallbackURL: new URL("/auth/sign-in", window.location.origin).toString(),
    })
  })

  it("shows a toast when facebook sign-in returns an error", async () => {
    mockPush()
    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: "oops" },
    } as never)
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await user.click(screen.getByRole("button", { name: /continue with facebook/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to sign in with Facebook.")
    })
  })

  it("shows an inline field error when the facebook sign-in mutation itself rejects", async () => {
    mockPush()
    vi.mocked(authClient.signIn.social).mockRejectedValue(new Error("network down"))
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await user.click(screen.getByRole("button", { name: /continue with facebook/i }))

    expect(await screen.findByText("network down")).toBeInTheDocument()
  })

  it("shows an inline field error when the email sign-in mutation itself rejects", async () => {
    mockPush()
    vi.mocked(authClient.signIn.email).mockRejectedValue(new Error("connection lost"))
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await fillAndSubmit(user, "jane@example.com", "password123")

    expect(await screen.findByText("connection lost")).toBeInTheDocument()
  })

  it("shows the pending label while the sign-in request is in flight", async () => {
    mockPush()
    let resolveSignIn: (() => void) | undefined
    vi.mocked(authClient.signIn.email).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = () => resolve({} as never)
        })
    )
    const user = userEvent.setup()
    renderWithProviders(<SignInForm />)

    await fillAndSubmit(user, "jane@example.com", "password123")

    expect(await screen.findByRole("button", { name: /signing in\.\.\./i })).toBeInTheDocument()

    resolveSignIn?.()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /signing in\.\.\./i })).not.toBeInTheDocument()
    })
  })
})
