import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    team: { findFirst: vi.fn(), findMany: vi.fn() },
    teamMember: { findFirst: vi.fn() },
    musician: { findMany: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  // createTeam runs everything through db.transaction - since every mock
  // above lives on mockDb itself, running the callback with mockDb as `tx`
  // reuses the exact same insert/query mocks a plain (non-transaction) call
  // would hit.
  transaction: vi.fn((callback: (tx: typeof mockDb) => unknown) => callback(mockDb)),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const { addTeamMember, createTeam, deleteTeam, getTeam, listTeams, removeTeamMember, TeamError, updateTeam } =
  await import("../teams.js")

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

// createTeam issues multiple sequential `insert` calls in team/member order
// (team, then each member) - this queues a distinct `.values()` mock per
// call, in that order, so each insert's arguments and return value can be
// asserted independently.
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

beforeEach(() => {
  // Every member used across these tests ("user-1", "user-2") has a
  // musician profile by default - assertAreMusicians (createTeam,
  // addTeamMember) and attachMemberInstruments (listTeams, getTeam) both
  // query this.
  mockDb.query.musician.findMany.mockResolvedValue([
    { id: "musician-1", userId: "user-1", instruments: [] },
    { id: "musician-2", userId: "user-2", instruments: [] },
  ])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("createTeam", () => {
  it("inserts a team and returns the created row", async () => {
    const created = { id: "team-1", name: "Sunday AM Team", teamLeaderId: null }
    const { values } = mockInsertReturning(created)

    const result = await createTeam({ name: "Sunday AM Team" })

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({
      name: "Sunday AM Team",
      teamLeaderId: undefined,
    })
  })

  it("inserts a team with a designated leader", async () => {
    const created = { id: "team-1", name: "Sunday AM Team", teamLeaderId: "user-1" }
    const { values } = mockInsertReturning(created)

    const result = await createTeam({ name: "Sunday AM Team", teamLeaderId: "user-1" })

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({
      name: "Sunday AM Team",
      teamLeaderId: "user-1",
    })
  })

  it("runs the insert through db.transaction", async () => {
    mockInsertReturning({ id: "team-1", name: "Sunday AM Team" })

    await createTeam({ name: "Sunday AM Team" })

    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
  })

  it("creates a membership row for each member in the input", async () => {
    const createdTeam = { id: "team-1", name: "Sunday AM Team" }
    const createdMember1 = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    const createdMember2 = { id: "tm-2", teamId: "team-1", userId: "user-2" }
    const valuesMocks = mockSequentialInserts([
      { returning: [createdTeam] },
      { returning: [createdMember1] },
      { returning: [createdMember2] },
    ])

    const result = await createTeam({
      name: "Sunday AM Team",
      members: [{ userId: "user-1" }, { userId: "user-2" }],
    })
    const [teamValues, member1Values, member2Values] = valuesMocks

    expect(result).toBe(createdTeam)
    expect(teamValues).toHaveBeenCalledWith({ name: "Sunday AM Team", teamLeaderId: undefined })
    expect(member1Values).toHaveBeenCalledWith({ teamId: "team-1", userId: "user-1" })
    expect(member2Values).toHaveBeenCalledWith({ teamId: "team-1", userId: "user-2" })
    expect(mockDb.insert).toHaveBeenCalledTimes(3)
  })

  it("throws a TeamError without inserting when a member has no musician profile", async () => {
    mockDb.query.musician.findMany.mockResolvedValue([])

    await expect(createTeam({ name: "Sunday AM Team", members: [{ userId: "user-1" }] })).rejects.toThrow(
      TeamError
    )
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("listTeams", () => {
  it("returns every team joined with its leader and members, each with their current instruments", async () => {
    const rows = [
      {
        id: "team-1",
        name: "Sunday AM Team",
        leader: null,
        members: [{ id: "tm-1", user: { id: "user-1", name: "Ben", image: null } }],
      },
    ]
    mockDb.query.team.findMany.mockResolvedValue(rows)
    mockDb.query.musician.findMany.mockResolvedValue([
      { id: "musician-1", userId: "user-1", instruments: ["bass"] },
    ])

    const result = await listTeams()

    expect(result).toEqual([
      {
        id: "team-1",
        name: "Sunday AM Team",
        leader: null,
        members: [
          {
            id: "tm-1",
            user: { id: "user-1", name: "Ben", image: null },
            musicianId: "musician-1",
            instruments: ["bass"],
          },
        ],
      },
    ])
    expect(mockDb.query.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: {
          leader: { columns: { id: true, name: true, image: true } },
          members: {
            with: {
              user: { columns: { id: true, name: true, image: true } },
            },
          },
        },
      })
    )
  })
})

describe("getTeam", () => {
  it("returns the team with this id, joined with members and their current instruments", async () => {
    const row = { id: "team-1", name: "Sunday AM Team", members: [] }
    mockDb.query.team.findFirst.mockResolvedValue(row)

    expect(await getTeam("team-1")).toEqual({ ...row, members: [] })
  })

  it("returns undefined when no team has this id", async () => {
    mockDb.query.team.findFirst.mockResolvedValue(undefined)

    expect(await getTeam("missing")).toBeUndefined()
  })
})

describe("updateTeam", () => {
  it("updates the team and returns the updated row", async () => {
    const updated = { id: "team-1", name: "Renamed Team" }
    const { set, where } = mockUpdateReturning(updated)

    const result = await updateTeam("team-1", { name: "Renamed Team" })

    expect(result).toBe(updated)
    expect(set).toHaveBeenCalledWith({ name: "Renamed Team" })
    expect(where).toHaveBeenCalledTimes(1)
  })

  it("returns undefined when no team has this id", async () => {
    mockUpdateReturning(undefined)

    expect(await updateTeam("missing", { name: "X" })).toBeUndefined()
  })
})

describe("deleteTeam", () => {
  it("returns false without deleting when no team has this id", async () => {
    mockDb.query.team.findFirst.mockResolvedValue(undefined)

    expect(await deleteTeam("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the team and returns true when found", async () => {
    mockDb.query.team.findFirst.mockResolvedValue({ id: "team-1" })
    const { where } = mockDeleteWhere()

    expect(await deleteTeam("team-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe("addTeamMember", () => {
  it("returns the existing membership without inserting when the user is already a member", async () => {
    const existing = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    mockDb.query.teamMember.findFirst.mockResolvedValue(existing)

    const result = await addTeamMember("team-1", "user-1")

    expect(result).toBe(existing)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts and returns a new membership when the user isn't already a member", async () => {
    mockDb.query.teamMember.findFirst.mockResolvedValue(undefined)
    const created = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    const { values } = mockInsertReturning(created)

    const result = await addTeamMember("team-1", "user-1")

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({ teamId: "team-1", userId: "user-1" })
  })

  it("throws a TeamError without inserting when the user has no musician profile", async () => {
    mockDb.query.teamMember.findFirst.mockResolvedValue(undefined)
    mockDb.query.musician.findMany.mockResolvedValue([])

    await expect(addTeamMember("team-1", "user-1")).rejects.toThrow(TeamError)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("removeTeamMember", () => {
  it("returns false without deleting when no membership has this id", async () => {
    mockDb.query.teamMember.findFirst.mockResolvedValue(undefined)

    expect(await removeTeamMember("missing")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the membership and returns true when found", async () => {
    mockDb.query.teamMember.findFirst.mockResolvedValue({ id: "tm-1" })
    const { where } = mockDeleteWhere()

    expect(await removeTeamMember("tm-1")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
