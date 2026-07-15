import { usePathname, useRouter } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { authClient } from "@/lib/auth-client"
import { createMockSession } from "../../test/fixtures"
import { render, renderWithProviders, screen } from "../../test/render"

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
  },
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

describe("PageBreadcrumbNav", () => {
  it("renders breadcrumb items derived from the current pathname", () => {
    mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs")

    render(<PageBreadcrumbNav />)

    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/")
  })

  it("renders a nested path's segments", () => {
    mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs/song-1")

    render(<PageBreadcrumbNav />)

    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument()
  })

  it("shows the signed-in user's initial in the avatar fallback", () => {
    mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs")

    renderWithProviders(<PageBreadcrumbNav />, { session: createMockSession({ name: "Jane Doe" }) })

    expect(screen.getByRole("button", { name: "J" })).toBeInTheDocument()
  })

  it("renders an empty avatar fallback when there is no session", () => {
    mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs")

    render(<PageBreadcrumbNav />)

    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("opens the user menu and shows Profile, Settings, and Sign out", async () => {
    mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs")
    const user = userEvent.setup()

    render(<PageBreadcrumbNav />)
    await user.click(screen.getByRole("button"))

    expect(screen.getByRole("menuitem", { name: "Profile" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument()
  })

  it("signs out and redirects to the sign-in page on success", async () => {
    const push = mockPush()
    vi.mocked(usePathname).mockReturnValue("/songs")
    vi.mocked(authClient.signOut).mockImplementation(async ({ fetchOptions } = {}) => {
      fetchOptions?.onSuccess?.({} as never)
      return {} as never
    })
    const user = userEvent.setup()

    render(<PageBreadcrumbNav />)
    await user.click(screen.getByRole("button"))
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }))

    expect(authClient.signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/auth/sign-in")
  })
})
