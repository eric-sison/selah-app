import userEvent from "@testing-library/user-event"
import { toast } from "@workspace/ui/components/Sonner"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditMusicianInstrumentsDialog } from "@/components/musicians/EditMusicianInstrumentsDialog"
import { apiClient } from "@/lib/api-client"
import { createMockMusician } from "../../../test/fixtures"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render"
import type { Musician } from "@/components/musicians/MusicianList"

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

const AVA_MUSICIAN = createMockMusician({
  id: "musician-1",
  user: { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: "https://example.com/ava.jpg" },
  instruments: ["bass"],
})
const BEN_MUSICIAN = createMockMusician({
  id: "musician-2",
  user: { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null },
  instruments: [],
})

// EditMusicianInstrumentsDialog is controlled by its `open` prop, with a
// stable `musician` prop that's expected to change identity across
// open/close cycles as fresher data comes in (e.g. after the invalidated
// ["musicians"] query refetches) - this harness supplies the useState a
// real parent (MusicianList) would, including that re-fetch case, which
// drives the component's own render-time re-seeding logic.
function Harness({ initialMusician }: { initialMusician: Musician }) {
  const [open, setOpen] = useState(false)
  const [musician, setMusician] = useState(initialMusician)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open-dialog
      </button>
      <button type="button" onClick={() => setMusician((m) => ({ ...m, instruments: ["drums"] }))}>
        update-musician
      </button>
      <EditMusicianInstrumentsDialog musician={musician} open={open} onOpenChange={setOpen} />
    </>
  )
}

describe("EditMusicianInstrumentsDialog", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when closed", () => {
    render(<EditMusicianInstrumentsDialog musician={AVA_MUSICIAN} open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens with the musician's name, avatar, and current instruments", async () => {
    const user = userEvent.setup()
    render(<Harness initialMusician={AVA_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Ava Lim")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("re-seeds its instrument draft after being closed and reopened with updated instruments", async () => {
    const user = userEvent.setup()
    render(<Harness initialMusician={AVA_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    expect(screen.getByRole("button", { name: "Bass", pressed: true })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "update-musician" }))
    await user.click(screen.getByRole("button", { name: "open-dialog" }))

    expect(screen.getByRole("button", { name: "Bass", pressed: false })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()
  })

  it("toggles an instrument on and off by clicking its badge", async () => {
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Drums", pressed: true }))
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("toggles an instrument via the Enter and Space keys, and ignores other keys", async () => {
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    const drumsBadge = screen.getByRole("button", { name: "Drums", pressed: false })

    fireEvent.keyDown(drumsBadge, { key: "Tab" })
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Drums", pressed: false }), { key: "Enter" })
    expect(screen.getByRole("button", { name: "Drums", pressed: true })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("button", { name: "Drums", pressed: true }), { key: " " })
    expect(screen.getByRole("button", { name: "Drums", pressed: false })).toBeInTheDocument()
  })

  it("saves the full instrument set in one PATCH, shows a success toast, and closes", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    render(<Harness initialMusician={AVA_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    // Ava starts with just Bass - remove it, add Drums.
    await user.click(screen.getByRole("button", { name: "Bass", pressed: true }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Instruments updated.", {
        position: "top-center",
      })
    })
    expect(apiClient.PATCH).toHaveBeenCalledWith("/api/musicians/{id}", {
      params: { path: { id: "musician-1" } },
      body: { instruments: ["drums"] },
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("saves an unchanged (empty) instrument set the same way", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
    expect(apiClient.PATCH).toHaveBeenCalledWith("/api/musicians/{id}", {
      params: { path: { id: "musician-2" } },
      body: { instruments: [] },
    })
  })

  it("shows a toast error when saving fails", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update instruments.", {
        position: "top-center",
      })
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("disables the buttons and shows a pending label while saving", async () => {
    let resolvePatch!: (value: unknown) => void
    vi.mocked(apiClient.PATCH).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }) as never
    )
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePatch({ data: undefined, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("ignores an attempt to dismiss the dialog while a save is in flight", async () => {
    let resolvePatch!: (value: unknown) => void
    vi.mocked(apiClient.PATCH).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }) as never
    )
    const user = userEvent.setup()
    render(<Harness initialMusician={BEN_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Saving..." })

    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    resolvePatch({ data: undefined, error: undefined })
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })

  it("cancels without saving", async () => {
    const user = userEvent.setup()
    render(<Harness initialMusician={AVA_MUSICIAN} />)

    await user.click(screen.getByRole("button", { name: "open-dialog" }))
    await user.click(screen.getByRole("button", { name: "Drums", pressed: false }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(apiClient.PATCH).not.toHaveBeenCalled()
  })
})
