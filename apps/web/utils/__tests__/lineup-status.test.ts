import { describe, expect, it } from "vitest"
import { LINEUP_STATUS_LABELS } from "@/utils/lineup-status"

describe("LINEUP_STATUS_LABELS", () => {
  it("maps each lineup status to a human-readable label", () => {
    expect(LINEUP_STATUS_LABELS).toEqual({
      draft: "Draft",
      pending: "Pending",
      approved: "Approved",
    })
  })
})
