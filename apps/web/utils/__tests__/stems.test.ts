import { describe, expect, it } from "vitest"
import { STEM_NAMES } from "@/utils/stems"

describe("STEM_NAMES", () => {
  it("lists all 6 stem names in a fixed order", () => {
    expect(STEM_NAMES).toEqual(["vocals", "drums", "bass", "guitar", "piano", "other"])
  })
})
