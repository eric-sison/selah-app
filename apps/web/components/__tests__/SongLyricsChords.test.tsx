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
})
