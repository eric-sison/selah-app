import { FunctionComponent } from "react"
import { parseChordPro } from "@/utils/chordpro"

interface ChordProViewProps {
  chordpro: string
}

// An actual non-breaking space, not a plain " " - a span whose only content
// is a regular space gets collapsed by HTML's whitespace rules, losing the
// row's height entirely for chordless segments (e.g. leading text before a
// line's first chord) and misaligning them against their siblings.
const NBSP = " "

export const ChordProView: FunctionComponent<ChordProViewProps> = ({ chordpro }) => {
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
            {line.segments.map((segment, segmentIndex) => (
              <span key={segmentIndex} className="inline-flex shrink-0 flex-col items-start">
                <span className="text-sm font-extrabold text-primary">{segment.chord ?? NBSP}</span>
                <span className="whitespace-pre">{segment.text}</span>
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
