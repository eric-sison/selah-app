import { afterEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    musician: { findFirst: vi.fn(), findMany: vi.fn() },
    teamMember: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const {
  createMusician,
  deleteMusician,
  getMusician,
  getMusicianByUserId,
  getMusiciansByUserIds,
  listMusicians,
  MusicianError,
  updateMusicianInstruments,
} = await import("../musicians.js")

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

function mockDeleteWhere() {
  const where = vi.fn().mockResolvedValue(undefined)
  mockDb.delete.mockReturnValue({ where })
  return { where }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("listMusicians", () => {
  it("returns every musician joined with their user, sorted by the user's name", async () => {
    mockDb.query.musician.findMany.mockResolvedValue([
      { id: "musician-1", user: { id: "user-1", name: "Zoe" } },
      { id: "musician-2", user: { id: "user-2", name: "Ava" } },
    ])

    const result = await listMusicians()

    expect(result.map((m) => m.user.name)).toEqual(["Ava", "Zoe"])
    expect(mockDb.query.musician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { user: { columns: { id: true, name: true, email: true, image: true } } },
      })
    )
  })
})

describe("getMusician", () => {
  it("returns the musician with this id, joined with their user", async () => {
    const row = { id: "musician-1", user: { id: "user-1", name: "Ava" } }
    mockDb.query.musician.findFirst.mockResolvedValue(row)

    expect(await getMusician("musician-1")).toBe(row)
  })

  it("returns undefined when no musician has this id", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)

    expect(await getMusician("missing")).toBeUndefined()
  })
})

describe("getMusicianByUserId", () => {
  it("returns the musician for this user id, joined with their user", async () => {
    const row = { id: "musician-1", userId: "user-1", user: { id: "user-1", name: "Ava" } }
    mockDb.query.musician.findFirst.mockResolvedValue(row)

    expect(await getMusicianByUserId("user-1")).toBe(row)
  })

  it("returns undefined when this user has no musician profile", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)

    expect(await getMusicianByUserId("user-1")).toBeUndefined()
  })
})

describe("createMusician", () => {
  it("inserts a musician profile and returns the created row", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)
    const created = { id: "musician-1", userId: "user-1", instruments: ["bass"] }
    const { values } = mockInsertReturning(created)

    const result = await createMusician({ userId: "user-1", instruments: ["bass"] })

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({ userId: "user-1", instruments: ["bass"] })
  })

  it("defaults instruments to an empty array when omitted", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)
    const created = { id: "musician-1", userId: "user-1", instruments: [] }
    const { values } = mockInsertReturning(created)

    await createMusician({ userId: "user-1" })

    expect(values).toHaveBeenCalledWith({ userId: "user-1", instruments: [] })
  })

  it("de-duplicates repeated instruments", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)
    const { values } = mockInsertReturning({ id: "musician-1" })

    await createMusician({ userId: "user-1", instruments: ["bass", "bass", "drums"] })

    expect(values).toHaveBeenCalledWith({ userId: "user-1", instruments: ["bass", "drums"] })
  })

  it("throws a MusicianError without inserting when this user already has a musician profile", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue({ id: "musician-1", userId: "user-1" })

    await expect(createMusician({ userId: "user-1" })).rejects.toThrow(MusicianError)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("updateMusicianInstruments", () => {
  it("replaces the instrument set and returns the updated row", async () => {
    const updated = { id: "musician-1", instruments: ["drums"] }
    const { set, where } = mockUpdateReturning(updated)

    const result = await updateMusicianInstruments("musician-1", ["drums"])

    expect(result).toBe(updated)
    expect(set).toHaveBeenCalledWith({ instruments: ["drums"] })
    expect(where).toHaveBeenCalledTimes(1)
  })

  it("de-duplicates repeated instruments", async () => {
    const { set } = mockUpdateReturning({ id: "musician-1" })

    await updateMusicianInstruments("musician-1", ["bass", "bass"])

    expect(set).toHaveBeenCalledWith({ instruments: ["bass"] })
  })

  it("returns undefined when no musician has this id", async () => {
    mockUpdateReturning(undefined)

    expect(await updateMusicianInstruments("missing", [])).toBeUndefined()
  })
})

describe("deleteMusician", () => {
  it("returns false without deleting when no musician has this id", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue(undefined)

    expect(await deleteMusician("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("throws a MusicianError without deleting when still on a team", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue({ id: "musician-1", userId: "user-1" })
    mockDb.query.teamMember.findFirst.mockResolvedValue({ id: "tm-1", userId: "user-1" })

    await expect(deleteMusician("musician-1")).rejects.toThrow(MusicianError)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the musician and returns true when found and on no team", async () => {
    mockDb.query.musician.findFirst.mockResolvedValue({ id: "musician-1", userId: "user-1" })
    mockDb.query.teamMember.findFirst.mockResolvedValue(undefined)
    const { where } = mockDeleteWhere()

    expect(await deleteMusician("musician-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe("getMusiciansByUserIds", () => {
  it("returns an empty map without querying when given no user ids", async () => {
    const result = await getMusiciansByUserIds([])

    expect(result).toEqual(new Map())
    expect(mockDb.query.musician.findMany).not.toHaveBeenCalled()
  })

  it("resolves each user's musician id and instruments, keyed by user id", async () => {
    mockDb.query.musician.findMany.mockResolvedValue([
      { id: "musician-1", userId: "user-1", instruments: ["bass"] },
      { id: "musician-2", userId: "user-2", instruments: [] },
    ])

    const result = await getMusiciansByUserIds(["user-1", "user-2"])

    expect(result).toEqual(
      new Map([
        ["user-1", { id: "musician-1", instruments: ["bass"] }],
        ["user-2", { id: "musician-2", instruments: [] }],
      ])
    )
  })
})
