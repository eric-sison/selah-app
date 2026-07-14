export interface ChordProSegment {
  chord: string | null
  text: string
}

export type ChordProLine =
  | { type: "section"; label: string }
  | { type: "blank" }
  | { type: "lyric"; segments: ChordProSegment[] }

// A whole line that's just one bracket tag (e.g. "[Verse 1]") is a section
// header - distinct from a `[Chord]` token inline within a lyric line.
const SECTION_HEADER_REGEX = /^\[([^\]]+)\]$/
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

      return { type: "lyric", segments: parseLyricLine(line) }
    })
}
