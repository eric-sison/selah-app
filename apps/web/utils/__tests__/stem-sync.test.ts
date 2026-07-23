import { describe, expect, it } from "vitest"
import { computeDriftCorrections, STEM_DRIFT_THRESHOLD_SECONDS } from "@/utils/stem-sync"

describe("computeDriftCorrections", () => {
  it("returns no corrections when every follower matches the leader exactly", () => {
    expect(computeDriftCorrections(10, { drums: 10, bass: 10, other: 10 })).toEqual({})
  })

  it("returns no corrections when drift is under the threshold", () => {
    expect(computeDriftCorrections(10, { drums: 10.05 })).toEqual({})
  })

  it("does not correct drift exactly at the threshold (exclusive)", () => {
    expect(computeDriftCorrections(10, { drums: 10 + STEM_DRIFT_THRESHOLD_SECONDS })).toEqual({})
  })

  it("corrects drift just over the threshold, to the leader's time", () => {
    expect(computeDriftCorrections(10, { drums: 10 + STEM_DRIFT_THRESHOLD_SECONDS + 0.001 })).toEqual({
      drums: 10,
    })
  })

  it("corrects a follower that is ahead of the leader (negative drift)", () => {
    expect(computeDriftCorrections(10, { drums: 10.5 })).toEqual({ drums: 10 })
  })

  it("corrects multiple followers drifting simultaneously, leaving in-sync ones alone", () => {
    expect(
      computeDriftCorrections(10, { drums: 10.5, bass: 10, other: 9.4 })
    ).toEqual({ drums: 10, other: 10 })
  })

  it("respects a custom threshold", () => {
    expect(computeDriftCorrections(10, { drums: 10.02 }, 0.01)).toEqual({ drums: 10 })
    expect(computeDriftCorrections(10, { drums: 10.02 }, 0.05)).toEqual({})
  })
})
