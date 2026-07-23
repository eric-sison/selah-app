import { describe, expect, it } from "vitest"
import { downmixToMono } from "@/utils/audio-samples"

function createAudioBuffer(channels: number[][]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => new Float32Array(channels[channel]!),
  } as unknown as AudioBuffer
}

describe("downmixToMono", () => {
  it("returns a single channel unchanged", () => {
    const buffer = createAudioBuffer([[0.5, -0.5, 1]])

    expect(Array.from(downmixToMono(buffer))).toEqual([0.5, -0.5, 1])
  })

  it("averages multiple channels sample-by-sample", () => {
    const buffer = createAudioBuffer([
      [1, 0, -1],
      [0, 1, 1],
    ])

    const result = downmixToMono(buffer)

    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0.5)
    expect(result[2]).toBeCloseTo(0)
  })

  it("returns an empty array for a zero-length buffer", () => {
    const buffer = createAudioBuffer([[]])

    expect(downmixToMono(buffer)).toHaveLength(0)
  })
})
