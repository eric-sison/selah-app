import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    lineup: { findFirst: vi.fn(), findMany: vi.fn() },
    lineupSong: { findFirst: vi.fn() },
    lineupMember: { findFirst: vi.fn() },
    schedule: { findFirst: vi.fn() },
    musician: { findMany: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  // createLineup runs everything through db.transaction - since every mock
  // above lives on mockDb itself, running the callback with mockDb as `tx`
  // reuses the exact same insert/query mocks a plain (non-transaction) call
  // would hit.
  transaction: vi.fn((callback: (tx: typeof mockDb) => unknown) => callback(mockDb)),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const {
  addLineupMember,
  addLineupSong,
  createLineup,
  deleteLineup,
  getLineup,
  listLineups,
  removeLineupMember,
  removeLineupSong,
  updateLineup,
} = await import("../lineups.js")

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

// addLineupSong computes the next position via a separate `select` query
// before its `insert` - this stubs that chain to resolve with the given max.
function mockSelectMaxPosition(maxPosition: number | null) {
  const where = vi.fn().mockResolvedValue([{ maxPosition }])
  const from = vi.fn().mockReturnValue({ where })
  mockDb.select.mockReturnValue({ from })
  return { from, where }
}

// createLineup issues multiple sequential `insert` calls (the lineup, then
// its songs, then its members) - this queues a distinct `.values()` mock per
// call, in that order, so each insert's arguments can be asserted
// independently.
function mockSequentialInserts(behaviors: Array<{ returning: unknown[] } | { resolveValue?: unknown }>) {
  const valuesMocks: ReturnType<typeof vi.fn>[] = []
  let call = 0
  mockDb.insert.mockImplementation(() => {
    const behavior = behaviors[call++]
    if (!behavior) throw new Error("Unexpected extra insert call")
    if ("returning" in behavior) {
      const returning = vi.fn().mockResolvedValue(behavior.returning)
      const values = vi.fn().mockReturnValue({ returning })
      valuesMocks.push(values)
      return { values }
    }
    const values = vi.fn().mockResolvedValue(behavior.resolveValue)
    valuesMocks.push(values)
    return { values }
  })
  return valuesMocks
}

afterEach(() => {
  vi.clearAllMocks()
})

// createLineup/updateLineup always resync the lineup's schedule slots
// (syncLineupSchedules in ../lineups.js) - this suite isn't asserting that
// sync's own behavior in detail (see its own coverage once that's written),
// just keeping every existing case honest about the extra query/insert it
// now issues. Resolving "no existing schedule row" by default routes that
// sync through its insert branch for every test below.
beforeEach(() => {
  mockDb.query.schedule.findFirst.mockResolvedValue(undefined)
  // listLineups/getLineup resolve each roster member's instruments via a
  // musicians lookup (attachMemberInstruments) - no members by default, so
  // most tests here don't need a non-empty result.
  mockDb.query.musician.findMany.mockResolvedValue([])
})

describe("createLineup", () => {
  const baseInput = {
    serviceType: "sunday_service" as const,
    serviceDate: new Date("2026-07-26T09:00:00.000Z"),
    teamId: "team-1",
    seriesName: "Rooted",
    topic: "Abiding in the Vine",
    wordReference: "John 15:5-8",
    wordText: "I am the vine; you are the branches.",
    createdBy: "user-1",
  }

  it("inserts a lineup and returns the created row", async () => {
    const created = { id: "lineup-1", ...baseInput, rehearsalDate: null }
    const { values } = mockInsertReturning(created)

    const result = await createLineup(baseInput)

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({
      serviceType: "sunday_service",
      serviceDate: baseInput.serviceDate,
      rehearsalDate: null,
      teamId: "team-1",
      seriesName: "Rooted",
      topic: "Abiding in the Vine",
      wordReference: "John 15:5-8",
      wordText: "I am the vine; you are the branches.",
      direction: undefined,
      devoLeaderId: undefined,
      createdBy: "user-1",
    })
  })

  it("runs the insert through db.transaction", async () => {
    mockInsertReturning({ id: "lineup-1", ...baseInput })

    await createLineup(baseInput)

    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
  })

  it("inserts each song at its array position in the same transaction", async () => {
    const created = { id: "lineup-1", ...baseInput }
    const valuesMocks = mockSequentialInserts([
      { returning: [created] },
      { resolveValue: undefined }, // service schedule sync
      { resolveValue: undefined },
    ])

    await createLineup({ ...baseInput, songIds: ["song-1", "song-2"] })
    const [, , songValues] = valuesMocks

    expect(songValues).toHaveBeenCalledWith([
      { lineupId: "lineup-1", songId: "song-1", position: 0 },
      { lineupId: "lineup-1", songId: "song-2", position: 1 },
    ])
  })

  it("de-dupes repeated song ids before inserting", async () => {
    const created = { id: "lineup-1", ...baseInput }
    const valuesMocks = mockSequentialInserts([
      { returning: [created] },
      { resolveValue: undefined }, // service schedule sync
      { resolveValue: undefined },
    ])

    await createLineup({ ...baseInput, songIds: ["song-1", "song-1"] })
    const [, , songValues] = valuesMocks

    expect(songValues).toHaveBeenCalledWith([{ lineupId: "lineup-1", songId: "song-1", position: 0 }])
  })

  it("inserts roster members in the same transaction", async () => {
    const created = { id: "lineup-1", ...baseInput }
    const valuesMocks = mockSequentialInserts([
      { returning: [created] },
      { resolveValue: undefined }, // service schedule sync
      { resolveValue: undefined },
    ])

    await createLineup({
      ...baseInput,
      members: ["user-2", "user-3"],
    })
    const [, , memberValues] = valuesMocks

    expect(memberValues).toHaveBeenCalledWith([
      { lineupId: "lineup-1", userId: "user-2" },
      { lineupId: "lineup-1", userId: "user-3" },
    ])
  })

  it("de-dupes repeated user ids before inserting", async () => {
    const created = { id: "lineup-1", ...baseInput }
    const valuesMocks = mockSequentialInserts([
      { returning: [created] },
      { resolveValue: undefined }, // service schedule sync
      { resolveValue: undefined },
    ])

    await createLineup({
      ...baseInput,
      members: ["user-2", "user-2"],
    })
    const [, , memberValues] = valuesMocks

    expect(memberValues).toHaveBeenCalledWith([{ lineupId: "lineup-1", userId: "user-2" }])
  })

  it("issues just the service-schedule-sync insert when no songs or members are given", async () => {
    mockInsertReturning({ id: "lineup-1", ...baseInput })

    await createLineup(baseInput)

    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })

  it("inserts both songs and members when both are given", async () => {
    const created = { id: "lineup-1", ...baseInput }
    mockSequentialInserts([
      { returning: [created] },
      { resolveValue: undefined }, // service schedule sync
      { resolveValue: undefined },
      { resolveValue: undefined },
    ])

    await createLineup({
      ...baseInput,
      songIds: ["song-1"],
      members: ["user-2"],
    })

    expect(mockDb.insert).toHaveBeenCalledTimes(4)
  })
})

describe("listLineups", () => {
  it("returns every lineup joined with team, devo leader, songs, and members with their instruments", async () => {
    const rows = [
      {
        id: "lineup-1",
        seriesName: "Rooted",
        members: [{ id: "lm-1", userId: "user-1" }],
      },
    ]
    mockDb.query.lineup.findMany.mockResolvedValue(rows)
    mockDb.query.musician.findMany.mockResolvedValue([
      { id: "musician-1", userId: "user-1", instruments: ["bass"] },
    ])

    const result = await listLineups()

    expect(result).toEqual([
      { ...rows[0]!, members: [{ id: "lm-1", userId: "user-1", instruments: ["bass"] }] },
    ])
    expect(mockDb.query.lineup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          team: { columns: { id: true, name: true } },
          devoLeader: { columns: { id: true, name: true, image: true } },
        }),
      })
    )
  })
})

describe("getLineup", () => {
  it("returns the lineup with this id, joined the same way as listLineups", async () => {
    const row = { id: "lineup-1", seriesName: "Rooted", members: [] }
    mockDb.query.lineup.findFirst.mockResolvedValue(row)

    expect(await getLineup("lineup-1")).toEqual({ ...row, members: [] })
  })

  it("returns undefined when no lineup has this id", async () => {
    mockDb.query.lineup.findFirst.mockResolvedValue(undefined)

    expect(await getLineup("missing")).toBeUndefined()
  })
})

describe("updateLineup", () => {
  it("updates the lineup, resyncs its schedule slots, and re-fetches it with joins", async () => {
    mockUpdateReturning({
      id: "lineup-1",
      topic: "New topic",
      serviceType: "sunday_service",
      serviceDate: new Date("2026-07-26T09:00:00.000Z"),
      rehearsalDate: null,
    })
    // No existing schedule rows (see the outer beforeEach), so
    // syncLineupSchedules inserts a fresh service-schedule row - its content
    // isn't asserted here, just stubbed so the call doesn't blow up.
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
    const withJoins = { id: "lineup-1", topic: "New topic", members: [] }
    mockDb.query.lineup.findFirst.mockResolvedValue(withJoins)

    const result = await updateLineup("lineup-1", { topic: "New topic" }, "user-1")

    expect(result).toEqual({ ...withJoins, members: [] })
  })

  it("returns undefined without resyncing or re-fetching when no lineup has this id", async () => {
    mockUpdateReturning(undefined)

    expect(await updateLineup("missing", { topic: "X" }, "user-1")).toBeUndefined()
    expect(mockDb.query.schedule.findFirst).not.toHaveBeenCalled()
    expect(mockDb.query.lineup.findFirst).not.toHaveBeenCalled()
  })
})

describe("deleteLineup", () => {
  it("returns false without deleting when no lineup has this id", async () => {
    mockDb.query.lineup.findFirst.mockResolvedValue(undefined)

    expect(await deleteLineup("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the lineup and returns true when found", async () => {
    mockDb.query.lineup.findFirst.mockResolvedValue({ id: "lineup-1" })
    const { where } = mockDeleteWhere()

    expect(await deleteLineup("lineup-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe("addLineupSong", () => {
  it("returns the existing row without inserting when the song is already in the lineup", async () => {
    const existing = { id: "ls-1", lineupId: "lineup-1", songId: "song-1", position: 0 }
    mockDb.query.lineupSong.findFirst.mockResolvedValue(existing)

    const result = await addLineupSong("lineup-1", "song-1")

    expect(result).toBe(existing)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("appends at position 0 when the lineup has no songs yet", async () => {
    mockDb.query.lineupSong.findFirst.mockResolvedValue(undefined)
    mockSelectMaxPosition(null)
    const created = { id: "ls-1", lineupId: "lineup-1", songId: "song-1", position: 0 }
    const { values } = mockInsertReturning(created)

    const result = await addLineupSong("lineup-1", "song-1")

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({ lineupId: "lineup-1", songId: "song-1", position: 0 })
  })

  it("appends after the current highest position", async () => {
    mockDb.query.lineupSong.findFirst.mockResolvedValue(undefined)
    mockSelectMaxPosition(2)
    const created = { id: "ls-2", lineupId: "lineup-1", songId: "song-2", position: 3 }
    const { values } = mockInsertReturning(created)

    await addLineupSong("lineup-1", "song-2")

    expect(values).toHaveBeenCalledWith({ lineupId: "lineup-1", songId: "song-2", position: 3 })
  })
})

describe("removeLineupSong", () => {
  it("returns false without deleting when that (lineup, song) pair doesn't exist", async () => {
    mockDb.query.lineupSong.findFirst.mockResolvedValue(undefined)

    expect(await removeLineupSong("lineup-1", "song-1")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the row and returns true when found", async () => {
    mockDb.query.lineupSong.findFirst.mockResolvedValue({ id: "ls-1" })
    const { where } = mockDeleteWhere()

    expect(await removeLineupSong("lineup-1", "song-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe("addLineupMember", () => {
  it("returns the existing row without inserting when already on the roster", async () => {
    const existing = { id: "lm-1", lineupId: "lineup-1", userId: "user-1" }
    mockDb.query.lineupMember.findFirst.mockResolvedValue(existing)

    const result = await addLineupMember("lineup-1", "user-1")

    expect(result).toBe(existing)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts and returns a new roster row when not already present", async () => {
    mockDb.query.lineupMember.findFirst.mockResolvedValue(undefined)
    const created = { id: "lm-1", lineupId: "lineup-1", userId: "user-1" }
    const { values } = mockInsertReturning(created)

    const result = await addLineupMember("lineup-1", "user-1")

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({ lineupId: "lineup-1", userId: "user-1" })
  })
})

describe("removeLineupMember", () => {
  it("returns false without deleting when no roster row has this id", async () => {
    mockDb.query.lineupMember.findFirst.mockResolvedValue(undefined)

    expect(await removeLineupMember("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the roster row and returns true when found", async () => {
    mockDb.query.lineupMember.findFirst.mockResolvedValue({ id: "lm-1" })
    const { where } = mockDeleteWhere()

    expect(await removeLineupMember("lm-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
