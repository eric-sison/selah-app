import { describe, expect, it } from "vitest"
import { formatTeamRole, TEAM_ROLES } from "@/utils/team-roles"

describe("formatTeamRole", () => {
  it("capitalizes a single-word role", () => {
    expect(formatTeamRole("bass")).toBe("Bass")
  })

  it("capitalizes each word of an underscore-separated role", () => {
    expect(formatTeamRole("electric_guitar")).toBe("Electric Guitar")
  })

  it("formats every member of TEAM_ROLES without throwing", () => {
    for (const role of TEAM_ROLES) {
      expect(formatTeamRole(role)).toMatch(/^[A-Z]/)
    }
  })
})

describe("TEAM_ROLES", () => {
  it("contains the six known team roles", () => {
    expect(TEAM_ROLES).toEqual(["bass", "drums", "singer", "electric_guitar", "acoustic_guitar", "keyboard"])
  })
})
