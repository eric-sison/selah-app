import { describe, expect, it } from "vitest"
import { getDeclaredCapo, getDeclaredTranspose, parseChordPro } from "@/utils/chordpro"

describe("parseChordPro", () => {
  it("treats an empty/whitespace-only line as blank", () => {
    expect(parseChordPro("")).toEqual([{ type: "blank" }])
    expect(parseChordPro("   ")).toEqual([{ type: "blank" }])
  })

  it("treats a line that is only a bracket tag as a section header", () => {
    expect(parseChordPro("[Verse 1]")).toEqual([{ type: "section", label: "Verse 1" }])
  })

  it("trims surrounding whitespace when detecting a section header", () => {
    expect(parseChordPro("  [Chorus]  ")).toEqual([{ type: "section", label: "Chorus" }])
  })

  it("does not treat a bracket tag followed by other text as a section header", () => {
    const [line] = parseChordPro("[Verse 1] extra")
    expect(line).toEqual({
      type: "lyric",
      segments: [{ chord: "Verse 1", text: " extra" }],
    })
  })

  it("parses a plain lyric line with no chords as a single null-chord segment", () => {
    expect(parseChordPro("no chords here")).toEqual([
      { type: "lyric", segments: [{ chord: null, text: "no chords here" }] },
    ])
  })

  it("parses a chord token appearing before any lyric text", () => {
    expect(parseChordPro("[C]Hello world")).toEqual([
      { type: "lyric", segments: [{ chord: "C", text: "Hello world" }] },
    ])
  })

  it("parses lyric text before the first chord token", () => {
    expect(parseChordPro("Hello [C]world")).toEqual([
      {
        type: "lyric",
        segments: [
          { chord: null, text: "Hello " },
          { chord: "C", text: "world" },
        ],
      },
    ])
  })

  it("parses two adjacent chord tokens with no text between them", () => {
    expect(parseChordPro("[C][G]word")).toEqual([
      {
        type: "lyric",
        segments: [
          { chord: "C", text: "" },
          { chord: "G", text: "word" },
        ],
      },
    ])
  })

  it("parses multiple chords spread across a line", () => {
    expect(parseChordPro("[G]Amazing [C]grace, how [G]sweet")).toEqual([
      {
        type: "lyric",
        segments: [
          { chord: "G", text: "Amazing " },
          { chord: "C", text: "grace, how " },
          { chord: "G", text: "sweet" },
        ],
      },
    ])
  })

  it("preserves leading/trailing whitespace within a lyric line (unlike section detection)", () => {
    expect(parseChordPro("  [C]padded  ")).toEqual([
      {
        type: "lyric",
        segments: [
          { chord: null, text: "  " },
          { chord: "C", text: "padded  " },
        ],
      },
    ])
  })

  it("normalizes CRLF line endings before splitting", () => {
    expect(parseChordPro("[Verse 1]\r\n[C]line two")).toEqual([
      { type: "section", label: "Verse 1" },
      { type: "lyric", segments: [{ chord: "C", text: "line two" }] },
    ])
  })

  it("parses a full multi-line chart with sections, lyrics, and blanks", () => {
    const raw = "[Verse 1]\n[G]Amazing [C]grace\n\n[Chorus]"
    expect(parseChordPro(raw)).toEqual([
      { type: "section", label: "Verse 1" },
      {
        type: "lyric",
        segments: [
          { chord: "G", text: "Amazing " },
          { chord: "C", text: "grace" },
        ],
      },
      { type: "blank" },
      { type: "section", label: "Chorus" },
    ])
  })

  it("does not leak regex state across separate calls", () => {
    // CHORD_TOKEN_REGEX is a module-level `g` regex reset via lastIndex=0
    // before each line - calling parseChordPro repeatedly must not skip
    // matches due to stale lastIndex from a previous call.
    parseChordPro("[C]first")
    expect(parseChordPro("[G]second")).toEqual([
      { type: "lyric", segments: [{ chord: "G", text: "second" }] },
    ])
  })

  it("parses a directive line with a value", () => {
    expect(parseChordPro("{capo: 2}")).toEqual([{ type: "directive", name: "capo", value: "2" }])
  })

  it("lowercases the directive name but preserves the value's casing", () => {
    expect(parseChordPro("{Title: Amazing Grace}")).toEqual([
      { type: "directive", name: "title", value: "Amazing Grace" },
    ])
  })

  it("parses a bare directive with no value as null", () => {
    expect(parseChordPro("{soc}")).toEqual([{ type: "directive", name: "soc", value: null }])
  })

  it("trims whitespace around a directive's name and value", () => {
    expect(parseChordPro("{  capo :  2  }")).toEqual([{ type: "directive", name: "capo", value: "2" }])
  })

  it("does not treat a bracket tag as a directive (braces vs. brackets are distinct syntax)", () => {
    expect(parseChordPro("[capo: 2]")).toEqual([{ type: "section", label: "capo: 2" }])
  })
})

describe("getDeclaredCapo", () => {
  it("returns the declared fret from a {capo: N} directive", () => {
    expect(getDeclaredCapo(parseChordPro("{capo: 3}\n[D]Test"))).toBe(3)
  })

  it("returns null when there is no capo directive", () => {
    expect(getDeclaredCapo(parseChordPro("[D]Test"))).toBeNull()
  })

  it("returns null for a bare {capo} directive with no value", () => {
    expect(getDeclaredCapo(parseChordPro("{capo}"))).toBeNull()
  })

  it("ignores a non-numeric capo value", () => {
    expect(getDeclaredCapo(parseChordPro("{capo: banana}"))).toBeNull()
  })

  it("ignores a negative capo value", () => {
    expect(getDeclaredCapo(parseChordPro("{capo: -1}"))).toBeNull()
  })

  it("ignores unrecognized directives entirely", () => {
    expect(getDeclaredCapo(parseChordPro("{title: Amazing Grace}\n[D]Test"))).toBeNull()
  })

  it("uses the first valid capo directive when multiple are present", () => {
    expect(getDeclaredCapo(parseChordPro("{capo: 2}\n{capo: 5}"))).toBe(2)
  })
})

describe("getDeclaredTranspose", () => {
  it("returns the declared offset from a {transpose: N} directive", () => {
    expect(getDeclaredTranspose(parseChordPro("{transpose: 3}\n[D]Test"))).toBe(3)
  })

  it("returns a negative declared offset (transpose can go down, unlike capo)", () => {
    expect(getDeclaredTranspose(parseChordPro("{transpose: -2}\n[D]Test"))).toBe(-2)
  })

  it("returns null when there is no transpose directive", () => {
    expect(getDeclaredTranspose(parseChordPro("[D]Test"))).toBeNull()
  })

  it("returns null for a bare {transpose} directive with no value", () => {
    expect(getDeclaredTranspose(parseChordPro("{transpose}"))).toBeNull()
  })

  it("ignores a non-numeric transpose value", () => {
    expect(getDeclaredTranspose(parseChordPro("{transpose: banana}"))).toBeNull()
  })

  it("ignores unrecognized directives entirely", () => {
    expect(getDeclaredTranspose(parseChordPro("{title: Amazing Grace}\n[D]Test"))).toBeNull()
  })

  it("uses the first valid transpose directive when multiple are present", () => {
    expect(getDeclaredTranspose(parseChordPro("{transpose: 2}\n{transpose: 5}"))).toBe(2)
  })
})
