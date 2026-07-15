export interface ChordProSegment {
  chord: string | null
  text: string
}

export type ChordProLine =
  | { type: "section"; label: string }
  | { type: "directive"; name: string; value: string | null }
  | { type: "blank" }
  | { type: "lyric"; segments: ChordProSegment[] }

// A whole line that's just one bracket tag (e.g. "[Verse 1]") is a section
// header - distinct from a `[Chord]` token inline within a lyric line.
const SECTION_HEADER_REGEX = /^\[([^\]]+)\]$/
// ChordPro's real metadata syntax - e.g. "{capo: 2}", "{title: Amazing
// Grace}", or a bare "{soc}" with no value. Never rendered as lyric text;
// unrecognized directive names are parsed the same way and just ignored by
// callers, so a stray {title: ...} doesn't fall through and render as
// garbled lyrics either.
const DIRECTIVE_REGEX = /^\{\s*([a-zA-Z][\w-]*)\s*(?::\s*(.*?))?\s*\}$/
const CHORD_TOKEN_REGEX = /\[([^\]]+)\]/g

function parseLyricLine(line: string): ChordProSegment[] {
  const segments: ChordProSegment[] = []
  let lastIndex = 0
  let currentChord: string | null = null
  let match: RegExpExecArray | null

  CHORD_TOKEN_REGEX.lastIndex = 0
  while ((match = CHORD_TOKEN_REGEX.exec(line)) !== null) {
    const textBefore = line.slice(lastIndex, match.index)
    if (textBefore || currentChord !== null) {
      segments.push({ chord: currentChord, text: textBefore })
    }
    // match[1] is typed string | undefined (noUncheckedIndexedAccess), but
    // the regex's `+` quantifier guarantees a non-empty capture whenever the
    // pattern matches at all - the `?? null` fallback is unreachable.
    /* v8 ignore next */
    currentChord = match[1] ?? null
    lastIndex = CHORD_TOKEN_REGEX.lastIndex
  }

  segments.push({ chord: currentChord, text: line.slice(lastIndex) })

  return segments
}

export function parseChordPro(raw: string): ChordProLine[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line): ChordProLine => {
      const trimmed = line.trim()
      if (trimmed === "") return { type: "blank" }

      const sectionMatch = SECTION_HEADER_REGEX.exec(trimmed)
      if (sectionMatch?.[1]) return { type: "section", label: sectionMatch[1] }

      const directiveMatch = DIRECTIVE_REGEX.exec(trimmed)
      if (directiveMatch?.[1]) {
        return {
          type: "directive",
          name: directiveMatch[1].toLowerCase(),
          value: directiveMatch[2]?.trim() ?? null,
        }
      }

      return { type: "lyric", segments: parseLyricLine(line) }
    })
}

// Reads a ChordPro {capo: N} directive's declared fret, if one exists -
// the first one found, ignoring malformed/negative/non-numeric values.
// Callers clamp this into whatever UI range they support.
export function getDeclaredCapo(lines: ChordProLine[]): number | null {
  for (const line of lines) {
    if (line.type !== "directive" || line.name !== "capo") continue

    const parsed = line.value === null ? NaN : Number.parseInt(line.value, 10)
    if (Number.isInteger(parsed) && parsed >= 0) return parsed
  }
  return null
}

// Reads a ChordPro {transpose: N} directive's declared semitone offset, if
// one exists - the first one found, ignoring malformed/non-numeric values.
// Unlike capo, a transpose value can be negative (down) as well as positive
// (up), so there's no lower-bound check here. Callers clamp this into
// whatever UI range they support.
export function getDeclaredTranspose(lines: ChordProLine[]): number | null {
  for (const line of lines) {
    if (line.type !== "directive" || line.name !== "transpose") continue

    const parsed = line.value === null ? NaN : Number.parseInt(line.value, 10)
    if (Number.isInteger(parsed)) return parsed
  }
  return null
}
