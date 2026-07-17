import { describe, expect, it } from "vitest"
import { formatInstrument, INSTRUMENTS } from "@/utils/instruments"

describe("formatInstrument", () => {
  it("capitalizes a single-word instrument", () => {
    expect(formatInstrument("bass")).toBe("Bass")
  })

  it("capitalizes each word of an underscore-separated instrument", () => {
    expect(formatInstrument("electric_guitar")).toBe("Electric Guitar")
  })

  it("formats every member of INSTRUMENTS without throwing", () => {
    for (const instrument of INSTRUMENTS) {
      expect(formatInstrument(instrument)).toMatch(/^[A-Z]/)
    }
  })
})

describe("INSTRUMENTS", () => {
  it("contains the six known instruments", () => {
    expect(INSTRUMENTS).toEqual(["bass", "drums", "singer", "electric_guitar", "acoustic_guitar", "keyboard"])
  })
})
