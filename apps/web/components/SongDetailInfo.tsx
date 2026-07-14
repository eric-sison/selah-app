import { format } from "date-fns"
import { FunctionComponent } from "react"
import type { Song } from "@/components/NowPlayingCard"
import { formatFileSize } from "@/utils/format-file-size"

interface SongDetailInfoProps {
  song: Song
}

const FIELDS: { label: string; value: (song: Song) => string }[] = [
  { label: "Artist", value: (s) => s.artist ?? "Unknown" },
  { label: "Album", value: (s) => s.album ?? "—" },
  { label: "Key", value: (s) => s.musicalKey ?? "—" },
  { label: "Tempo", value: (s) => (s.tempo ? `${s.tempo} BPM` : "—") },
  { label: "Release date", value: (s) => (s.releaseDate ? format(new Date(s.releaseDate), "PP") : "—") },
  { label: "File", value: (s) => s.originalFileName },
  { label: "File size", value: (s) => formatFileSize(s.fileSizeBytes) },
  { label: "Uploaded by", value: (s) => s.uploader.name },
  { label: "Uploaded", value: (s) => format(new Date(s.createdAt), "PP") },
]

export const SongDetailInfo: FunctionComponent<SongDetailInfoProps> = ({ song }) => {
  return (
    <dl className="flex flex-col divide-y divide-border text-sm">
      {FIELDS.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate text-right font-medium">{value(song)}</dd>
        </div>
      ))}
    </dl>
  )
}
