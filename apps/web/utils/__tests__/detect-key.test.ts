import { describe, expect, it } from "vitest"
import { computeChroma, detectKeyFromAudioBuffer, detectKeyFromChroma } from "@/utils/detect-key"

const MAJOR_KEY_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]

function rotate(profile: number[], rootPitchClass: number): number[] {
  return Array.from({ length: 12 }, (_, i) => profile[(i - rootPitchClass + 12) % 12]!)
}

function sineSamples(frequencyHz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate)
  }
  return samples
}

function createAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer
}

describe("detectKeyFromChroma", () => {
  it("returns null for an all-zero chroma vector", () => {
    expect(detectKeyFromChroma(new Array(12).fill(0))).toBeNull()
  })

  it("returns null when given the wrong number of pitch classes", () => {
    expect(detectKeyFromChroma([1, 2, 3])).toBeNull()
  })

  it("picks C as the root when the chroma matches the C major profile shape", () => {
    expect(detectKeyFromChroma(MAJOR_KEY_PROFILE)).toBe("C")
  })

  it("picks G as the root when the major profile shape is rotated to root at G", () => {
    expect(detectKeyFromChroma(rotate(MAJOR_KEY_PROFILE, 7))).toBe("G")
  })

  it("picks A as the root when the major profile shape is rotated to root at A", () => {
    expect(detectKeyFromChroma(rotate(MAJOR_KEY_PROFILE, 9))).toBe("A")
  })

  it("doesn't throw and picks the first root when every pitch class has equal (nonzero) energy", () => {
    // Every profile correlates at 0 (zero chroma variance) in this case -
    // exercises the denominator===0 guard in the profile correlation.
    expect(detectKeyFromChroma(new Array(12).fill(5))).toBe("C")
  })
})

describe("computeChroma", () => {
  it("returns all-zero chroma when there are fewer samples than one FFT frame", () => {
    const samples = new Float32Array(100)

    expect(computeChroma(samples, 44100)).toEqual(new Array(12).fill(0))
  })

  it("credits a synthesized A4 tone (with harmonics) energy to the A pitch class", () => {
    const sampleRate = 44100
    const length = 8192
    // Fundamental + 2nd + 3rd harmonics, so a frame has multiple spectral
    // peaks (not just one) to also exercise the multi-peak sort/accumulate
    // path, not only the single-peak case.
    const samples = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate
      samples[i] =
        Math.sin(2 * Math.PI * 440 * t) + 0.5 * Math.sin(2 * Math.PI * 880 * t) + 0.3 * Math.sin(2 * Math.PI * 1320 * t)
    }

    const chroma = computeChroma(samples, sampleRate)
    const maxPitchClass = chroma.indexOf(Math.max(...chroma))

    expect(maxPitchClass).toBe(9)
  })
})

describe("detectKeyFromAudioBuffer", () => {
  it("returns null when the buffer has too few samples for any analysis frame", () => {
    const sampleRate = 44100
    const buffer = createAudioBuffer(new Float32Array(100), sampleRate)

    expect(detectKeyFromAudioBuffer(buffer)).toBeNull()
  })

  it("detects A as the key of a synthesized A4 sine wave", () => {
    const sampleRate = 44100
    const buffer = createAudioBuffer(sineSamples(440, sampleRate, 10000), sampleRate)

    expect(detectKeyFromAudioBuffer(buffer)).toBe("A")
  })
})
