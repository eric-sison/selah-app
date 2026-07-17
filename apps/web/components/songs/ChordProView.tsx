import { FunctionComponent } from "react"
import { parseChordPro } from "@/utils/chordpro"
import { transposeChord } from "@/utils/transpose-key"

interface ChordProViewProps {
  chordpro: string
  transposeSemitones?: number
}

// An actual non-breaking space, not a plain " " - a span whose only content
// is a regular space gets collapsed by HTML's whitespace rules, losing the
// row's height entirely for chordless segments (e.g. leading text before a
// line's first chord) and misaligning them against their siblings.
const NBSP = " "

export const ChordProView: FunctionComponent<ChordProViewProps> = ({ chordpro, transposeSemitones = 0 }) => {
  const lines = parseChordPro(chordpro)

  return (
    // A chord/lyric line's segments must stay on one row for the chords to
    // line up over the right word - wrapping (even just one segment
    // spilling to a new row) breaks that alignment entirely, so lines
    // never wrap and the whole view scrolls horizontally instead.
    <div className="flex flex-col gap-1 overflow-x-auto font-mono text-sm">
      {lines.map((line, index) => {
        if (line.type === "blank") {
          return <div key={index} className="h-4" />
        }

        // Directives (e.g. "{capo: 2}") are metadata, not lyrics - never
        // rendered, and contribute no vertical space of their own (unlike
        // a blank line, which intentionally preserves the sheet's spacing).
        if (line.type === "directive") {
          return null
        }

        if (line.type === "section") {
          return (
            <p
              key={index}
              className="mt-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase first:mt-0"
            >
              {line.label}
            </p>
          )
        }

        return (
          <div key={index} className="flex flex-nowrap">
            {line.segments.map((segment, segmentIndex) => {
              const chord = segment.chord ? transposeChord(segment.chord, transposeSemitones) : null
              return (
                <span key={segmentIndex} className="inline-flex shrink-0 flex-col items-start">
                  <span className="text-sm font-extrabold text-sidebar-primary">{chord ?? NBSP}</span>
                  <span className="whitespace-pre">{segment.text}</span>
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
