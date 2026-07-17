import { describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    schedule: { findMany: vi.fn() },
  },
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const { listSchedules } = await import("../schedules.js")

describe("listSchedules", () => {
  it("returns every schedule entry ordered by startAt, joined with its lineup", async () => {
    const rows = [
      { id: "schedule-1", startAt: "2026-07-19T09:00:00.000Z", lineup: null },
      {
        id: "schedule-2",
        startAt: "2026-07-20T09:00:00.000Z",
        lineup: { id: "lineup-1", seriesName: "When We Gather", topic: "Sermon" },
      },
    ]
    mockDb.query.schedule.findMany.mockResolvedValue(rows)

    const result = await listSchedules()

    expect(result).toBe(rows)
    expect(mockDb.query.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { lineup: { columns: { id: true, seriesName: true, topic: true } } },
      })
    )
  })
})
