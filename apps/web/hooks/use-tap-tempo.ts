import { useRef, useState } from "react"

// A tap arriving this long after the previous one isn't a continuation of
// the same beat - it starts a fresh sequence instead of blending a huge
// gap into the average.
const TAP_TIMEOUT_MS = 2000
// Only the most recent taps are averaged, so the estimate tracks a tempo
// change (or an early mis-tap) instead of being dragged down by a long tap
// history.
const MAX_TAP_HISTORY = 8

const MIN_BPM = 30
const MAX_BPM = 300

export interface UseTapTempoResult {
  bpm: number | null
  tapCount: number
  tap: () => void
  reset: () => void
  setBpm: (bpm: number) => void
}

function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)))
}

/**
 * Classic "tap tempo": average the interval between recent taps into a BPM.
 *
 * @param initialBpm - seeds `bpm` with an already-known tempo (e.g. a song's
 *   saved value) instead of starting blank - also what `reset()` reverts to,
 *   so clearing a tap sequence doesn't throw away a tempo that was already
 *   on record.
 */
export function useTapTempo(initialBpm: number | null = null): UseTapTempoResult {
  const [bpm, setBpmState] = useState<number | null>(initialBpm !== null ? clampBpm(initialBpm) : null)
  const [tapCount, setTapCount] = useState(0)
  const tapTimestampsRef = useRef<number[]>([])

  const tap = () => {
    const now = performance.now()
    const timestamps = tapTimestampsRef.current

    const previousTap = timestamps[timestamps.length - 1]
    if (previousTap !== undefined && now - previousTap > TAP_TIMEOUT_MS) {
      timestamps.length = 0
    }

    timestamps.push(now)
    if (timestamps.length > MAX_TAP_HISTORY) timestamps.shift()
    setTapCount(timestamps.length)

    if (timestamps.length < 2) return

    let totalIntervalMs = 0
    for (let i = 1; i < timestamps.length; i++) {
      totalIntervalMs += timestamps[i]! - timestamps[i - 1]!
    }
    const averageIntervalMs = totalIntervalMs / (timestamps.length - 1)
    const nextBpm = Math.round(60000 / averageIntervalMs)
    setBpmState(clampBpm(nextBpm))
  }

  const reset = () => {
    tapTimestampsRef.current = []
    setTapCount(0)
    setBpmState(initialBpm !== null ? clampBpm(initialBpm) : null)
  }

  const setBpm = (nextBpm: number) => {
    setBpmState(clampBpm(nextBpm))
  }

  return { bpm, tapCount, tap, reset, setBpm }
}
