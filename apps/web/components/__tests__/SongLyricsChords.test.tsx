import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SongLyricsChords } from "@/components/SongLyricsChords"
import { createMockSong } from "../../test/fixtures"
import { render, screen } from "../../test/render"

describe("SongLyricsChords", () => {
  it("renders an empty state when song.chordpro is null", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: null })} />)

    expect(screen.getByText("No lyrics or chords yet")).toBeInTheDocument()
  })

  it("renders an empty state when song.chordpro is an empty string", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "" })} />)

    expect(screen.getByText("No lyrics or chords yet")).toBeInTheDocument()
  })

  it("renders chords when chordpro is present", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    expect(screen.queryByText("No lyrics or chords yet")).not.toBeInTheDocument()
    expect(screen.getByText("Test")).toBeInTheDocument()
  })

  it("shows the transpose control's default key and updates on up/down clicks", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    expect(screen.getByText("Key of C")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Transpose up a semitone" }))
    expect(screen.getByText("Key of C#")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Transpose down a semitone" }))
    await user.click(screen.getByRole("button", { name: "Transpose down a semitone" }))
    expect(screen.getByText("Key of B")).toBeInTheDocument()
  })

  it("disables the up button and stops incrementing at the +12 boundary", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    const upButton = screen.getByRole("button", { name: "Transpose up a semitone" })
    for (let i = 0; i < 12; i++) {
      await user.click(upButton)
    }

    expect(upButton).toBeDisabled()
    expect(screen.getByText("Key of C")).toBeInTheDocument()

    await user.click(upButton)
    expect(screen.getByText("Key of C")).toBeInTheDocument()
  })

  it("disables the down button and stops decrementing at the -12 boundary", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    const downButton = screen.getByRole("button", { name: "Transpose down a semitone" })
    for (let i = 0; i < 12; i++) {
      await user.click(downButton)
    }

    expect(downButton).toBeDisabled()
    expect(screen.getByText("Key of C")).toBeInTheDocument()

    await user.click(downButton)
    expect(screen.getByText("Key of C")).toBeInTheDocument()
  })

  it("reset button is disabled at 0 and returns the key to 0 after transposing", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    const resetButton = screen.getByRole("button", { name: "Reset transpose" })
    expect(resetButton).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Transpose up a semitone" }))
    expect(resetButton).not.toBeDisabled()
    expect(screen.getByText("Key of C#")).toBeInTheDocument()

    await user.click(resetButton)
    expect(resetButton).toBeDisabled()
    expect(screen.getByText("Key of C")).toBeInTheDocument()
  })

  it("shows the generic 'Transpose' label when the song has no musical key", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: null })} />)

    expect(screen.getByText("Transpose")).toBeInTheDocument()
  })

  it("shows the capo control's default label and updates the shape key on up/down clicks", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[D]Test", musicalKey: "D" })} />)

    expect(screen.getByText("Capo")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    // Capo 2 on a song actually in D -> play "C" shapes to sound like D.
    expect(screen.getByText("Capo 2 · shapes in C")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Move capo down a fret" }))
    expect(screen.getByText("Capo 1 · shapes in C#")).toBeInTheDocument()
  })

  it("disables the capo down button at fret 0 by default", () => {
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    expect(screen.getByRole("button", { name: "Move capo down a fret" })).toBeDisabled()
  })

  it("disables the capo up button and stops incrementing at the fret-11 boundary", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    const upButton = screen.getByRole("button", { name: "Move capo up a fret" })
    for (let i = 0; i < 11; i++) {
      await user.click(upButton)
    }

    expect(upButton).toBeDisabled()
    expect(screen.getByText("Capo 11 · shapes in C#")).toBeInTheDocument()

    await user.click(upButton)
    expect(screen.getByText("Capo 11 · shapes in C#")).toBeInTheDocument()
  })

  it("capo reset button is disabled at 0 and removes the capo after moving it", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    const resetButton = screen.getByRole("button", { name: "Remove capo" })
    expect(resetButton).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    expect(resetButton).not.toBeDisabled()
    expect(screen.getByText("Capo 1 · shapes in B")).toBeInTheDocument()

    await user.click(resetButton)
    expect(resetButton).toBeDisabled()
    expect(screen.getByText("Capo")).toBeInTheDocument()
  })

  it("shows the generic 'Capo' label (no shape key) when the song has no musical key, even engaged", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: null })} />)

    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))

    expect(screen.getByText("Capo")).toBeInTheDocument()
  })

  it("renders chord shapes adjusted for capo alone", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[D]Test", musicalKey: "D" })} />)

    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))

    // Song is in D; capo 2 means the fingered/displayed shape is C.
    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("keeps displayed chord shapes correct when transpose and capo are combined", async () => {
    const user = userEvent.setup()
    render(<SongLyricsChords song={createMockSong({ chordpro: "[C]Test", musicalKey: "C" })} />)

    // Transpose the sounding key up 2 semitones: C -> D. With no capo yet,
    // the displayed shape matches the new sounding key.
    await user.click(screen.getByRole("button", { name: "Transpose up a semitone" }))
    await user.click(screen.getByRole("button", { name: "Transpose up a semitone" }))
    expect(screen.getByText("Key of D")).toBeInTheDocument()
    expect(screen.getByText("D")).toBeInTheDocument()

    // Now add capo 2 - the sounding key (D) doesn't change, but the shape
    // to finger drops back down by those same 2 semitones, landing back on
    // the original "C" shape.
    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    await user.click(screen.getByRole("button", { name: "Move capo up a fret" }))
    expect(screen.getByText("Key of D")).toBeInTheDocument()
    expect(screen.getByText("Capo 2 · shapes in C")).toBeInTheDocument()
    expect(screen.getByText("C")).toBeInTheDocument()
  })
})
