import { describe, expect, it } from "vitest"
import { formatLineupServiceType, LINEUP_SERVICE_TYPES } from "@/utils/lineup-service-type"

describe("formatLineupServiceType", () => {
  it("capitalizes a single-word service type", () => {
    expect(formatLineupServiceType("other")).toBe("Other")
  })

  it("capitalizes each word of an underscore-separated service type", () => {
    expect(formatLineupServiceType("sunday_service")).toBe("Sunday Service")
  })

  it("formats every member of LINEUP_SERVICE_TYPES without throwing", () => {
    for (const type of LINEUP_SERVICE_TYPES) {
      expect(formatLineupServiceType(type)).toMatch(/^[A-Z]/)
    }
  })
})

describe("LINEUP_SERVICE_TYPES", () => {
  it("contains the six known service types", () => {
    expect(LINEUP_SERVICE_TYPES).toEqual([
      "sunday_service",
      "youth_service",
      "necrological_service",
      "prayer_meeting_service",
      "victory_day",
      "other",
    ])
  })
})
