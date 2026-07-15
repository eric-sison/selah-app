import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    song: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const uploadObject = vi.fn().mockResolvedValue(undefined)
const deleteObject = vi.fn().mockResolvedValue(undefined)
const getStreamUrl = vi.fn().mockResolvedValue("https://storage.example/stream")
const getDownloadUrl = vi.fn().mockResolvedValue("https://storage.example/download")
vi.mock("../../lib/storage.js", () => ({ uploadObject, deleteObject, getStreamUrl, getDownloadUrl }))

const {
  createSong,
  deleteSong,
  DEFAULT_SONGS_LIMIT,
  getSong,
  getSongAlbumUrl,
  getSongDownloadUrl,
  getSongStreamUrl,
  listSongs,
  updateSong,
} = await import("../songs.js")

function mockInsertReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row])
  const values = vi.fn().mockReturnValue({ returning })
  mockDb.insert.mockReturnValue({ values })
  return { values, returning }
}

function mockUpdateReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValue(row === undefined ? [] : [row])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where, returning }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createSong", () => {
  const baseInput = {
    title: "Amazing Grace",
    originalFileName: "Amazing Grace.mp3",
    mimeType: "audio/mpeg",
    fileBuffer: Buffer.from("audio-bytes"),
    uploadedBy: "user-1",
  }

  it("inserts a placeholder row, uploads the audio file, then writes back the real storage key", async () => {
    mockInsertReturning({ id: "song-1" })
    const updated = { id: "song-1", storageKey: "songs/song-1/amazing-grace.mp3" }
    mockUpdateReturning(updated)

    const result = await createSong(baseInput)

    expect(result).toBe(updated)
    expect(uploadObject).toHaveBeenCalledWith(
      "songs/song-1/amazing-grace.mp3",
      baseInput.fileBuffer,
      "audio/mpeg"
    )
    const setCall = mockDb.update.mock.results[0].value.set as ReturnType<typeof vi.fn>
    expect(setCall).toHaveBeenCalledWith({
      storageKey: "songs/song-1/amazing-grace.mp3",
      albumArtStorageKey: null,
    })
  })

  it("derives fileSizeBytes from the buffer and passes optional metadata through on insert", async () => {
    mockInsertReturning({ id: "song-1" })
    mockUpdateReturning({ id: "song-1" })

    await createSong({ ...baseInput, artist: "Traditional", musicalKey: "G", tempo: 72 })

    const valuesCall = mockDb.insert.mock.results[0].value.values as ReturnType<typeof vi.fn>
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: "Traditional",
        musicalKey: "G",
        tempo: 72,
        fileSizeBytes: baseInput.fileBuffer.byteLength,
        storageKey: "",
      })
    )
  })

  it("also uploads and stores album art when provided", async () => {
    mockInsertReturning({ id: "song-1" })
    mockUpdateReturning({ id: "song-1" })

    await createSong({
      ...baseInput,
      albumArt: { fileName: "Cover Art.png", mimeType: "image/png", buffer: Buffer.from("img-bytes") },
    })

    expect(uploadObject).toHaveBeenCalledWith(
      "songs/song-1/album-art-cover-art.png",
      expect.any(Buffer),
      "image/png"
    )
    const setCall = mockDb.update.mock.results[0].value.set as ReturnType<typeof vi.fn>
    expect(setCall).toHaveBeenCalledWith({
      storageKey: "songs/song-1/amazing-grace.mp3",
      albumArtStorageKey: "songs/song-1/album-art-cover-art.png",
    })
  })
})

describe("listSongs", () => {
  it("returns all rows and no nextCursor when there is no extra page", async () => {
    mockDb.query.song.findMany.mockResolvedValue([{ id: "1" }, { id: "2" }])

    const result = await listSongs({ limit: 10 })

    expect(result).toEqual({ items: [{ id: "1" }, { id: "2" }], nextCursor: null })
  })

  it("trims the extra row and computes nextCursor when there is another page", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: String(i) }))
    mockDb.query.song.findMany.mockResolvedValue(rows)

    const result = await listSongs({ cursor: 0, limit: 10 })

    expect(result.items).toHaveLength(10)
    expect(result.nextCursor).toBe(10)
  })

  it("defaults to DEFAULT_SONGS_LIMIT and cursor 0 when no options are given", async () => {
    mockDb.query.song.findMany.mockResolvedValue([])

    await listSongs()

    const call = mockDb.query.song.findMany.mock.calls[0][0]
    expect(call.limit).toBe(DEFAULT_SONGS_LIMIT + 1)
    expect(call.offset).toBe(0)
  })

  it("uses the search query path (with the requested limit/offset) when a query is given", async () => {
    mockDb.query.song.findMany.mockResolvedValue([])

    await listSongs({ query: "grace", cursor: 5, limit: 20 })

    const call = mockDb.query.song.findMany.mock.calls[0][0]
    expect(call.limit).toBe(21)
    expect(call.offset).toBe(5)
    expect(call.where).toBeDefined()
    expect(call.orderBy).toBeDefined()
  })
})

describe("getSong", () => {
  it("returns the song joined with its uploader", async () => {
    const row = { id: "song-1", uploader: { id: "user-1", name: "Admin" } }
    mockDb.query.song.findFirst.mockResolvedValue(row)

    expect(await getSong("song-1")).toBe(row)
    expect(mockDb.query.song.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ with: { uploader: { columns: { id: true, name: true } } } })
    )
  })

  it("resolves undefined when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await getSong("missing")).toBeUndefined()
  })
})

describe("updateSong", () => {
  it("returns undefined without re-fetching when no row was updated", async () => {
    mockUpdateReturning(undefined)

    const result = await updateSong("missing", { chordpro: "[C]Test" })

    expect(result).toBeUndefined()
    expect(mockDb.query.song.findFirst).not.toHaveBeenCalled()
  })

  it("re-fetches the updated song (with its uploader join) on success", async () => {
    mockUpdateReturning({ id: "song-1", chordpro: "[C]Test" })
    const refetched = { id: "song-1", chordpro: "[C]Test", uploader: { id: "user-1", name: "Admin" } }
    mockDb.query.song.findFirst.mockResolvedValue(refetched)

    const result = await updateSong("song-1", { chordpro: "[C]Test" })

    expect(result).toBe(refetched)
    const setCall = mockDb.update.mock.results[0].value.set as ReturnType<typeof vi.fn>
    expect(setCall).toHaveBeenCalledWith({ chordpro: "[C]Test" })
  })
})

describe("getSongStreamUrl", () => {
  it("returns null when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await getSongStreamUrl("missing")).toBeNull()
    expect(getStreamUrl).not.toHaveBeenCalled()
  })

  it("signs a stream URL for the song's storage key", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ storageKey: "songs/song-1/track.mp3" })

    expect(await getSongStreamUrl("song-1")).toBe("https://storage.example/stream")
    expect(getStreamUrl).toHaveBeenCalledWith("songs/song-1/track.mp3")
  })
})

describe("getSongDownloadUrl", () => {
  it("returns null when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await getSongDownloadUrl("missing")).toBeNull()
    expect(getDownloadUrl).not.toHaveBeenCalled()
  })

  it("signs a download URL using the song's storage key and original filename", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({
      storageKey: "songs/song-1/track.mp3",
      originalFileName: "Amazing Grace.mp3",
    })

    expect(await getSongDownloadUrl("song-1")).toBe("https://storage.example/download")
    expect(getDownloadUrl).toHaveBeenCalledWith("songs/song-1/track.mp3", "Amazing Grace.mp3")
  })
})

describe("getSongAlbumUrl", () => {
  it("returns null when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await getSongAlbumUrl("missing")).toBeNull()
  })

  it("returns null when the song has no album art", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ albumArtStorageKey: null })

    expect(await getSongAlbumUrl("song-1")).toBeNull()
    expect(getStreamUrl).not.toHaveBeenCalled()
  })

  it("signs a stream URL for the album art storage key", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({ albumArtStorageKey: "songs/song-1/album-art-cover.png" })

    expect(await getSongAlbumUrl("song-1")).toBe("https://storage.example/stream")
    expect(getStreamUrl).toHaveBeenCalledWith("songs/song-1/album-art-cover.png")
  })
})

describe("deleteSong", () => {
  it("returns false and deletes nothing when the song doesn't exist", async () => {
    mockDb.query.song.findFirst.mockResolvedValue(undefined)

    expect(await deleteSong("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it("deletes the row and its audio object, but not an album art object it doesn't have", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({
      id: "song-1",
      storageKey: "songs/song-1/track.mp3",
      albumArtStorageKey: null,
    })
    const where = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where })

    expect(await deleteSong("song-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith("songs/song-1/track.mp3")
    expect(deleteObject).toHaveBeenCalledTimes(1)
  })

  it("also deletes the album art object when the song has one", async () => {
    mockDb.query.song.findFirst.mockResolvedValue({
      id: "song-1",
      storageKey: "songs/song-1/track.mp3",
      albumArtStorageKey: "songs/song-1/album-art-cover.png",
    })
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })

    await deleteSong("song-1")

    expect(deleteObject).toHaveBeenCalledWith("songs/song-1/track.mp3")
    expect(deleteObject).toHaveBeenCalledWith("songs/song-1/album-art-cover.png")
    expect(deleteObject).toHaveBeenCalledTimes(2)
  })
})
