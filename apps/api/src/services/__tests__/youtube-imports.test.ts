import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    youtubeImportJob: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
}
vi.mock("../../db/index.js", () => ({ db: mockDb }))

const fetchYoutubeMetadata = vi.fn()
const downloadYoutubeAudioAsMp3 = vi.fn()
const isAllowedYoutubeUrl = vi.fn()
vi.mock("../../lib/youtube.js", () => ({ fetchYoutubeMetadata, downloadYoutubeAudioAsMp3, isAllowedYoutubeUrl }))

const createSong = vi.fn()
vi.mock("../songs.js", () => ({ createSong }))

const mkdtemp = vi.fn()
const readFile = vi.fn()
const rm = vi.fn()
vi.mock("node:fs/promises", () => ({ mkdtemp, readFile, rm }))

const { fetchYoutubeImportMetadata, getYoutubeImportStatus, startYoutubeImport } = await import(
  "../youtube-imports.js"
)

function mockInsertReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row])
  const values = vi.fn().mockReturnValue({ returning })
  mockDb.insert.mockReturnValue({ values })
  return { values, returning }
}

function mockUpdateResolve() {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where }
}

// Lets the fire-and-forget background job (kicked off, not awaited, by
// startYoutubeImport) run to completion before assertions inspect its
// effects - a plain `await Promise.resolve()` only flushes one microtask,
// which isn't enough for its multi-step await chain.
function flushBackgroundJob() {
  return new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fetchYoutubeImportMetadata", () => {
  it("delegates to fetchYoutubeMetadata", async () => {
    const metadata = { title: "Amazing Grace", durationSeconds: 240, thumbnailUrl: "https://img.example/thumb.jpg" }
    fetchYoutubeMetadata.mockResolvedValue(metadata)

    const result = await fetchYoutubeImportMetadata("https://youtu.be/abc123")

    expect(result).toBe(metadata)
    expect(fetchYoutubeMetadata).toHaveBeenCalledWith("https://youtu.be/abc123")
  })
})

describe("startYoutubeImport", () => {
  it("returns null without inserting when the URL isn't a supported YouTube URL", async () => {
    isAllowedYoutubeUrl.mockReturnValue(false)

    const result = await startYoutubeImport({
      youtubeUrl: "https://example.com/video",
      title: "Amazing Grace",
      requestedBy: "user-1",
    })

    expect(result).toBeNull()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts a pending job (with the given title as videoTitle) and returns it immediately", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    const job = { id: "job-1", youtubeUrl: "https://youtu.be/abc123", videoTitle: "Amazing Grace", status: "pending" }
    const { values } = mockInsertReturning(job)
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockResolvedValue("/tmp/yt-import-xyz/abc123.mp3")
    readFile.mockResolvedValue(Buffer.from("mp3 bytes"))
    createSong.mockResolvedValue({ id: "song-1" })
    rm.mockResolvedValue(undefined)
    mockUpdateResolve()

    const result = await startYoutubeImport({
      youtubeUrl: "https://youtu.be/abc123",
      title: "Amazing Grace",
      requestedBy: "user-1",
    })
    await flushBackgroundJob()

    expect(result).toBe(job)
    expect(values).toHaveBeenCalledWith({
      youtubeUrl: "https://youtu.be/abc123",
      videoTitle: "Amazing Grace",
      status: "pending",
      requestedBy: "user-1",
    })
  })

  it("downloads, converts, and uploads the video, marking the job completed with the new song's id", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockResolvedValue("/tmp/yt-import-xyz/abc123.mp3")
    readFile.mockResolvedValue(Buffer.from("mp3 bytes"))
    createSong.mockResolvedValue({ id: "song-1" })
    rm.mockResolvedValue(undefined)
    const { set } = mockUpdateResolve()

    await startYoutubeImport({
      youtubeUrl: "https://youtu.be/abc123",
      title: "Amazing Grace",
      artist: "Traditional",
      requestedBy: "user-1",
    })
    await flushBackgroundJob()

    expect(downloadYoutubeAudioAsMp3).toHaveBeenCalledWith("https://youtu.be/abc123", "/tmp/yt-import-xyz")
    expect(createSong).toHaveBeenCalledWith({
      title: "Amazing Grace",
      artist: "Traditional",
      musicalKey: undefined,
      tempo: undefined,
      album: undefined,
      releaseDate: undefined,
      originalFileName: "abc123.mp3",
      mimeType: "audio/mpeg",
      fileBuffer: Buffer.from("mp3 bytes"),
      uploadedBy: "user-1",
    })
    expect(set).toHaveBeenNthCalledWith(1, { status: "downloading" })
    expect(set).toHaveBeenNthCalledWith(2, { status: "completed", songId: "song-1", errorMessage: null })
    expect(rm).toHaveBeenCalledWith("/tmp/yt-import-xyz", { recursive: true, force: true })
  })

  it("passes albumArt through to createSong when provided", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockResolvedValue("/tmp/yt-import-xyz/abc123.mp3")
    readFile.mockResolvedValue(Buffer.from("mp3 bytes"))
    createSong.mockResolvedValue({ id: "song-1" })
    rm.mockResolvedValue(undefined)
    mockUpdateResolve()
    const albumArt = { fileName: "cover.jpg", mimeType: "image/jpeg", buffer: Buffer.from("cover bytes") }

    await startYoutubeImport({
      youtubeUrl: "https://youtu.be/abc123",
      title: "Amazing Grace",
      albumArt,
      requestedBy: "user-1",
    })
    await flushBackgroundJob()

    expect(createSong).toHaveBeenCalledWith(expect.objectContaining({ albumArt }))
  })

  it("marks the job failed with the thrown error's message when the download fails, still cleaning up", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockRejectedValue(new Error("yt-dlp exited with code 1"))
    rm.mockResolvedValue(undefined)
    const { set } = mockUpdateResolve()

    await startYoutubeImport({ youtubeUrl: "https://youtu.be/abc123", title: "Amazing Grace", requestedBy: "user-1" })
    await flushBackgroundJob()

    expect(set).toHaveBeenNthCalledWith(2, { status: "failed", errorMessage: "yt-dlp exited with code 1" })
    expect(createSong).not.toHaveBeenCalled()
    expect(rm).toHaveBeenCalledWith("/tmp/yt-import-xyz", { recursive: true, force: true })
  })

  it("falls back to a generic error message when the thrown value isn't an Error", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockRejectedValue("boom")
    rm.mockResolvedValue(undefined)
    const { set } = mockUpdateResolve()

    await startYoutubeImport({ youtubeUrl: "https://youtu.be/abc123", title: "Amazing Grace", requestedBy: "user-1" })
    await flushBackgroundJob()

    expect(set).toHaveBeenNthCalledWith(2, { status: "failed", errorMessage: "Failed to import this video." })
  })

  it("marks the job failed without attempting cleanup when creating the scratch directory itself fails", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockRejectedValue(new Error("ENOSPC: no space left on device"))
    const { set } = mockUpdateResolve()

    await startYoutubeImport({ youtubeUrl: "https://youtu.be/abc123", title: "Amazing Grace", requestedBy: "user-1" })
    await flushBackgroundJob()

    expect(set).toHaveBeenNthCalledWith(2, {
      status: "failed",
      errorMessage: "ENOSPC: no space left on device",
    })
    expect(downloadYoutubeAudioAsMp3).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it("still cleans up the scratch directory when creating the song fails after a successful download", async () => {
    isAllowedYoutubeUrl.mockReturnValue(true)
    mockInsertReturning({ id: "job-1" })
    mkdtemp.mockResolvedValue("/tmp/yt-import-xyz")
    downloadYoutubeAudioAsMp3.mockResolvedValue("/tmp/yt-import-xyz/abc123.mp3")
    readFile.mockResolvedValue(Buffer.from("mp3 bytes"))
    createSong.mockRejectedValue(new Error("storage down"))
    rm.mockResolvedValue(undefined)
    const { set } = mockUpdateResolve()

    await startYoutubeImport({ youtubeUrl: "https://youtu.be/abc123", title: "Amazing Grace", requestedBy: "user-1" })
    await flushBackgroundJob()

    expect(set).toHaveBeenNthCalledWith(2, { status: "failed", errorMessage: "storage down" })
    expect(rm).toHaveBeenCalledWith("/tmp/yt-import-xyz", { recursive: true, force: true })
  })
})

describe("getYoutubeImportStatus", () => {
  it("returns the job row for the given id", async () => {
    const job = { id: "job-1", status: "completed" }
    mockDb.query.youtubeImportJob.findFirst.mockResolvedValue(job)

    expect(await getYoutubeImportStatus("job-1")).toBe(job)
  })

  it("returns undefined when no job exists with this id", async () => {
    mockDb.query.youtubeImportJob.findFirst.mockResolvedValue(undefined)

    expect(await getYoutubeImportStatus("missing")).toBeUndefined()
  })
})
