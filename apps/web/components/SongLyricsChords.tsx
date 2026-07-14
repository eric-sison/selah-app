import { FileMusic } from "lucide-react"
import { FunctionComponent } from "react"
import { ChordProView } from "@/components/ChordProView"
import type { Song } from "@/components/NowPlayingCard"

interface SongLyricsChordsProps {
  song: Song
}

export const SongLyricsChords: FunctionComponent<SongLyricsChordsProps> = ({ song }) => {
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

  return <ChordProView chordpro={song.chordpro} />
}
