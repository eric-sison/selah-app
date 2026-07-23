import type { StemName } from "@/utils/stems"

// How far a follower stem's playback position may drift from the leader's
// before it gets hard-corrected (see SongPlayerProvider's stems-mode
// `timeupdate` handler). Below ~15-20ms, drift between tracks is generally
// inaudible - comparable to natural phase/latency differences in live sound.
// Correcting on every single `timeupdate` tick (which fires ~4x/sec) would
// itself cause audible micro-stutters from constant seeking, so this needs
// enough slack to only fire occasionally. 100ms splits that difference -
// tune by ear if it needs adjusting once real playback can be tested.
export const STEM_DRIFT_THRESHOLD_SECONDS = 0.1

/**
 * Compares each follower stem's current playback position against the
 * leader's and returns which ones have drifted far enough to need a hard
 * `currentTime` correction, and to what value.
 *
 * A pure function (no DOM/`<audio>` access) so the threshold/comparison
 * logic is unit-testable on its own - the caller is responsible for reading
 * real element `currentTime`s and applying whatever corrections come back.
 *
 * @param thresholdSeconds - exclusive: drift exactly equal to this is not corrected.
 */
export function computeDriftCorrections(
  leaderTime: number,
  followerTimes: Partial<Record<StemName, number>>,
  thresholdSeconds: number = STEM_DRIFT_THRESHOLD_SECONDS
): Partial<Record<StemName, number>> {
  const corrections: Partial<Record<StemName, number>> = {}

  for (const [stem, time] of Object.entries(followerTimes) as [StemName, number][]) {
    if (Math.abs(time - leaderTime) > thresholdSeconds) {
      corrections[stem] = leaderTime
    }
  }

  return corrections
}
