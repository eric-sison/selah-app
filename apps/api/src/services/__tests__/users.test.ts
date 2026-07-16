import { describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    users: { findMany: vi.fn() },
  },
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const { listUsers } = await import("../users.js")

describe("listUsers", () => {
  it("returns every user, ordered by name", async () => {
    const rows = [
      { id: "user-1", name: "Ava Lim", email: "ava@example.com", image: null },
      { id: "user-2", name: "Ben Ortega", email: "ben@example.com", image: null },
    ]
    mockDb.query.users.findMany.mockResolvedValue(rows)

    expect(await listUsers()).toBe(rows)
    expect(mockDb.query.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { id: true, name: true, email: true, image: true },
      })
    )
  })
})
