import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement these - base-ui's floating-ui-powered popovers
// (Dialog, DropdownMenu, Combobox, Sheet, AlertDialog, Popover, Tooltip)
// call them during positioning/focus management, and calling the real
// (missing) implementation throws instead of no-opping.
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock)

class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ""
  readonly thresholds: ReadonlyArray<number> = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverMock)

Element.prototype.scrollIntoView = vi.fn()
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()

// jsdom's PointerEvent is missing fields (pointerType etc.) that base-ui
// reads when handling pointer interactions.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? "mouse"
      this.isPrimary = params.isPrimary ?? true
    }
  }
  vi.stubGlobal("PointerEvent", PointerEventPolyfill)
}

// next-themes reads this on mount to resolve the "system" theme.
window.matchMedia =
  window.matchMedia ||
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

// jsdom implements <audio>/<video> elements but not actual media playback -
// calling these throws "Not implemented" by default.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

// LiveWaveform (@workspace/ui) reads a 2D canvas context to draw into -
// jsdom's canvas getContext returns null without a real canvas backend, so
// components that render it (e.g. NowPlayingCard) would otherwise crash on
// mount even when the waveform itself isn't under test.
const canvasContextMock = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  roundRect: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  set fillStyle(_value: string) {},
  set strokeStyle(_value: string) {},
  set lineWidth(_value: number) {},
}
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => canvasContextMock
) as unknown as HTMLCanvasElement["getContext"]

window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
  return window.setTimeout(() => callback(performance.now()), 0)
})
window.cancelAnimationFrame = vi.fn((handle: number) => {
  window.clearTimeout(handle)
})

// The Web Audio API isn't implemented in jsdom - SongPlayerProvider builds
// a real AudioContext graph (gain, analyser, worklet). Individual test
// files that exercise that provider directly override/inspect these
// further; this baseline stub just keeps any incidental construction from
// throwing for components that merely consume `usePlayer()`.
class AudioContextMock {
  state = "running"
  destination = {}
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  createGain = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }))
  createAnalyser = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }))
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}
vi.stubGlobal("AudioContext", AudioContextMock)
vi.stubGlobal("webkitAudioContext", AudioContextMock)
