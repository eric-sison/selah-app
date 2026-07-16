import { afterEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    team: { findFirst: vi.fn(), findMany: vi.fn() },
    teamMember: { findFirst: vi.fn() },
    teamMemberRole: { findFirst: vi.fn() },
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

const {
  addTeamMember,
  addTeamMemberRole,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  removeTeamMember,
  removeTeamMemberRole,
  updateTeam,
} = await import("../teams.js")

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

// createTeam issues multiple sequential `insert` calls in member/role order
// (team, then each member, then each member's roles) - this queues a
// distinct `.values()` mock per call, in that order, so each insert's
// arguments and return value can be asserted independently.
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

  it("creates a member with role assignments in the same transaction", async () => {
    const createdTeam = { id: "team-1", name: "Sunday AM Team" }
    const createdMember = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    const valuesMocks = mockSequentialInserts([
      { returning: [createdTeam] },
      { returning: [createdMember] },
      { resolveValue: undefined },
    ])

    const result = await createTeam({
      name: "Sunday AM Team",
      members: [{ userId: "user-1", roles: ["bass", "singer"] }],
    })
    const [teamValues, memberValues, roleValues] = valuesMocks

    expect(result).toBe(createdTeam)
    expect(teamValues).toHaveBeenCalledWith({ name: "Sunday AM Team", teamLeaderId: undefined })
    expect(memberValues).toHaveBeenCalledWith({ teamId: "team-1", userId: "user-1" })
    expect(roleValues).toHaveBeenCalledWith([
      { teamMemberId: "tm-1", role: "bass" },
      { teamMemberId: "tm-1", role: "singer" },
    ])
  })

  it("adds a member without inserting any roles when none are given", async () => {
    const createdTeam = { id: "team-1", name: "Sunday AM Team" }
    const createdMember = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    mockSequentialInserts([{ returning: [createdTeam] }, { returning: [createdMember] }])

    await createTeam({ name: "Sunday AM Team", members: [{ userId: "user-1" }] })

    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })

  it("de-dupes repeated roles for the same member before inserting", async () => {
    const createdTeam = { id: "team-1", name: "Sunday AM Team" }
    const createdMember = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    const valuesMocks = mockSequentialInserts([
      { returning: [createdTeam] },
      { returning: [createdMember] },
      { resolveValue: undefined },
    ])

    await createTeam({
      name: "Sunday AM Team",
      members: [{ userId: "user-1", roles: ["bass", "bass"] }],
    })

    expect(valuesMocks[2]).toHaveBeenCalledWith([{ teamMemberId: "tm-1", role: "bass" }])
  })

  it("creates a membership row for each member in the input", async () => {
    const createdTeam = { id: "team-1", name: "Sunday AM Team" }
    const createdMember1 = { id: "tm-1", teamId: "team-1", userId: "user-1" }
    const createdMember2 = { id: "tm-2", teamId: "team-1", userId: "user-2" }
    mockSequentialInserts([
      { returning: [createdTeam] },
      { returning: [createdMember1] },
      { returning: [createdMember2] },
    ])

    await createTeam({
      name: "Sunday AM Team",
      members: [{ userId: "user-1" }, { userId: "user-2" }],
    })

    expect(mockDb.insert).toHaveBeenCalledTimes(3)
  })
})

describe("listTeams", () => {
  it("returns every team joined with its leader, members, their user info, and roles", async () => {
    const rows = [{ id: "team-1", name: "Sunday AM Team", leader: null, members: [] }]
    mockDb.query.team.findMany.mockResolvedValue(rows)

    expect(await listTeams()).toBe(rows)
    expect(mockDb.query.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: {
          leader: { columns: { id: true, name: true, image: true } },
          members: {
            with: {
              user: { columns: { id: true, name: true, image: true } },
              roles: true,
            },
          },
        },
      })
    )
  })
})

describe("getTeam", () => {
  it("returns the team with this id, joined with members", async () => {
    const row = { id: "team-1", name: "Sunday AM Team", members: [] }
    mockDb.query.team.findFirst.mockResolvedValue(row)

    expect(await getTeam("team-1")).toBe(row)
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

describe("addTeamMemberRole", () => {
  it("returns the existing role assignment without inserting when already assigned", async () => {
    const existing = { id: "tmr-1", teamMemberId: "tm-1", role: "bass" }
    mockDb.query.teamMemberRole.findFirst.mockResolvedValue(existing)

    const result = await addTeamMemberRole("tm-1", "bass")

    expect(result).toBe(existing)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts and returns a new role assignment when not already assigned", async () => {
    mockDb.query.teamMemberRole.findFirst.mockResolvedValue(undefined)
    const created = { id: "tmr-1", teamMemberId: "tm-1", role: "bass" }
    const { values } = mockInsertReturning(created)

    const result = await addTeamMemberRole("tm-1", "bass")

    expect(result).toBe(created)
    expect(values).toHaveBeenCalledWith({ teamMemberId: "tm-1", role: "bass" })
  })
})

describe("removeTeamMemberRole", () => {
  it("returns false without deleting when that (member, role) pair doesn't exist", async () => {
    mockDb.query.teamMemberRole.findFirst.mockResolvedValue(undefined)

    expect(await removeTeamMemberRole("tm-1", "bass")).toBe(false)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("deletes the role assignment and returns true when found", async () => {
    mockDb.query.teamMemberRole.findFirst.mockResolvedValue({ id: "tmr-1" })
    const { where } = mockDeleteWhere()

    expect(await removeTeamMemberRole("tm-1", "bass")).toBe(true)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
