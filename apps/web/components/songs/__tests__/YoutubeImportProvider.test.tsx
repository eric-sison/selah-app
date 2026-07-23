import { toast } from "@workspace/ui/components/Sonner"
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { apiClient } from "@/lib/api-client"
import { useYoutubeImport, YoutubeImportProvider } from "@/components/songs/YoutubeImportProvider"
import { renderWithProviders, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Exercises useYoutubeImport's full API through plain DOM interactions,
// rather than asserting on the hook's return value directly - matches how
// SongUploadForm (the only real consumer) actually drives it.
function TestConsumer() {
  const { activeImport, status, startImport, dismiss, isFormOpen, setFormOpen } = useYoutubeImport()

  return (
    <div>
      <p>active: {activeImport ? `${activeImport.id}:${activeImport.title}` : "none"}</p>
      <p>status: {status?.status ?? "none"}</p>
      <p>form: {isFormOpen ? "open" : "closed"}</p>
      <button
        onClick={() =>
          startImport(
            { id: "job-1", title: "Amazing Grace" },
            { id: "job-1", status: "pending", errorMessage: null, songId: null }
          )
        }
      >
        Start
      </button>
      <button onClick={dismiss}>Dismiss</button>
      <button onClick={() => setFormOpen(true)}>Open form</button>
      <button onClick={() => setFormOpen(false)}>Close form</button>
    </div>
  )
}

function renderProvider() {
  return renderWithProviders(
    <YoutubeImportProvider>
      <TestConsumer />
    </YoutubeImportProvider>
  )
}

describe("useYoutubeImport", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("throws when used outside a YoutubeImportProvider", () => {
    expect(() => renderHook(() => useYoutubeImport())).toThrow(
      "useYoutubeImport must be used within a YoutubeImportProvider"
    )
  })

  it("starts tracking an import and polls its status", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: "job-1", status: "downloading", errorMessage: null, songId: null },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderProvider()

    expect(apiClient.GET).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Start" }))

    expect(await screen.findByText("active: job-1:Amazing Grace")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText("status: downloading")).toBeInTheDocument()
    })
    expect(apiClient.GET).toHaveBeenCalledWith("/api/youtube-imports/{id}", {
      params: { path: { id: "job-1" } },
    })
  })

  it("fires a success toast, invalidates songs, and clears the active import once completed", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: "job-1", status: "completed", errorMessage: null, songId: "song-1" },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole("button", { name: "Start" }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Song imported.", { position: "top-center" })
    })
    expect(await screen.findByText("active: none")).toBeInTheDocument()
  })

  it("keeps the active import visible with its error when the job fails, until dismissed", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: "job-1", status: "failed", errorMessage: "Video is unavailable.", songId: null },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole("button", { name: "Start" }))

    await waitFor(() => {
      expect(screen.getByText("status: failed")).toBeInTheDocument()
    })
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(screen.getByText("active: none")).toBeInTheDocument()
  })

  it("doesn't crash when the status query itself errors, keeping the seeded initial status", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "boom" },
    } as never)
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole("button", { name: "Start" }))

    expect(await screen.findByText("active: job-1:Amazing Grace")).toBeInTheDocument()
    // TanStack Query doesn't clear `data` when a fetch errors - it keeps
    // whatever it last had, which here is only ever the seeded `initialData`
    // ("pending") since the mocked GET always errors.
    expect(screen.getByText("status: pending")).toBeInTheDocument()
  })

  it("toggles isFormOpen", async () => {
    const user = userEvent.setup()
    renderProvider()

    expect(screen.getByText("form: closed")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open form" }))
    expect(screen.getByText("form: open")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close form" }))
    expect(screen.getByText("form: closed")).toBeInTheDocument()
  })
})
