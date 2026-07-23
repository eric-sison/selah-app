import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    song: { findFirst: vi.fn() },
    songStems: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const getStreamUrl = vi.fn().mockResolvedValue("https://storage.example/stream")
vi.mock("../../lib/storage.js", () => ({ getStreamUrl }))

vi.mock("../../utils/env.js", () => ({
  env: {
    STEM_WORKER_URL: "https://worker.example",
    STEM_WORKER_SECRET: "s".repeat(32),
    API_PUBLIC_URL: "https://api.example",
  },
}))

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({ toString: () => "deadbeef".repeat(8) })),
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

const { completeStemSeparation, getStemStatus, getStemStreamUrls, startStemSeparation } = await import(
  "../song-stems.js"
)

function mockUpsertReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row])
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  mockDb.insert.mockReturnValue({ values })
  return { values, onConflictDoUpdate, returning }
}

function mockUpdateReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where, returning }
}

function mockUpdateResolve() {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("startStemSeparation", () => {
  it("returns null without inserting when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await startStemSeparation("missing", "user-1")).toBeNull()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("upserts a pending job clearing prior results, then posts it to the worker", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ id: "song-1", storageKey: "songs/song-1/track.mp3" })
    const job = { id: "job-1", songId: "song-1", status: "pending" }
    const { values, onConflictDoUpdate } = mockUpsertReturning(job)
    fetchMock.mockResolvedValue({ ok: true })

    const result = await startStemSeparation("song-1", "user-1")

    expect(result).toBe(job)
    expect(values).toHaveBeenCalledWith({
      songId: "song-1",
      status: "pending",
      callbackToken: "deadbeef".repeat(8),
      requestedBy: "user-1",
    })
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          status: "pending",
          callbackToken: "deadbeef".repeat(8),
          requestedBy: "user-1",
          vocalsStorageKey: null,
          drumsStorageKey: null,
          bassStorageKey: null,
          guitarStorageKey: null,
          pianoStorageKey: null,
          otherStorageKey: null,
          errorMessage: null,
        }),
      })
    )
  })

  it("posts the job to the worker with the signed source URL and callback details", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ id: "song-1", storageKey: "songs/song-1/track.mp3" })
    mockUpsertReturning({ id: "job-1", songId: "song-1" })
    getStreamUrl.mockResolvedValue("https://storage.example/track.mp3")
    fetchMock.mockResolvedValue({ ok: true })

    await startStemSeparation("song-1", "user-1")

    expect(getStreamUrl).toHaveBeenCalledWith("songs/song-1/track.mp3")
    expect(fetchMock).toHaveBeenCalledWith("https://worker.example/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${"s".repeat(32)}`,
      },
      body: JSON.stringify({
        jobId: "job-1",
        songId: "song-1",
        sourceUrl: "https://storage.example/track.mp3",
        callbackUrl: "https://api.example/api/songs/song-1/stems/callback",
        callbackToken: "deadbeef".repeat(8),
      }),
    })
  })

  it("marks the job failed and returns the failed row when the worker responds with a non-ok status", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ id: "song-1", storageKey: "songs/song-1/track.mp3" })
    mockUpsertReturning({ id: "job-1", songId: "song-1" })
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const failed = { id: "job-1", status: "failed", errorMessage: "Worker responded with 500" }
    const { set } = mockUpdateReturning(failed)

    const result = await startStemSeparation("song-1", "user-1")

    expect(result).toBe(failed)
    expect(set).toHaveBeenCalledWith({ status: "failed", errorMessage: "Worker responded with 500" })
  })

  it("marks the job failed with the error's message when the worker can't be reached", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ id: "song-1", storageKey: "songs/song-1/track.mp3" })
    mockUpsertReturning({ id: "job-1", songId: "song-1" })
    fetchMock.mockRejectedValue(new Error("network down"))
    const { set } = mockUpdateReturning({ id: "job-1", status: "failed" })

    await startStemSeparation("song-1", "user-1")

    expect(set).toHaveBeenCalledWith({ status: "failed", errorMessage: "network down" })
  })

  it("falls back to a generic error message when the thrown value isn't an Error", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ id: "song-1", storageKey: "songs/song-1/track.mp3" })
    mockUpsertReturning({ id: "job-1", songId: "song-1" })
    fetchMock.mockRejectedValue("boom")
    const { set } = mockUpdateReturning({ id: "job-1", status: "failed" })

    await startStemSeparation("song-1", "user-1")

    expect(set).toHaveBeenCalledWith({
      status: "failed",
      errorMessage: "Failed to reach the separation worker.",
    })
  })
})

describe("getStemStatus", () => {
  it("returns the job row for the given song", async () => {
    const job = { id: "job-1", songId: "song-1", status: "completed" }
    mockDb.query.songStems.findFirst.mockResolvedValue(job)

    expect(await getStemStatus("song-1")).toBe(job)
  })

  it("returns undefined when separation was never requested", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue(undefined)

    expect(await getStemStatus("song-1")).toBeUndefined()
  })
})

describe("getStemStreamUrls", () => {
  const completedJob = {
    status: "completed",
    vocalsStorageKey: "vocals.mp3",
    drumsStorageKey: "drums.mp3",
    bassStorageKey: "bass.mp3",
    guitarStorageKey: "guitar.mp3",
    pianoStorageKey: "piano.mp3",
    otherStorageKey: "other.mp3",
  }

  it("returns null when separation was never requested", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue(undefined)

    expect(await getStemStreamUrls("song-1")).toBeNull()
  })

  it("returns null when the job hasn't completed yet", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ ...completedJob, status: "processing" })

    expect(await getStemStreamUrls("song-1")).toBeNull()
  })

  it("returns null when any stem storage key is missing despite a completed status", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ ...completedJob, pianoStorageKey: null })

    expect(await getStemStreamUrls("song-1")).toBeNull()
  })

  it("signs and returns all 6 stem stream URLs when completed", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue(completedJob)
    getStreamUrl.mockResolvedValue("https://storage.example/stream")

    const result = await getStemStreamUrls("song-1")

    expect(result).toEqual({
      vocals: "https://storage.example/stream",
      drums: "https://storage.example/stream",
      bass: "https://storage.example/stream",
      guitar: "https://storage.example/stream",
      piano: "https://storage.example/stream",
      other: "https://storage.example/stream",
    })
    expect(getStreamUrl).toHaveBeenCalledWith("vocals.mp3")
    expect(getStreamUrl).toHaveBeenCalledWith("other.mp3")
  })
})

describe("completeStemSeparation", () => {
  it("returns false without updating when no job exists for the song", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue(undefined)

    const result = await completeStemSeparation({ songId: "song-1", callbackToken: "token" })

    expect(result).toBe(false)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns false without updating when the callback token doesn't match", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ callbackToken: "correct-token" })

    const result = await completeStemSeparation({ songId: "song-1", callbackToken: "wrong-token" })

    expect(result).toBe(false)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("marks the job failed and returns true when given an error", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ callbackToken: "token" })
    const { set } = mockUpdateResolve()

    const result = await completeStemSeparation({ songId: "song-1", callbackToken: "token", error: "boom" })

    expect(result).toBe(true)
    expect(set).toHaveBeenCalledWith({ status: "failed", errorMessage: "boom" })
  })

  it("returns false without updating when neither stems nor error is given", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ callbackToken: "token" })

    const result = await completeStemSeparation({ songId: "song-1", callbackToken: "token" })

    expect(result).toBe(false)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("marks the job completed with all 6 stem storage keys and returns true", async () => {
    mockDb.query.songStems.findFirst.mockResolvedValue({ callbackToken: "token" })
    const { set } = mockUpdateResolve()
    const stems = {
      vocals: "vocals.mp3",
      drums: "drums.mp3",
      bass: "bass.mp3",
      guitar: "guitar.mp3",
      piano: "piano.mp3",
      other: "other.mp3",
    }

    const result = await completeStemSeparation({ songId: "song-1", callbackToken: "token", stems })

    expect(result).toBe(true)
    expect(set).toHaveBeenCalledWith({
      status: "completed",
      vocalsStorageKey: "vocals.mp3",
      drumsStorageKey: "drums.mp3",
      bassStorageKey: "bass.mp3",
      guitarStorageKey: "guitar.mp3",
      pianoStorageKey: "piano.mp3",
      otherStorageKey: "other.mp3",
      errorMessage: null,
    })
  })
})
