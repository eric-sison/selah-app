import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MusicianList } from "@/components/musicians/MusicianList"
import { apiClient } from "@/lib/api-client"
import { createMockMusician, createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen, waitFor, within } from "../../../test/render"
import type { Musician } from "@/components/musicians/MusicianList"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

// Isolates MusicianList/MusicianCard's own logic (loading/empty states,
// instrument badges, dropdown gating, delete flow) from
// EditMusicianInstrumentsDialog's own behavior, which has its own dedicated
// test file.
vi.mock("@/components/musicians/EditMusicianInstrumentsDialog", () => ({
  EditMusicianInstrumentsDialog: ({
    musician,
    open,
    onOpenChange,
  }: {
    musician: Musician
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      <span data-testid="edit-dialog-props">{JSON.stringify({ musicianId: musician.id, open })}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        mock-close-edit-dialog
      </button>
    </div>
  ),
}))

function mockMusicians(data: Musician[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/musicians") return Promise.resolve({ data, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

function renderAsAdmin() {
  return render(<MusicianList />, { session: createMockSession() })
}

function renderAsNonAdmin() {
  return render(<MusicianList />, { session: createMockSession({ role: "user" }) })
}

describe("MusicianList", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows skeleton placeholders while loading", () => {
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)
    const { container } = renderAsAdmin()

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows an empty state with a create action when there are no musicians", async () => {
    mockMusicians([])
    renderAsAdmin()

    expect(await screen.findByText("No musicians yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add musician" })).toBeInTheDocument()
  })

  it("shows the empty state when the musicians query errors", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    renderAsAdmin()

    expect(await screen.findByText("No musicians yet")).toBeInTheDocument()
  })

  it("renders a card per musician", async () => {
    mockMusicians([
      createMockMusician({
        id: "musician-1",
        user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      }),
      createMockMusician({
        id: "musician-2",
        user: { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null },
      }),
    ])
    renderAsAdmin()

    expect(await screen.findByText("Ava Lim")).toBeInTheDocument()
    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
  })

  it("shows the musician's email", async () => {
    mockMusicians([
      createMockMusician({ user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null } }),
    ])
    renderAsAdmin()

    expect(await screen.findByText("ava@example.com")).toBeInTheDocument()
  })

  it("shows instrument badges when the musician has instruments", async () => {
    mockMusicians([createMockMusician({ instruments: ["bass", "drums"] })])
    renderAsAdmin()

    expect(await screen.findByText("Bass")).toBeInTheDocument()
    expect(screen.getByText("Drums")).toBeInTheDocument()
  })

  it("shows 'No instruments yet' when the musician has none", async () => {
    mockMusicians([createMockMusician({ instruments: [] })])
    renderAsAdmin()

    expect(await screen.findByText("No instruments yet")).toBeInTheDocument()
  })

  it("hides the options dropdown for non-admins", async () => {
    mockMusicians([createMockMusician()])
    renderAsNonAdmin()

    await screen.findByText("Ben Ortega")
    expect(screen.queryByRole("button", { name: "Musician options" })).not.toBeInTheDocument()
  })

  it("opens the edit instruments dialog from the dropdown", async () => {
    const user = userEvent.setup()
    mockMusicians([createMockMusician({ id: "musician-1" })])
    renderAsAdmin()

    await screen.findByText("Ben Ortega")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Edit instruments" }))

    expect(screen.getByTestId("edit-dialog-props")).toHaveTextContent(
      JSON.stringify({ musicianId: "musician-1", open: true })
    )
  })

  it("closes the edit instruments dialog via its own onOpenChange", async () => {
    const user = userEvent.setup()
    mockMusicians([createMockMusician({ id: "musician-1" })])
    renderAsAdmin()

    await screen.findByText("Ben Ortega")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Edit instruments" }))
    await user.click(screen.getByRole("button", { name: "mock-close-edit-dialog" }))

    expect(screen.getByTestId("edit-dialog-props")).toHaveTextContent(
      JSON.stringify({ musicianId: "musician-1", open: false })
    )
  })

  it("deletes a musician, shows a success toast, and closes the confirmation", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    mockMusicians([
      createMockMusician({
        id: "musician-1",
        user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      }),
    ])
    renderAsAdmin()

    await screen.findByText("Ava Lim")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(await screen.findByText('Delete "Ava Lim"\'s musician profile?')).toBeInTheDocument()
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/musicians/{id}", {
        params: { path: { id: "musician-1" } },
      })
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Musician profile deleted.", {
      position: "top-center",
    })
    expect(screen.queryByText('Delete "Ava Lim"\'s musician profile?')).not.toBeInTheDocument()
  })

  it("cancels the delete confirmation without deleting", async () => {
    const user = userEvent.setup()
    mockMusicians([
      createMockMusician({
        id: "musician-1",
        user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      }),
    ])
    renderAsAdmin()

    await screen.findByText("Ava Lim")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    await screen.findByText('Delete "Ava Lim"\'s musician profile?')

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByText('Delete "Ava Lim"\'s musician profile?')).not.toBeInTheDocument()
    expect(apiClient.DELETE).not.toHaveBeenCalled()
  })

  it("shows the API's own error message when deleting fails", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { message: "Still on a team." },
    } as never)
    const user = userEvent.setup()
    mockMusicians([
      createMockMusician({
        id: "musician-1",
        user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      }),
    ])
    renderAsAdmin()

    await screen.findByText("Ava Lim")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Still on a team.", { position: "top-center" })
    })
  })

  it("falls back to a generic error message when the delete error has no message", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: undefined, error: {} } as never)
    const user = userEvent.setup()
    mockMusicians([createMockMusician({ id: "musician-1" })])
    renderAsAdmin()

    await screen.findByText("Ben Ortega")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete musician profile.", {
        position: "top-center",
      })
    })
  })

  it("ignores an attempt to dismiss the delete confirmation while deleting is in flight", async () => {
    let resolveDelete!: (value: unknown) => void
    vi.mocked(apiClient.DELETE).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve
      }) as never
    )
    const user = userEvent.setup()
    mockMusicians([
      createMockMusician({
        id: "musician-1",
        user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      }),
    ])
    renderAsAdmin()

    await screen.findByText("Ava Lim")
    await user.click(screen.getByRole("button", { name: "Musician options" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await user.keyboard("{Escape}")
    expect(screen.getByText('Delete "Ava Lim"\'s musician profile?')).toBeInTheDocument()

    resolveDelete({ data: undefined, error: undefined })
    await waitFor(() => {
      expect(screen.queryByText('Delete "Ava Lim"\'s musician profile?')).not.toBeInTheDocument()
    })
  })
})
