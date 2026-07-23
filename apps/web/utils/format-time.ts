import { intervalToDuration } from "date-fns"

// `intervalToDuration` is timezone-safe here since both endpoints are fixed
// instants (epoch and epoch + duration) - unlike formatting a single `Date`
// with `format(date, "m:ss")`, which reads local wall-clock time and would
// skew for non-whole-hour UTC offsets.
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"

  const duration = intervalToDuration({ start: 0, end: seconds * 1000 })
  const minutes = (duration.hours ?? 0) * 60 + (duration.minutes ?? 0)
  const secs = duration.seconds ?? 0

  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

// Inverse of formatTime - accepts "m:ss" (matching what formatTime itself
// outputs, e.g. from copy-pasting a displayed time back in) or a bare
// integer read as seconds (since that's the more natural thing to type
// without checking the exact expected format first). Anything else,
// including a seconds part outside 0-59, is rejected rather than guessed at.
export function parseTime(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null

  const minutesSecondsMatch = /^(\d+):([0-5]?[0-9])$/.exec(trimmed)
  if (minutesSecondsMatch) {
    return Number(minutesSecondsMatch[1]) * 60 + Number(minutesSecondsMatch[2])
  }

  if (/^\d+$/.test(trimmed)) return Number(trimmed)

  return null
}
