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
