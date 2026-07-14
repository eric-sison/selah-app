import { describe, expect, it } from "vitest"
import { transposeChord, transposeKey } from "@/utils/transpose-key"

describe("transposeKey", () => {
  it("returns null for a null key", () => {
    expect(transposeKey(null, 3)).toBeNull()
  })

  it("returns null for a key not on the chromatic scale", () => {
    expect(transposeKey("H", 1)).toBeNull()
    expect(transposeKey("Cb", 1)).toBeNull()
  })

  it("transposes a sharp key up", () => {
    expect(transposeKey("C", 2)).toBe("D")
  })

  it("wraps around the top of the scale", () => {
    expect(transposeKey("B", 1)).toBe("C")
  })

  it("wraps around going negative", () => {
    expect(transposeKey("C", -1)).toBe("B")
  })

  it("normalizes a flat spelling to its sharp equivalent", () => {
    expect(transposeKey("Db", 0)).toBe("C#")
    expect(transposeKey("Bb", 0)).toBe("A#")
  })

  it("wraps correctly for semitone offsets beyond a full octave", () => {
    expect(transposeKey("C", 14)).toBe("D")
    expect(transposeKey("C", -14)).toBe("A#")
  })

  it("returns the same key for zero semitones", () => {
    expect(transposeKey("G", 0)).toBe("G")
  })
})

describe("transposeChord", () => {
  it("transposes a bare root chord", () => {
    expect(transposeChord("C", 2)).toBe("D")
  })

  it("transposes a root with a quality/extension suffix, leaving the suffix untouched", () => {
    expect(transposeChord("Am7", 2)).toBe("Bm7")
    expect(transposeChord("F#m", 1)).toBe("Gm")
  })

  it("normalizes a flat root even with zero transposition", () => {
    expect(transposeChord("Bbmaj7", 0)).toBe("A#maj7")
  })

  it("transposes both the root and bass note of a slash chord", () => {
    expect(transposeChord("G/B", 2)).toBe("A/C#")
  })

  it("transposes a slash chord with a quality suffix on the root", () => {
    expect(transposeChord("Csus4/G", 2)).toBe("Dsus4/A")
  })

  it("returns the chord unchanged when it has no root at all", () => {
    expect(transposeChord("", 3)).toBe("")
  })

  it("returns the chord unchanged when it doesn't start with a valid note letter", () => {
    expect(transposeChord("Xyz", 2)).toBe("Xyz")
  })

  it("returns the chord unchanged when the root isn't a recognized pitch (e.g. Cb)", () => {
    expect(transposeChord("Cbsus2", 2)).toBe("Cbsus2")
  })
})
