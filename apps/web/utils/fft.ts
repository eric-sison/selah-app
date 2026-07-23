// Low-level DSP primitives used by detect-key.ts's windowed FFT over
// successive frames of a decoded track.

export function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size)
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
  }
  return window
}

export interface TwiddleTables {
  cosTable: Float64Array
  sinTable: Float64Array
}

// Precomputed once per FFT size and reused for every frame, since the
// twiddle angle at stage `size`/index `k` (-2*pi*k/size) always equals
// `-2*pi*(k*(n/size))/n` - i.e. the same base n/2-length table can be
// indexed with a per-stage stride instead of recomputing cos/sin per frame.
export function createTwiddleTables(size: number): TwiddleTables {
  const half = size / 2
  const cosTable = new Float64Array(half)
  const sinTable = new Float64Array(half)
  for (let i = 0; i < half; i++) {
    const angle = (-2 * Math.PI * i) / size
    cosTable[i] = Math.cos(angle)
    sinTable[i] = Math.sin(angle)
  }
  return { cosTable, sinTable }
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT (decimation-in-time). `real`/
 * `imag` must have a power-of-two length matching the twiddle tables.
 */
export function fft(real: Float64Array, imag: Float64Array, twiddles: TwiddleTables): void {
  const { cosTable, sinTable } = twiddles
  const n = real.length

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      const tempReal = real[i]!
      real[i] = real[j]!
      real[j] = tempReal
      const tempImag = imag[i]!
      imag[i] = imag[j]!
      imag[j] = tempImag
    }
  }

  // Iterative butterfly, twiddle factors looked up from the precomputed
  // tables (indexed with a stride so the same n/2-length table serves every
  // stage) rather than recomputed with Math.cos/sin per frame.
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2
    const tableStride = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < halfSize; k++) {
        const cos = cosTable[k * tableStride]!
        const sin = sinTable[k * tableStride]!
        const evenIndex = start + k
        const oddIndex = evenIndex + halfSize

        const oddReal = real[oddIndex]! * cos - imag[oddIndex]! * sin
        const oddImag = real[oddIndex]! * sin + imag[oddIndex]! * cos

        real[oddIndex] = real[evenIndex]! - oddReal
        imag[oddIndex] = imag[evenIndex]! - oddImag
        real[evenIndex] = real[evenIndex]! + oddReal
        imag[evenIndex] = imag[evenIndex]! + oddImag
      }
    }
  }
}
