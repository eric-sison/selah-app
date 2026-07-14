const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// Common flat spellings normalized to the same chromatic index - output is
// always spelled with sharps. Full key-signature-correct enharmonic
// spelling (preferring flats for some keys) is real music-theory work out
// of scope here; it doesn't affect the actual audio pitch-shift, only the
// label.
const FLAT_ALIASES: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
}

export function transposeKey(key: string | null, semitones: number): string | null {
  if (!key) return null

  const normalized = FLAT_ALIASES[key] ?? key
  const index = CHROMATIC_SCALE.indexOf(normalized)
  if (index === -1) return null

  const transposedIndex = (((index + semitones) % 12) + 12) % 12
  return CHROMATIC_SCALE[transposedIndex] ?? null
}

// Matches a chord's root note (e.g. "C", "F#", "Bb") at the start of a
// root-or-bass part, capturing everything after it (quality/extensions,
// e.g. "m7", "maj7", "sus4") as a suffix that's carried through unchanged.
const CHORD_ROOT_REGEX = /^([A-G][#b]?)(.*)$/

function transposeChordPart(part: string, semitones: number): string {
  const match = CHORD_ROOT_REGEX.exec(part)
  if (!match?.[1]) return part

  const [, root, suffix] = match
  const transposedRoot = transposeKey(root, semitones)
  return transposedRoot ? `${transposedRoot}${suffix}` : part
}

// Transposes a full ChordPro chord token (e.g. "Am7", "C#sus4", "G/B" slash
// chords) by re-spelling only its root (and bass note, if present) and
// leaving the quality/extension suffix untouched.
export function transposeChord(chord: string, semitones: number): string {
  const [root, bass] = chord.split("/")
  if (!root) return chord

  const transposedRoot = transposeChordPart(root, semitones)
  if (bass === undefined) return transposedRoot

  return `${transposedRoot}/${transposeChordPart(bass, semitones)}`
}
