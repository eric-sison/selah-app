import { describe, expect, it } from "vitest"
import { formatTime } from "@/utils/format-time"

describe("formatTime", () => {
  it("returns 0:00 for NaN", () => {
    expect(formatTime(NaN)).toBe("0:00")
  })

  it("returns 0:00 for a negative value", () => {
    expect(formatTime(-5)).toBe("0:00")
  })

  it("returns 0:00 for a non-finite value", () => {
    expect(formatTime(Infinity)).toBe("0:00")
  })

  it("formats zero seconds", () => {
    expect(formatTime(0)).toBe("0:00")
  })

  it("pads seconds under 10", () => {
    expect(formatTime(59)).toBe("0:59")
  })

  it("rolls over to the next minute", () => {
    expect(formatTime(60)).toBe("1:00")
  })

  it("formats minutes and seconds together", () => {
    expect(formatTime(125)).toBe("2:05")
  })

  it("formats durations over an hour as total minutes, not hours:minutes", () => {
    expect(formatTime(3661)).toBe("61:01")
  })
})
