import { Dialog } from "@workspace/ui/components/Dialog"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { SongUploadForm } from "@/components/SongUploadForm"
import { apiClient } from "@/lib/api-client"
import { fireEvent, renderWithProviders, screen, waitFor } from "../../test/render"

// SongUploadForm renders <DialogClose> (from its DialogFooter), which reads
// base-ui's dialog root context - it's only ever mounted inside a <Dialog>
// in the app (see UploadSongDialog.tsx), so tests need the same wrapper.
function renderForm(props: Parameters<typeof SongUploadForm>[0] = {}) {
  return renderWithProviders(
    <Dialog open>
      <SongUploadForm {...props} />
    </Dialog>
  )
}

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    POST: vi.fn(),
  },
}))

function audioFile(name = "song.mp3") {
  return new File(["audio-bytes"], name, { type: "audio/mpeg" })
}

function imageFile(name = "cover.png") {
  return new File(["image-bytes"], name, { type: "image/png" })
}

async function uploadAudio(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.getElementById("file") as HTMLInputElement
  await user.upload(input, file)
}

async function uploadAlbumArt(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.getElementById("albumArt") as HTMLInputElement
  await user.upload(input, file)
}

describe("SongUploadForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("blocks submission and shows an inline error when title is empty", async () => {
    const user = userEvent.setup()
    renderForm()

    await uploadAudio(user, audioFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    expect(await screen.findByText("Title is required.")).toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("shows a toast error and does not call apiClient.POST when no audio file is chosen", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Please choose an audio file.", {
        position: "top-center",
      })
    })
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("submits only title and the required file, omitting empty optional fields from FormData", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await uploadAudio(user, audioFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalled()
    })

    const [path, options] = vi.mocked(apiClient.POST).mock.calls[0]!
    expect(path).toBe("/api/songs")
    const formData = options.body as unknown as FormData
    expect(formData.get("title")).toBe("Amazing Grace")
    expect((formData.get("file") as File).name).toBe("song.mp3")
    expect(formData.has("artist")).toBe(false)
    expect(formData.has("musicalKey")).toBe(false)
    expect(formData.has("tempo")).toBe(false)
    expect(formData.has("album")).toBe(false)
    expect(formData.has("releaseDate")).toBe(false)
    expect(formData.has("albumArt")).toBe(false)
  })

  it("submits every optional field and album art when filled in", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await user.type(screen.getByLabelText("Artist"), "Traditional")
    await user.type(screen.getByLabelText("Key"), "G")
    await user.type(screen.getByLabelText("Tempo (BPM)"), "72")
    await user.type(screen.getByLabelText("Album"), "Hymns")
    const releaseDateInput = screen.getByLabelText("Release date")
    await user.clear(releaseDateInput)
    await user.type(releaseDateInput, "2024-01-15")
    await uploadAudio(user, audioFile())
    await uploadAlbumArt(user, imageFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalled()
    })

    const [, options] = vi.mocked(apiClient.POST).mock.calls[0]!
    const formData = options.body as unknown as FormData
    expect(formData.get("title")).toBe("Amazing Grace")
    expect(formData.get("artist")).toBe("Traditional")
    expect(formData.get("musicalKey")).toBe("G")
    expect(formData.get("tempo")).toBe("72")
    expect(formData.get("album")).toBe("Hymns")
    expect(formData.get("releaseDate")).toBe("2024-01-15")
    expect((formData.get("file") as File).name).toBe("song.mp3")
    expect((formData.get("albumArt") as File).name).toBe("cover.png")
  })

  it("shows a success toast and calls the onSuccess prop after a successful upload", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSuccess })

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await uploadAudio(user, audioFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Song uploaded.", { position: "top-center" })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("shows a toast error when apiClient.POST returns an error", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({ data: undefined, error: { message: "bad" } } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await uploadAudio(user, audioFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to upload song.", {
        position: "top-center",
      })
    })
  })

  it("resets stored file state to null when the audio and album art inputs are cleared", async () => {
    const user = userEvent.setup()
    renderForm()

    await uploadAudio(user, audioFile())
    fireEvent.change(document.getElementById("file") as HTMLInputElement, { target: { files: [] } })

    await uploadAlbumArt(user, imageFile())
    fireEvent.change(document.getElementById("albumArt") as HTMLInputElement, { target: { files: [] } })

    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Please choose an audio file.", {
        position: "top-center",
      })
    })
    expect(apiClient.POST).not.toHaveBeenCalled()
  })
})
