import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { SignUpForm } from "@/components/SignUpForm"
import { authClient } from "@/lib/auth-client"
import { renderWithProviders, screen, waitFor } from "../../test/render"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: vi.fn(),
    },
  },
}))

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  password: string,
  confirmPassword: string
) {
  await user.type(screen.getByLabelText("Name"), name)
  await user.type(screen.getByLabelText("Password"), password)
  await user.type(screen.getByLabelText("Confirm Password"), confirmPassword)
  await user.click(screen.getByRole("button", { name: /create account/i }))
}

describe("SignUpForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("pre-fills the disabled, read-only email field from the email prop", () => {
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    const emailInput = screen.getByLabelText("Email Address") as HTMLInputElement
    expect(emailInput).toBeDisabled()
    expect(emailInput).toHaveAttribute("readonly")
    expect(emailInput.value).toBe("invited@example.com")
  })

  it("shows validation errors for empty name and short password without calling the mutation", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    await user.type(screen.getByLabelText("Password"), "short")
    await user.type(screen.getByLabelText("Confirm Password"), "short")
    await user.click(screen.getByRole("button", { name: /create account/i }))

    expect(await screen.findByText("Please enter your name.")).toBeInTheDocument()
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument()
    expect(authClient.signUp.email).not.toHaveBeenCalled()
  })

  it("shows a refinement error when password and confirmPassword do not match", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    await fillAndSubmit(user, "Jane Doe", "password123", "different123")

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument()
    expect(authClient.signUp.email).not.toHaveBeenCalled()
  })

  it("signs up successfully and shows the check-your-email confirmation", async () => {
    vi.mocked(authClient.signUp.email).mockImplementation(async ({ fetchOptions }) => {
      fetchOptions?.onSuccess?.({} as never)
      return {} as never
    })
    const user = userEvent.setup()
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    await fillAndSubmit(user, "Jane Doe", "password123", "password123")

    expect(await screen.findByText("Check your email")).toBeInTheDocument()
    expect(
      screen.getByText(
        "We sent a verification link to invited@example.com. Verify your address to finish setting up your account."
      )
    ).toBeInTheDocument()
    expect(authClient.signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invited@example.com",
        name: "Jane Doe",
        password: "password123",
        callbackURL: new URL("/auth/sign-in", window.location.origin).toString(),
        fetchOptions: expect.objectContaining({ query: { token: "tok-1" } }),
      })
    )
  })

  it.each([
    [400, "This invitation is invalid or has expired."],
    [403, "This invitation is invalid or has expired."],
    [409, "This action couldn’t be completed due to a conflict."],
    [422, "Some information provided is invalid. Please review and try again."],
    [429, "Too many requests. Please try again shortly."],
    [500, "Something went wrong. Please try again."],
    [418, "Something went wrong. Please try again."],
  ])("shows a toast for a %s error response", async (status, message) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(authClient.signUp.email).mockImplementation(async ({ fetchOptions }) => {
      fetchOptions?.onError?.({ error: { status } } as never)
      return {} as never
    })
    const user = userEvent.setup()
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    await fillAndSubmit(user, "Jane Doe", "password123", "password123")

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(message, { position: "top-center" })
  })

  it("shows the pending label while the sign-up request is in flight", async () => {
    let resolveSignUp: (() => void) | undefined
    vi.mocked(authClient.signUp.email).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignUp = () => resolve({} as never)
        })
    )
    const user = userEvent.setup()
    renderWithProviders(<SignUpForm email="invited@example.com" token="tok-1" />)

    await fillAndSubmit(user, "Jane Doe", "password123", "password123")

    expect(await screen.findByRole("button", { name: /creating account\.\.\./i })).toBeInTheDocument()

    resolveSignUp?.()
    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument()
    })
  })
})
