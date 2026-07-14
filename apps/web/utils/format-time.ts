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
