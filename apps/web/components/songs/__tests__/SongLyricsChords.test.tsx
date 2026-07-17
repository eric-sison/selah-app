import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SongLyricsChords } from "@/components/SongLyricsChords"
import { createMockSong } from "../../test/fixtures"
import { render, screen, within } from "../../test/render"

async function openCapoTransposeTab() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("tab", { name: "Capo & Transpose" }))
  return user
}

function getCardByTitle(title: string): HTMLElement {
  const card = screen.getByText(title).closest('[data-slot="card"]')
  if (!card) throw new Error(`Could not find a card containing "${title}"`)
  return card as HTMLElement
}

describe("SongLyricsChords", () => {
  it("renders an empty state when song.chordpro is null", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: null })} />)

    expect(screen.getByText("No lyrics or chords yet")).toBeInTheDocument()
  })

  it("renders an empty state when song.chordpro is an empty string", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "" })} />)

    expect(screen.getByText("No lyrics or chords yet")).toBeInTheDocument()
  })

  it("renders both tabs, with the lyrics/chords tab active and visible by default", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)

    expect(screen.queryByText("No lyrics or chords yet")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Lyrics & Chords" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Capo & Transpose" })).toBeInTheDocument()
    expect(screen.getByText("Test")).toBeInTheDocument()
  })

  it("shows both cards at their rest state on the Capo & Transpose tab by default", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    await openCapoTransposeTab()

    const transposeCard = getCardByTitle("Transpose")
    expect(within(transposeCard).getByText("0")).toBeInTheDocument()
    expect(within(transposeCard).getByText("No transpose")).toBeInTheDocument()

    const capoCard = getCardByTitle("Capo")
    expect(within(capoCard).getByText("0")).toBeInTheDocument()
    expect(within(capoCard).getByText("No capo applied")).toBeInTheDocument()
  })

  it("increments and decrements transpose, updating the number and subtitle", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    await user.click(within(transposeCard).getByRole("button", { name: "Transpose up a semitone" }))
    expect(within(transposeCard).getByText("+1")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Up 1 semitone")).toBeInTheDocument()

    await user.click(within(transposeCard).getByRole("button", { name: "Transpose up a semitone" }))
    expect(within(transposeCard).getByText("+2")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Up 2 semitones")).toBeInTheDocument()

    await user.click(within(transposeCard).getByRole("button", { name: "Transpose down a semitone" }))
    await user.click(within(transposeCard).getByRole("button", { name: "Transpose down a semitone" }))
    await user.click(within(transposeCard).getByRole("button", { name: "Transpose down a semitone" }))
    expect(within(transposeCard).getByText("-1")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Down 1 semitone")).toBeInTheDocument()
  })

  it("disables the transpose up button and stops incrementing at the +12 boundary", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    const upButton = within(transposeCard).getByRole("button", { name: "Transpose up a semitone" })
    for (let i = 0; i < 12; i++) {
      await user.click(upButton)
    }

    expect(upButton).toBeDisabled()
    expect(within(transposeCard).getByText("+12")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Up 12 semitones")).toBeInTheDocument()

    await user.click(upButton)
    expect(within(transposeCard).getByText("+12")).toBeInTheDocument()
  })

  it("disables the transpose down button and stops decrementing at the -12 boundary", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    const downButton = within(transposeCard).getByRole("button", { name: "Transpose down a semitone" })
    for (let i = 0; i < 12; i++) {
      await user.click(downButton)
    }

    expect(downButton).toBeDisabled()
    expect(within(transposeCard).getByText("-12")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Down 12 semitones")).toBeInTheDocument()

    await user.click(downButton)
    expect(within(transposeCard).getByText("-12")).toBeInTheDocument()
  })

  it("increments and decrements capo, updating the fret number and subtitle", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))
    expect(within(capoCard).getByText("1")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 1st fret")).toBeInTheDocument()

    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))
    expect(within(capoCard).getByText("2")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 2nd fret")).toBeInTheDocument()

    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))
    expect(within(capoCard).getByText("Capo on 3rd fret")).toBeInTheDocument()

    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))
    expect(within(capoCard).getByText("Capo on 4th fret")).toBeInTheDocument()

    await user.click(within(capoCard).getByRole("button", { name: "Move capo down a fret" }))
    expect(within(capoCard).getByText("3")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 3rd fret")).toBeInTheDocument()
  })

  it("disables the capo down button at fret 0 by default", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    expect(within(capoCard).getByRole("button", { name: "Move capo down a fret" })).toBeDisabled()
  })

  it("disables the capo up button and stops incrementing at the fret-11 boundary", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    const upButton = within(capoCard).getByRole("button", { name: "Move capo up a fret" })
    for (let i = 0; i < 11; i++) {
      await user.click(upButton)
    }

    expect(upButton).toBeDisabled()
    expect(within(capoCard).getByText("11")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 11th fret")).toBeInTheDocument()

    await user.click(upButton)
    expect(within(capoCard).getByText("11")).toBeInTheDocument()
  })

  it("seeds the transpose stepper from a {transpose: N} directive in the chordpro text", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{transpose: 5}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    expect(within(transposeCard).getByText("+5")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Up 5 semitones")).toBeInTheDocument()
  })

  it("seeds the transpose stepper from a negative {transpose: N} directive", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{transpose: -2}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    expect(within(transposeCard).getByText("-2")).toBeInTheDocument()
    expect(within(transposeCard).getByText("Down 2 semitones")).toBeInTheDocument()
  })

  it("clamps an out-of-range declared transpose (e.g. {transpose: 20}) into the supported ±12 range", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{transpose: 20}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    expect(within(transposeCard).getByRole("button", { name: "Transpose up a semitone" })).toBeDisabled()
    expect(within(transposeCard).getByText("+12")).toBeInTheDocument()
  })

  it("ignores a malformed transpose directive and falls back to 0", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{transpose: banana}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    expect(within(transposeCard).getByText("0")).toBeInTheDocument()
    expect(within(transposeCard).getByText("No transpose")).toBeInTheDocument()
  })

  it("seeds the capo stepper from a {capo: N} directive in the chordpro text", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{capo: 3}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    expect(within(capoCard).getByText("3")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 3rd fret")).toBeInTheDocument()
  })

  it("clamps an out-of-range declared capo (e.g. {capo: 15}) into the supported 0-11 range", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{capo: 15}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    expect(within(capoCard).getByRole("button", { name: "Move capo up a fret" })).toBeDisabled()
    expect(within(capoCard).getByText("11")).toBeInTheDocument()
    expect(within(capoCard).getByText("Capo on 11th fret")).toBeInTheDocument()
  })

  it("ignores a malformed capo directive and falls back to 0", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{capo: banana}\n[D]Test" })} />)
    await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    expect(within(capoCard).getByRole("button", { name: "Move capo down a fret" })).toBeDisabled()
    expect(within(capoCard).getByText("No capo applied")).toBeInTheDocument()
  })

  it("renders chords with no transpose/capo applied by default", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)

    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("re-renders chord shapes in the lyrics tab as transpose changes", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test" })} />)
    const user = await openCapoTransposeTab()
    const transposeCard = getCardByTitle("Transpose")

    await user.click(within(transposeCard).getByRole("button", { name: "Transpose up a semitone" }))
    await user.click(within(transposeCard).getByRole("button", { name: "Transpose up a semitone" }))

    await user.click(screen.getByRole("tab", { name: "Lyrics & Chords" }))
    expect(screen.getByText("D")).toBeInTheDocument()
  })

  it("re-renders chord shapes in the lyrics tab as capo changes", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[D]Test" })} />)
    const user = await openCapoTransposeTab()
    const capoCard = getCardByTitle("Capo")

    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))
    await user.click(within(capoCard).getByRole("button", { name: "Move capo up a fret" }))

    await user.click(screen.getByRole("tab", { name: "Lyrics & Chords" }))
    // Song is in D; capo 2 means the fingered/displayed shape is C.
    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("keeps displayed chord shapes correct when transpose and capo are combined", async () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "{transpose: 2}\n{capo: 3}\n[C]Test" })} />)

    // shapeSemitones = transpose(2) - capo(3) = -1, so C -> B.
    expect(screen.getByText("B")).toBeInTheDocument()
  })
})
