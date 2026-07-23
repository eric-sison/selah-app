import { describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { YoutubeImportIndicator } from "@/components/songs/YoutubeImportIndicator"
import { useYoutubeImport } from "@/components/songs/YoutubeImportProvider"
import { render, screen } from "../../../test/render"

vi.mock("@/components/songs/YoutubeImportProvider", () => ({
  useYoutubeImport: vi.fn(),
}))

function mockContext(overrides: Partial<ReturnType<typeof useYoutubeImport>> = {}) {
  vi.mocked(useYoutubeImport).mockReturnValue({
    activeImport: null,
    status: undefined,
    startImport: vi.fn(),
    dismiss: vi.fn(),
    isFormOpen: false,
    setFormOpen: vi.fn(),
    ...overrides,
  })
}

describe("YoutubeImportIndicator", () => {
  it("renders nothing when there's no active import", () => {
    mockContext({ activeImport: null })

    const { container } = render(<YoutubeImportIndicator />)

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing while the upload dialog's own progress view is open", () => {
    mockContext({ activeImport: { id: "job-1", title: "Amazing Grace" }, isFormOpen: true })

    const { container } = render(<YoutubeImportIndicator />)

    expect(container).toBeEmptyDOMElement()
  })

  it("shows a spinner and the import's title while downloading", () => {
    mockContext({
      activeImport: { id: "job-1", title: "Amazing Grace" },
      status: { id: "job-1", status: "downloading", errorMessage: null, songId: null },
    })

    render(<YoutubeImportIndicator />)

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Downloading and converting…")).toBeInTheDocument()
  })

  it("shows an error icon and the failure message when the job failed", () => {
    mockContext({
      activeImport: { id: "job-1", title: "Amazing Grace" },
      status: { id: "job-1", status: "failed", errorMessage: "Video is unavailable.", songId: null },
    })

    render(<YoutubeImportIndicator />)

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Video is unavailable.")).toBeInTheDocument()
  })

  it("calls dismiss when the close button is clicked", async () => {
    const dismiss = vi.fn()
    mockContext({ activeImport: { id: "job-1", title: "Amazing Grace" }, dismiss })
    const user = userEvent.setup()

    render(<YoutubeImportIndicator />)
    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
