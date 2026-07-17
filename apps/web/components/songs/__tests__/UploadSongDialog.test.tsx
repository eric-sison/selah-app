import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UploadSongDialog } from "@/components/songs/UploadSongDialog"
import { render, screen } from "../../../test/render"

vi.mock("@/components/songs/SongUploadForm", () => ({
  SongUploadForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>mock-song-upload-form-success</button>
  ),
}))

describe("UploadSongDialog", () => {
  it("is closed by default", () => {
    render(<UploadSongDialog />)

    expect(screen.getByRole("button", { name: "Upload a song" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the dialog when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<UploadSongDialog />)

    await user.click(screen.getByRole("button", { name: "Upload a song" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Upload a song" })).toBeInTheDocument()
  })

  it("closes the dialog when the upload form succeeds", async () => {
    const user = userEvent.setup()
    render(<UploadSongDialog />)

    await user.click(screen.getByRole("button", { name: "Upload a song" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "mock-song-upload-form-success" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
