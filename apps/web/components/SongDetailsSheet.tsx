"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/Sheet"
import { Music } from "lucide-react"
import Image from "next/image"
import { FunctionComponent } from "react"
import { SongDetailInfo } from "@/components/SongDetailInfo"
import type { Song } from "@/components/NowPlayingCard"

interface SongDetailsSheetProps {
  song: Song
  albumArtUrl: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SongDetailsSheet: FunctionComponent<SongDetailsSheetProps> = ({
  song,
  albumArtUrl,
  open,
  onOpenChange,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-6 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Song details</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <div className="relative size-32 shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {albumArtUrl ? (
              <Image
                src={albumArtUrl}
                alt={`${song.title} album art`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Music className="size-10 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{song.title}</p>
            <p className="truncate text-sm text-muted-foreground">{song.artist ?? "Unknown artist"}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <SongDetailInfo song={song} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
