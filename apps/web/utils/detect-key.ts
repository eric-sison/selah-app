import { downmixToMono } from "@/utils/audio-samples"
import { createTwiddleTables, fft, hannWindow } from "@/utils/fft"
import { CHROMATIC_SCALE } from "@/utils/transpose-key"

// Standard Krumhansl-Kessler key profiles - the relative perceived stability
// of each scale degree (index 0 = tonic) within a major/minor key, derived
// from listener studies and the de facto baseline for template-matching key
// detection (used by music21, Essentia, and most MIR key finders). Only used
// to pick a root pitch class here (see detectKeyFromChroma), since the app's
// `musicalKey` field doesn't track major/minor.
const MAJOR_KEY_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_KEY_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const A4_FREQUENCY_HZ = 440
const A4_MIDI_NOTE = 69

// A real spectral peak (fundamental or harmonic/overtone) anywhere in this
// range is folded into its nearest pitch class - unlike sampling only 36
// predetermined note frequencies, this credits a note's own overtones too
// (e.g. a guitar/piano note's 2nd and 4th harmonics land back on its own
// pitch class an octave up, its 3rd on the fifth above), which is what makes
// harmonically rich recordings resolve to a clear tonic instead of smearing
// energy across whichever exact frequencies happened to be sampled.
const MIN_ANALYSIS_FREQUENCY_HZ = 55 // ~A1 - below this is mostly rumble, not pitch content
const MAX_ANALYSIS_FREQUENCY_HZ = 5000 // covers fundamentals plus several harmonics of most voices/instruments

// How much of the track to actually analyze, and where to start - long
// enough for a stable estimate, short enough to keep this a sub-second-to-
// low-seconds operation, and offset past a likely silent/fade-in intro.
const ANALYSIS_WINDOW_SECONDS = 45
const ANALYSIS_START_RATIO = 0.15

// Frequency resolution = sampleRate / FFT_SIZE (≈5.4Hz at 44.1kHz) - fine
// enough to tell neighboring low notes apart (e.g. B2/C3 are ~7.3Hz apart)
// even before the parabolic refinement below. 50% overlap between frames
// (HOP_SIZE) trades some extra compute for smoother coverage of the window.
const FFT_SIZE = 8192
const HOP_SIZE = FFT_SIZE / 2

// A frame's spectral peaks quieter than this many dB below its own loudest
// peak are treated as noise floor, not a real partial.
const PEAK_RELATIVE_THRESHOLD_DB = 40
// Caps how many of a frame's peaks are credited, sorted loudest-first - a
// handful of real notes/harmonics per frame, not every bin that technically
// qualifies as a local maximum.
const MAX_PEAKS_PER_FRAME = 12
const MAGNITUDE_EPSILON = 1e-12

function frequencyToPitchClass(frequencyHz: number): number {
  const midiNote = Math.round(A4_MIDI_NOTE + 12 * Math.log2(frequencyHz / A4_FREQUENCY_HZ))
  return ((midiNote % 12) + 12) % 12
}

interface SpectralPeak {
  frequencyHz: number
  magnitude: number
}

// Quadratic ("parabolic") interpolation across a peak bin and its two
// neighbors' log-magnitude - the standard refinement for reading a spectral
// peak's frequency more precisely than the FFT's raw bin resolution alone
// would allow (Smith & Serra). Falls back to the raw bin (no refinement) if
// the three points are ~collinear, since the fit is undefined there.
function refinePeakBin(magnitudesDb: Float64Array, peakBin: number): number {
  const alpha = magnitudesDb[peakBin - 1]!
  const beta = magnitudesDb[peakBin]!
  const gamma = magnitudesDb[peakBin + 1]!

  const denominator = alpha - 2 * beta + gamma
  if (Math.abs(denominator) < 1e-9) return peakBin

  return peakBin + 0.5 * (alpha - gamma) / denominator
}

function findSpectralPeaks(
  real: Float64Array,
  imag: Float64Array,
  sampleRate: number,
  minBin: number,
  maxBin: number
): SpectralPeak[] {
  const magnitudes = new Float64Array(maxBin + 2)
  const magnitudesDb = new Float64Array(maxBin + 2)
  let frameMaxDb = -Infinity

  for (let bin = Math.max(1, minBin - 1); bin <= maxBin + 1; bin++) {
    const magnitude = Math.sqrt(real[bin]! * real[bin]! + imag[bin]! * imag[bin]!)
    magnitudes[bin] = magnitude
    const magnitudeDb = 20 * Math.log10(magnitude + MAGNITUDE_EPSILON)
    magnitudesDb[bin] = magnitudeDb
    if (magnitudeDb > frameMaxDb) frameMaxDb = magnitudeDb
  }

  const peaks: SpectralPeak[] = []
  const noiseFloorDb = frameMaxDb - PEAK_RELATIVE_THRESHOLD_DB

  for (let bin = Math.max(1, minBin); bin <= maxBin; bin++) {
    const magnitudeDb = magnitudesDb[bin]!
    if (magnitudeDb < noiseFloorDb) continue
    if (magnitudeDb <= magnitudesDb[bin - 1]! || magnitudeDb <= magnitudesDb[bin + 1]!) continue

    const refinedBin = refinePeakBin(magnitudesDb, bin)
    peaks.push({ frequencyHz: (refinedBin * sampleRate) / real.length, magnitude: magnitudes[bin]! })
  }

  peaks.sort((a, b) => b.magnitude - a.magnitude)
  return peaks.slice(0, MAX_PEAKS_PER_FRAME)
}

/**
 * Builds a 12-bin chromagram (energy per pitch class, C first) from real
 * spectral peaks across overlapping windowed frames - crediting every
 * significant partial (fundamentals and harmonics alike), not just energy
 * at a fixed list of note frequencies.
 */
export function computeChroma(samples: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0) as number[]
  if (samples.length < FFT_SIZE) return chroma

  const window = hannWindow(FFT_SIZE)
  const twiddles = createTwiddleTables(FFT_SIZE)
  const real = new Float64Array(FFT_SIZE)
  const imag = new Float64Array(FFT_SIZE)

  const minBin = Math.max(1, Math.floor((MIN_ANALYSIS_FREQUENCY_HZ * FFT_SIZE) / sampleRate))
  const maxBin = Math.min(FFT_SIZE / 2 - 2, Math.ceil((MAX_ANALYSIS_FREQUENCY_HZ * FFT_SIZE) / sampleRate))

  for (let frameStart = 0; frameStart + FFT_SIZE <= samples.length; frameStart += HOP_SIZE) {
    for (let i = 0; i < FFT_SIZE; i++) {
      real[i] = samples[frameStart + i]! * window[i]!
      imag[i] = 0
    }

    fft(real, imag, twiddles)

    for (const peak of findSpectralPeaks(real, imag, sampleRate, minBin, maxBin)) {
      const pitchClass = frequencyToPitchClass(peak.frequencyHz)
      chroma[pitchClass] = chroma[pitchClass]! + peak.magnitude
    }
  }

  return chroma
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// Pearson correlation between the chroma vector and a key profile rotated so
// its tonic (profile[0]) lines up with `rootPitchClass`.
function correlateWithProfile(chroma: number[], profile: number[], rootPitchClass: number): number {
  const chromaMean = mean(chroma)
  const profileMean = mean(profile)

  let covariance = 0
  let chromaVariance = 0
  let profileVariance = 0
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    const chromaDelta = chroma[pitchClass]! - chromaMean
    const profileDelta = profile[(pitchClass - rootPitchClass + 12) % 12]! - profileMean
    covariance += chromaDelta * profileDelta
    chromaVariance += chromaDelta * chromaDelta
    profileVariance += profileDelta * profileDelta
  }

  const denominator = Math.sqrt(chromaVariance * profileVariance)
  return denominator === 0 ? 0 : covariance / denominator
}

/**
 * Picks the root pitch class (e.g. "C", "F#") whose major or minor profile
 * best correlates with a chromagram - the classic Krumhansl-Schmuckler
 * key-finding algorithm, stopping short of also reporting major/minor since
 * `musicalKey` only ever stores a root note.
 */
export function detectKeyFromChroma(chroma: number[]): string | null {
  if (chroma.length !== 12 || chroma.every((value) => value === 0)) return null

  let bestRootPitchClass = 0
  let bestScore = -Infinity
  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
    const score = Math.max(
      correlateWithProfile(chroma, MAJOR_KEY_PROFILE, rootPitchClass),
      correlateWithProfile(chroma, MINOR_KEY_PROFILE, rootPitchClass)
    )
    if (score > bestScore) {
      bestScore = score
      bestRootPitchClass = rootPitchClass
    }
  }

  return CHROMATIC_SCALE[bestRootPitchClass] ?? null
}

/** Detects the musical key of a decoded audio track. */
export function detectKeyFromAudioBuffer(buffer: AudioBuffer): string | null {
  const mono = downmixToMono(buffer)

  const windowSamples = Math.min(mono.length, ANALYSIS_WINDOW_SECONDS * buffer.sampleRate)
  const start = Math.floor(
    Math.max(0, Math.min(mono.length * ANALYSIS_START_RATIO, mono.length - windowSamples))
  )
  const analysisWindow = mono.subarray(start, start + windowSamples)

  return detectKeyFromChroma(computeChroma(analysisWindow, buffer.sampleRate))
}
