import { Dialog } from "@workspace/ui/components/Dialog"
import { toast } from "@workspace/ui/components/Sonner"
import { format } from "date-fns"
import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { SongUploadForm } from "@/components/songs/SongUploadForm"
import { apiClient } from "@/lib/api-client"
import { YoutubeImportProvider } from "@/components/songs/YoutubeImportProvider"
import { fireEvent, renderWithProviders, screen, waitFor } from "../../../test/render"

// SongUploadForm renders <DialogClose> (from its DialogFooter), which reads
// base-ui's dialog root context - it's only ever mounted inside a <Dialog>
// in the app (see UploadSongDialog.tsx), so tests need the same wrapper.
// It also reads useYoutubeImport, which throws outside a YoutubeImportProvider
// (mounted once, app-wide, in the real app's protected layout).
function renderForm(props: Parameters<typeof SongUploadForm>[0] = {}) {
  return renderWithProviders(
    <YoutubeImportProvider>
      <Dialog open>
        <SongUploadForm {...props} />
      </Dialog>
    </YoutubeImportProvider>
  )
}

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    POST: vi.fn(),
    GET: vi.fn(),
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

// Matches CalendarDayButton's own `data-day` computation
// (day.date.toLocaleDateString()) - same targeting approach as
// CreateLineupForm.test.tsx.
function dayCell(date: Date) {
  return document.querySelector(`[data-day="${date.toLocaleDateString()}"]`) as HTMLElement
}

// A day within the current month, so it's visible without navigating the
// calendar (which always opens to today's month by default) - returns both
// the Date to click and the "yyyy-MM-dd" string it should produce.
function releaseDateOnDay(dayOfMonth: number) {
  const date = new Date()
  date.setDate(dayOfMonth)
  return { date, isoString: format(date, "yyyy-MM-dd") }
}

// Drives the ReleaseDatePicker end to end: open by its labeled trigger, then
// click a day (which closes the popover itself, since it's date-only).
async function pickReleaseDate(user: ReturnType<typeof userEvent.setup>, date: Date) {
  await user.click(screen.getByLabelText("Release date"))
  await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
  await user.click(dayCell(date))
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

    const postCalls = vi.mocked(apiClient.POST).mock.calls as Array<[string, { body: FormData }]>
    const [path, options] = postCalls[0]!
    expect(path).toBe("/api/songs")
    const formData = options.body
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
    const releaseDate = releaseDateOnDay(15)
    await pickReleaseDate(user, releaseDate.date)
    await uploadAudio(user, audioFile())
    await uploadAlbumArt(user, imageFile())
    await user.click(screen.getByRole("button", { name: /upload song/i }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalled()
    })

    const postCalls = vi.mocked(apiClient.POST).mock.calls as Array<[string, { body: FormData }]>
    const [, options] = postCalls[0]!
    const formData = options.body
    expect(formData.get("title")).toBe("Amazing Grace")
    expect(formData.get("artist")).toBe("Traditional")
    expect(formData.get("musicalKey")).toBe("G")
    expect(formData.get("tempo")).toBe("72")
    expect(formData.get("album")).toBe("Hymns")
    expect(formData.get("releaseDate")).toBe(releaseDate.isoString)
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

  it("clears the release date when the same day is clicked again", async () => {
    const user = userEvent.setup()
    renderForm()

    const releaseDate = releaseDateOnDay(15)
    await pickReleaseDate(user, releaseDate.date)
    expect(screen.getByLabelText("Release date")).toHaveTextContent(format(releaseDate.date, "MMM d, yyyy"))

    await pickReleaseDate(user, releaseDate.date)
    expect(screen.getByLabelText("Release date")).toHaveTextContent("Optional")
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

async function switchToYoutubeTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /from youtube/i }))
}

function mockPost(implementation: (path: string, options: { body: unknown }) => unknown) {
  vi.mocked(apiClient.POST).mockImplementation(implementation as never)
}

describe("SongUploadForm - YouTube import", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("fetches and previews video details, auto-filling the empty title field", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace (Live)", durationSeconds: 125, thumbnailUrl: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))

    expect(await screen.findByText("Amazing Grace (Live)")).toBeInTheDocument()
    expect(screen.getByText("2:05")).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toHaveValue("Amazing Grace (Live)")
  })

  it("does not override a title the user already typed when auto-filling from the fetched video", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace (Live)", durationSeconds: 65, thumbnailUrl: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Title"), "My Custom Title")
    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))

    expect(await screen.findByText("Amazing Grace (Live)")).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toHaveValue("My Custom Title")
  })

  it("shows the server's error message when fetching video details fails", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({ data: undefined, error: { status: 422, message: "Video is too long." } })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Video is too long.", { position: "top-center" })
    })
  })

  it("shows a toast error when submitting in YouTube mode before fetching details", async () => {
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.type(screen.getByLabelText("Title"), "Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Fetch the video's details first.", {
        position: "top-center",
      })
    })
    expect(apiClient.POST).not.toHaveBeenCalledWith("/api/youtube-imports", expect.anything())
  })

  it("shows the server's error message when starting the import fails", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({ data: undefined, error: { status: 422, message: "Only YouTube URLs are supported." } })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Only YouTube URLs are supported.", {
        position: "top-center",
      })
    })
  })

  it("starts an import, polls until completed, and calls onSuccess", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({
          data: { id: "job-1", status: "pending", errorMessage: null, songId: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    // Left pending (rather than resolved) until after the "downloading"
    // state is asserted below - a mock that resolves immediately can have
    // its "completed" result land before that first render ever paints,
    // since the seeded "pending" initialData is stale-on-mount and refetches
    // right away.
    let resolveGet: ((value: unknown) => void) | undefined
    vi.mocked(apiClient.GET).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      }) as never
    )
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSuccess })

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    expect(await screen.findByText(/downloading and converting/i)).toBeInTheDocument()

    resolveGet?.({
      data: { id: "job-1", status: "completed", errorMessage: null, songId: "song-1" },
      error: undefined,
    })

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Song imported.", { position: "top-center" })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("shows the failed state with the server's error message, and lets the user try again", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({
          data: { id: "job-1", status: "pending", errorMessage: null, songId: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: "job-1", status: "failed", errorMessage: "Video is unavailable.", songId: null },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    expect(await screen.findByText("Import failed")).toBeInTheDocument()
    expect(screen.getByText("Video is unavailable.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /try again/i }))

    expect(screen.getByLabelText("YouTube URL")).toBeInTheDocument()
  })

  it("sends every optional metadata field and album art when starting the import", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({
          data: { id: "job-1", status: "pending", errorMessage: null, songId: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await uploadAlbumArt(user, imageFile())
    await user.type(screen.getByLabelText("Artist"), "Traditional")
    await user.type(screen.getByLabelText("Key"), "G")
    await user.type(screen.getByLabelText("Tempo (BPM)"), "72")
    await user.type(screen.getByLabelText("Album"), "Hymns")
    const releaseDate = releaseDateOnDay(15)
    await pickReleaseDate(user, releaseDate.date)
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/youtube-imports", expect.anything())
    })

    const postCalls = vi.mocked(apiClient.POST).mock.calls as Array<[string, { body: FormData }]>
    const importCall = postCalls.find(([path]) => path === "/api/youtube-imports")!
    const formData = importCall[1].body
    expect(formData.get("youtubeUrl")).toBe("https://youtu.be/abc123")
    expect(formData.get("title")).toBe("Amazing Grace")
    expect(formData.get("artist")).toBe("Traditional")
    expect(formData.get("musicalKey")).toBe("G")
    expect(formData.get("tempo")).toBe("72")
    expect(formData.get("album")).toBe("Hymns")
    expect(formData.get("releaseDate")).toBe(releaseDate.isoString)
    expect((formData.get("albumArt") as File).name).toBe("cover.png")
  })

  it("falls back to a generic message when the metadata fetch error has no message", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({ data: undefined, error: { status: 422, message: "" } })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to fetch video details.", {
        position: "top-center",
      })
    })
  })

  it("falls back to a generic message when the start-import error has no message", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({ data: undefined, error: { status: 422, message: "" } })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to start the import.", {
        position: "top-center",
      })
    })
  })

  it("shows a 'Starting...' label on the submit button while the import is being kicked off", async () => {
    let resolvePost: ((value: unknown) => void) | undefined
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return new Promise((resolve) => {
          resolvePost = resolve
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    expect(await screen.findByRole("button", { name: "Starting..." })).toBeInTheDocument()

    resolvePost?.({
      data: { id: "job-1", status: "pending", errorMessage: null, songId: null },
      error: undefined,
    })
  })

  it("doesn't crash when polling the import's status errors", async () => {
    mockPost((path) => {
      if (path === "/api/youtube-imports/metadata") {
        return Promise.resolve({
          data: { title: "Amazing Grace", durationSeconds: 60, thumbnailUrl: null },
          error: undefined,
        })
      }
      if (path === "/api/youtube-imports") {
        return Promise.resolve({
          data: { id: "job-1", status: "pending", errorMessage: null, songId: null },
          error: undefined,
        })
      }
      throw new Error(`unexpected path in test: ${path}`)
    })
    vi.mocked(apiClient.GET).mockResolvedValue({ data: undefined, error: { status: 500, message: "boom" } } as never)
    const user = userEvent.setup()
    renderForm()

    await switchToYoutubeTab(user)
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/abc123")
    await user.click(screen.getByRole("button", { name: "Fetch" }))
    await screen.findByText("Amazing Grace")
    await user.click(screen.getByRole("button", { name: /import from youtube/i }))

    expect(await screen.findByText(/downloading and converting/i)).toBeInTheDocument()
  })
})
