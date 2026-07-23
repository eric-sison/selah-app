import { describe, expect, it } from "vitest"
import { createTwiddleTables, fft, hannWindow } from "@/utils/fft"

describe("hannWindow", () => {
  it("returns 0 at both edges", () => {
    const window = hannWindow(5)
    expect(window[0]).toBeCloseTo(0)
    expect(window[4]).toBeCloseTo(0)
  })

  it("returns 1 at the midpoint of an odd-sized window", () => {
    const window = hannWindow(5)
    expect(window[2]).toBeCloseTo(1)
  })

  it("is symmetric", () => {
    const window = hannWindow(8)
    for (let i = 0; i < window.length; i++) {
      expect(window[i]).toBeCloseTo(window[window.length - 1 - i]!)
    }
  })

  it("returns an array of the requested size", () => {
    expect(hannWindow(16)).toHaveLength(16)
  })
})

describe("createTwiddleTables", () => {
  it("returns cos/sin tables of half the requested size", () => {
    const { cosTable, sinTable } = createTwiddleTables(8)
    expect(cosTable).toHaveLength(4)
    expect(sinTable).toHaveLength(4)
  })

  it("computes the expected angle at k=0 (no rotation)", () => {
    const { cosTable, sinTable } = createTwiddleTables(8)
    expect(cosTable[0]).toBeCloseTo(1)
    expect(sinTable[0]).toBeCloseTo(0)
  })

  it("computes the expected angle at k=size/4 (a quarter turn)", () => {
    const { cosTable, sinTable } = createTwiddleTables(8)
    expect(cosTable[2]).toBeCloseTo(0)
    expect(sinTable[2]).toBeCloseTo(-1)
  })
})

describe("fft", () => {
  it("transforms a constant (DC) signal into all energy at bin 0", () => {
    const n = 8
    const real = new Float64Array(n).fill(1)
    const imag = new Float64Array(n)

    fft(real, imag, createTwiddleTables(n))

    expect(real[0]).toBeCloseTo(n)
    expect(imag[0]).toBeCloseTo(0)
    for (let i = 1; i < n; i++) {
      expect(real[i]).toBeCloseTo(0)
      expect(imag[i]).toBeCloseTo(0)
    }
  })

  it("transforms a single-cycle cosine into energy at bin 1 and its mirror bin", () => {
    const n = 8
    const real = new Float64Array(n)
    const imag = new Float64Array(n)
    for (let i = 0; i < n; i++) real[i] = Math.cos((2 * Math.PI * i) / n)

    fft(real, imag, createTwiddleTables(n))

    expect(real[1]).toBeCloseTo(n / 2)
    expect(real[n - 1]).toBeCloseTo(n / 2)
    expect(real[0]).toBeCloseTo(0)
    expect(real[2]).toBeCloseTo(0)
  })
})
