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

export const SongLyricsChords: FunctionComponent<SongLyricsChordsProps> = ({ song }) => {
  const [transposeSemitones, setTransposeSemitones] = useState(0)

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
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
      <ChordProView chordpro={song.chordpro} transposeSemitones={transposeSemitones} />
    </div>
  )
}
