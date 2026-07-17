import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { FileMusic, Minus, Plus } from "lucide-react"
import { FunctionComponent, useMemo, useState } from "react"
import { ChordProView } from "@/components/songs/ChordProView"
import type { Song } from "@/components/songs/NowPlayingCard"
import { getDeclaredCapo, getDeclaredTranspose, parseChordPro } from "@/utils/chordpro"

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

function clampCapoFret(value: number): number {
  return Math.min(Math.max(value, MIN_CAPO_FRET), MAX_CAPO_FRET)
}

function clampTransposeSemitones(value: number): number {
  return Math.min(Math.max(value, MIN_TRANSPOSE_SEMITONES), MAX_TRANSPOSE_SEMITONES)
}

function formatSignedSemitones(value: number): string {
  if (value === 0) return "0"
  return value > 0 ? `+${value}` : `${value}`
}

function transposeSubtitle(value: number): string {
  if (value === 0) return "No transpose"
  const count = Math.abs(value)
  return `${value > 0 ? "Up" : "Down"} ${count} semitone${count === 1 ? "" : "s"}`
}

// Only ever called with a fret in [1, MAX_CAPO_FRET] (11), so this doesn't
// need to be a fully general ordinal-suffix function - 11 is the only
// "teens" exception in that range (12th/13th's exceptions never apply here).
function ordinal(value: number): string {
  if (value === 11) return "11th"

  const lastDigit = value % 10
  if (lastDigit === 1) return `${value}st`
  if (lastDigit === 2) return `${value}nd`
  if (lastDigit === 3) return `${value}rd`
  return `${value}th`
}

function capoSubtitle(fret: number): string {
  return fret === 0 ? "No capo applied" : `Capo on ${ordinal(fret)} fret`
}

export const SongLyricsChords: FunctionComponent<SongLyricsChordsProps> = ({ song }) => {
  // The sheet's own declared transpose/capo (real ChordPro `{transpose: N}`
  // / `{capo: N}` directives in the chordpro text, e.g. as written by
  // whoever transcribed it) - the steppers below start here instead of
  // always at 0.
  const declaredTransposeSemitones = useMemo(() => {
    if (!song.chordpro) return 0
    const declared = getDeclaredTranspose(parseChordPro(song.chordpro))
    return declared === null ? 0 : clampTransposeSemitones(declared)
  }, [song.chordpro])

  const declaredCapoFret = useMemo(() => {
    if (!song.chordpro) return 0
    const declared = getDeclaredCapo(parseChordPro(song.chordpro))
    return declared === null ? 0 : clampCapoFret(declared)
  }, [song.chordpro])

  const [transposeSemitones, setTransposeSemitones] = useState(declaredTransposeSemitones)
  const [capoFret, setCapoFret] = useState(declaredCapoFret)

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

  // The semitone offset actually applied to rendered chord letters - capo
  // cancels out part of the transpose, since it's a different way of
  // reaching the same sounding pitch. See the MIN/MAX_CAPO_FRET comment.
  const shapeSemitones = transposeSemitones - capoFret

  return (
    <Tabs defaultValue="lyrics" className="gap-3">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="lyrics">Lyrics & Chords</TabsTrigger>
        <TabsTrigger value="capo-transpose">Capo & Transpose</TabsTrigger>
      </TabsList>

      <TabsContent value="lyrics" className="pt-4">
        <ChordProView chordpro={song.chordpro} transposeSemitones={shapeSemitones} />
      </TabsContent>

      <TabsContent value="capo-transpose" className="flex flex-col gap-3 pt-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Transpose</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Transpose down a semitone"
                disabled={transposeSemitones <= MIN_TRANSPOSE_SEMITONES}
                onClick={() => setTransposeSemitones((value) => Math.max(MIN_TRANSPOSE_SEMITONES, value - 1))}
              >
                <Minus />
              </Button>
              <span className="min-w-10 text-center text-3xl font-bold tabular-nums">
                {formatSignedSemitones(transposeSemitones)}
              </span>
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
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-xs text-muted-foreground">{transposeSubtitle(transposeSemitones)}</p>
          </CardFooter>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Capo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Move capo down a fret"
                disabled={capoFret <= MIN_CAPO_FRET}
                onClick={() => setCapoFret((value) => Math.max(MIN_CAPO_FRET, value - 1))}
              >
                <Minus />
              </Button>
              <span className="min-w-10 text-center text-3xl font-bold tabular-nums">{capoFret}</span>
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
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-xs text-muted-foreground">{capoSubtitle(capoFret)}</p>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
