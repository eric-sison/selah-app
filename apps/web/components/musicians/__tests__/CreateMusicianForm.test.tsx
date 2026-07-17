import userEvent from "@testing-library/user-event"
import { Sheet } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CreateMusicianForm } from "@/components/musicians/CreateMusicianForm"
import { apiClient } from "@/lib/api-client"
import { createMockMusician, createMockUser } from "../../../test/fixtures"
import { fireEvent, renderWithProviders, screen, waitFor } from "../../../test/render"
import type { Musician } from "@/components/musicians/MusicianList"

// CreateMusicianForm renders <SheetClose> (from its SheetFooter), which reads
// base-ui's dialog root context - it's only ever mounted inside a <Sheet> in
// the app (see CreateMusicianSheet.tsx), so tests need the same wrapper.
function renderForm(props: Parameters<typeof CreateMusicianForm>[0] = {}) {
  return renderWithProviders(
    <Sheet open>
      <CreateMusicianForm {...props} />
    </Sheet>
  )
}

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const AVA = createMockUser({ id: "user-1", name: "Ava Lim", email: "ava@example.com" })
const BEN = createMockUser({ id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null })

function mockData(users: ReturnType<typeof createMockUser>[] = [AVA, BEN], musicians: Musician[] = []) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/users") return Promise.resolve({ data: users, error: undefined }) as never
    if (path === "/api/musicians") return Promise.resolve({ data: musicians, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("CreateMusicianForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("blocks submission and shows an inline error when no user is selected", async () => {
    mockData()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Create musician" }))

    expect(await screen.findByText("Choose a user.")).toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("excludes users who already have a musician profile from the combobox", async () => {
    mockData([AVA, BEN], [createMockMusician({ user: AVA })])
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)

    expect(await screen.findByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.queryByText("ava@example.com")).not.toBeInTheDocument()
  })

  it("shows 'No users found.' when there are no available users", async () => {
    mockData([], [])
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)

    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("shows 'No users found.' when the users query errors", async () => {
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      if (path === "/api/musicians") return Promise.resolve({ data: [], error: undefined }) as never
      throw new Error(`Unexpected path: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)

    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("treats an errored musicians query as no existing musicians", async () => {
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/users") return Promise.resolve({ data: [AVA], error: undefined }) as never
      if (path === "/api/musicians") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)

    expect(await screen.findByText("Ava Lim")).toBeInTheDocument()
  })

  it("disables the combobox input while users or musicians are loading", () => {
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)
    renderForm()

    expect(screen.getByPlaceholderText("Search users...")).toBeDisabled()
  })

  it("submits the selected user with no instruments by default", async () => {
    mockData()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    await user.click(screen.getByRole("button", { name: "Create musician" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/musicians", {
        body: { userId: "user-1", instruments: [] },
      })
    })
  })

  it("submits with the selected instruments", async () => {
    mockData()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Create musician" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/musicians", {
        body: { userId: "user-1", instruments: ["bass"] },
      })
    })
  })

  it("toggles an instrument on and off by clicking its badge", async () => {
    mockData()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Bass", pressed: false }))
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))
    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
  })

  it("toggles an instrument via the Enter and Space keys, and ignores other keys", async () => {
    mockData()
    renderForm()

    const bassBadge = screen.getByRole("button", { name: "Bass", pressed: false })
    fireEvent.keyDown(bassBadge, { key: "Tab" })
    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: false }), { key: "Enter" })
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Bass", pressed: true }), { key: " " })
    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
  })

  it("shows a success toast, resets the form, and calls onSuccess after a successful create", async () => {
    mockData()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSuccess })

    const input = screen.getByPlaceholderText("Search users...") as HTMLInputElement
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    await user.click(screen.getByRole("button", { name: "Create musician" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Musician profile created.", {
        position: "top-center",
      })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(input.value).toBe("")
  })

  it("shows a toast error when apiClient.POST returns an error", async () => {
    mockData()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    await user.click(screen.getByRole("button", { name: "Create musician" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to create musician profile.", {
        position: "top-center",
      })
    })
  })

  it("clears a selected user, requiring one again to submit", async () => {
    mockData()
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...") as HTMLInputElement
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    expect(input.value).toBe("Ava Lim")

    const clearButton = document.querySelector('[data-slot="combobox-clear"]') as HTMLButtonElement
    await user.click(clearButton)

    expect(input.value).toBe("")
    await user.click(screen.getByRole("button", { name: "Create musician" }))
    expect(await screen.findByText("Choose a user.")).toBeInTheDocument()
  })

  it("disables the cancel and submit buttons and shows a pending label while creating", async () => {
    mockData()
    let resolvePost!: (value: unknown) => void
    vi.mocked(apiClient.POST).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }) as never
    )
    const user = userEvent.setup()
    renderForm()

    const input = screen.getByPlaceholderText("Search users...")
    await user.click(input)
    await user.click(await screen.findByText("Ava Lim"))
    await user.click(screen.getByRole("button", { name: "Create musician" }))

    expect(await screen.findByRole("button", { name: "Creating..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePost({ data: {}, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })
})
