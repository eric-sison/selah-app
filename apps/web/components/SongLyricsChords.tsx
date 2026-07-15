import { Button } from "@workspace/ui/components/Button"
import { FileMusic, Minus, Plus, RotateCcw } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { ChordProView } from "@/components/ChordProView"
import type { Song } from "@/components/NowPlayingCard"
import { transposeKey } from "@/utils/transpose-key"

interface SongLyricsChordsProps {
  song: Song
}

// Matches the audio pitch-shift's own clamp range in SongPlayerProvider -
// this transpose is display-only and independent of that one, but a
// consistent ±12 (one octave) range keeps the two features feeling coherent.
const MIN_TRANSPOSE_SEMITONES = -12
const MAX_TRANSPOSE_SEMITONES = 12

// A capo raises the *sounding* pitch of whatever shape is fingered, so to
// keep the sounding key unchanged, the shown chord shapes must be
// transposed *down* by the capo's fret count - e.g. capo 2 + a "C" shape
// sounds like D, so a song actually in D shows "C" once capo is set to 2.
// 0-11 (not ±12) since a capo can't go negative, and 12 would just be the
// same shapes down a redundant full octave.
const MIN_CAPO_FRET = 0
const MAX_CAPO_FRET = 11

export const SongLyricsChords: FunctionComponent<SongLyricsChordsProps> = ({ song }) => {
  const [transposeSemitones, setTransposeSemitones] = useState(0)
  const [capoFret, setCapoFret] = useState(0)

  if (!song.chordpro) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <FileMusic className="size-6 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No lyrics or chords yet</p>
          <p className="text-sm text-muted-foreground">Add a chord sheet so the band can follow along.</p>
        </div>
      </div>
    )
  }

  const displayedKey = transposeKey(song.musicalKey, transposeSemitones)
  // The semitone offset actually applied to rendered chord letters - capo
  // cancels out part of the transpose, since it's a different way of
  // reaching the same sounding pitch. See the MIN/MAX_CAPO_FRET comment.
  const shapeSemitones = transposeSemitones - capoFret
  const shapeKey = transposeKey(song.musicalKey, shapeSemitones)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {displayedKey ? `Key of ${displayedKey}` : "Transpose"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Transpose down a semitone"
              disabled={transposeSemitones <= MIN_TRANSPOSE_SEMITONES}
              onClick={() => setTransposeSemitones((value) => Math.max(MIN_TRANSPOSE_SEMITONES, value - 1))}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Reset transpose"
              disabled={transposeSemitones === 0}
              onClick={() => setTransposeSemitones(0)}
            >
              <RotateCcw />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Transpose up a semitone"
              disabled={transposeSemitones >= MAX_TRANSPOSE_SEMITONES}
              onClick={() => setTransposeSemitones((value) => Math.min(MAX_TRANSPOSE_SEMITONES, value + 1))}
            >
              <Plus />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {capoFret > 0 && shapeKey ? `Capo ${capoFret} · shapes in ${shapeKey}` : "Capo"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Move capo down a fret"
              disabled={capoFret <= MIN_CAPO_FRET}
              onClick={() => setCapoFret((value) => Math.max(MIN_CAPO_FRET, value - 1))}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Remove capo"
              disabled={capoFret === 0}
              onClick={() => setCapoFret(0)}
            >
              <RotateCcw />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Move capo up a fret"
              disabled={capoFret >= MAX_CAPO_FRET}
              onClick={() => setCapoFret((value) => Math.min(MAX_CAPO_FRET, value + 1))}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </div>
      <ChordProView chordpro={song.chordpro} transposeSemitones={shapeSemitones} />
    </div>
  )
}
