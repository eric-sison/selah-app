import { useEffect, useRef, useState } from "react"

// A plain `setInterval` click-scheduler drifts under the DOM timer's own
// jitter, audible as an unsteady metronome. The standard fix (see Chris
// Wilson's "A Tale of Two Clocks") is to keep a coarse JS timer only as a
// *lookahead* trigger, and schedule each click's actual start time on the
// AudioContext's own sample-accurate clock - SCHEDULE_AHEAD_TIME_SECONDS is
// how far past "now" clicks get queued each tick, SCHEDULER_INTERVAL_MS how
// often that queue gets topped up.
const SCHEDULER_INTERVAL_MS = 25
const SCHEDULE_AHEAD_TIME_SECONDS = 0.1
const CLICK_DURATION_SECONDS = 0.05
const CLICK_FREQUENCY_HZ = 1000

// The click's peak gain at full volume - was previously hardcoded directly
// as the gain envelope's starting value; now scaled by `volume` (0-1)
// instead, so this is the ceiling rather than the fixed level.
const MAX_CLICK_GAIN = 0.4

export interface UseMetronomeResult {
  isPlaying: boolean
  start: () => void
  stop: () => void
  // Independent of the song's own playback volume (see SongPlayerProvider's
  // `volume`) - the metronome runs on its own AudioContext entirely separate
  // from the song's audio graph, so the two were never linked to begin with.
  volume: number
  setVolume: (value: number) => void
}

/** An audible click track at `bpm`, started/stopped independently of song playback. */
export function useMetronome(bpm: number): UseMetronomeResult {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextClickTimeRef = useRef(0)
  const schedulerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // The scheduler tick (below) runs on its own timer and needs the latest
  // bpm/volume without re-registering itself every time either changes
  // mid-playback.
  const bpmRef = useRef(bpm)
  const volumeRef = useRef(volume)

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  const setVolume = (value: number) => {
    setVolumeState(Math.min(Math.max(value, 0), 1))
  }

  const scheduleClick = (context: AudioContext, time: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = CLICK_FREQUENCY_HZ
    // exponentialRampToValueAtTime requires a non-zero starting value (the
    // Web Audio spec throws otherwise), so a volume of exactly 0 is floored
    // to the same epsilon the ramp already decays toward below - effectively
    // silent either way, just without tripping that error.
    gain.gain.setValueAtTime(Math.max(volumeRef.current * MAX_CLICK_GAIN, 0.0001), time)
    // Exponential decay reads as a percussive "tick" rather than a beep -
    // ramps toward (never reaches) zero, so the target is an epsilon, not 0.
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DURATION_SECONDS)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(time)
    oscillator.stop(time + CLICK_DURATION_SECONDS)
  }

  const stop = () => {
    if (schedulerIntervalRef.current) clearInterval(schedulerIntervalRef.current)
    schedulerIntervalRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    setIsPlaying(false)
  }

  const start = () => {
    const context = new AudioContext()
    audioContextRef.current = context
    nextClickTimeRef.current = context.currentTime

    schedulerIntervalRef.current = setInterval(() => {
      while (nextClickTimeRef.current < context.currentTime + SCHEDULE_AHEAD_TIME_SECONDS) {
        scheduleClick(context, nextClickTimeRef.current)
        nextClickTimeRef.current += 60 / bpmRef.current
      }
    }, SCHEDULER_INTERVAL_MS)

    setIsPlaying(true)
  }

  // Stops the audio graph on unmount (e.g. navigating away, or switching to
  // a different song's popover instance) rather than leaving it ticking.
  useEffect(() => stop, [])

  return { isPlaying, start, stop, volume, setVolume }
}
