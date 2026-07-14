import { describe, expect, it } from "vitest"
import { ChordProView } from "@/components/ChordProView"
import { render, screen } from "../../test/render"

describe("ChordProView", () => {
  it("renders chord-over-text pairs for a lyric line with inline chords", () => {
    render(<ChordProView chordpro="[G]Amazing [C]grace" />)

    expect(screen.getByText("G")).toBeInTheDocument()
    expect(screen.getByText("C")).toBeInTheDocument()
    expect(screen.getByText("Amazing")).toBeInTheDocument()
    expect(screen.getByText("grace")).toBeInTheDocument()
  })

  it("renders a section-only line as a section header", () => {
    render(<ChordProView chordpro="[Verse 1]" />)

    expect(screen.getByText("Verse 1")).toBeInTheDocument()
  })

  it("renders a blank line as a spacer div", () => {
    const { container } = render(<ChordProView chordpro={"[G]Amazing\n\n[C]grace"} />)

    const spacer = container.querySelector(".h-4")
    expect(spacer).toBeInTheDocument()
  })

  it("renders a non-breaking space placeholder for a chordless segment (leading text before the first chord)", () => {
    const { container } = render(<ChordProView chordpro="Amazing [G]grace" />)

    expect(screen.getByText("Amazing")).toBeInTheDocument()
    const spans = container.querySelectorAll(".inline-flex.shrink-0.flex-col.items-start")
    const firstChordLabel = spans[0]?.firstElementChild
    expect(firstChordLabel?.textContent).toHaveLength(1)
    expect(firstChordLabel?.textContent?.charCodeAt(0)).toBe(160)
  })

  it("does not transpose chords when transposeSemitones is omitted (defaults to 0)", () => {
    render(<ChordProView chordpro="[C]Test" />)

    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("shifts rendered chord labels when transposeSemitones is provided", () => {
    render(<ChordProView chordpro="[C]Test" transposeSemitones={2} />)

    expect(screen.getByText("D")).toBeInTheDocument()
    expect(screen.queryByText("C")).not.toBeInTheDocument()
  })
})
