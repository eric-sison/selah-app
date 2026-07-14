"use client"

import { Badge } from "@workspace/ui/components/Badge"
import { Card, CardContent } from "@workspace/ui/components/Card"
import { LiveWaveform } from "@workspace/ui/components/LiveWaveform"
import { Loader2, Music } from "lucide-react"
import Image from "next/image"
import { FunctionComponent } from "react"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { Song } from "@/components/NowPlayingCard"

interface SongDetailPlayerProps {
  song: Song
  albumArtUrl: string | undefined
}

// Purely a display card - playback controls live in MusicPlayerBar.
export const SongDetailPlayer: FunctionComponent<SongDetailPlayerProps> = ({ song, albumArtUrl }) => {
  const { activeSongId, isPlaying, isLoadingSongId, analyserNode } = usePlayer()

  const isCurrentlyPlaying = activeSongId === song.id && isPlaying
  const isLoading = isLoadingSongId === song.id

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
      <Card className="aspect-square w-full max-w-md overflow-hidden py-0">
        <CardContent className="relative flex h-full items-center justify-center p-0">
          {albumArtUrl ? (
            <Image
              src={albumArtUrl}
              alt={`${song.title} album art`}
              fill
              unoptimized
              loading="eager"
              className="object-cover"
            />
          ) : (
            <div className="flex w-full flex-col items-center gap-2 px-10">
              <Music className="size-32 text-muted-foreground" />
              <LiveWaveform
                active={isCurrentlyPlaying}
                analyserNode={analyserNode}
                mode="static"
                className="h-20 w-full text-primary"
              />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="size-10 animate-spin text-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{song.title}</h1>
        <p className="text-muted-foreground">{song.artist ?? "Unknown artist"}</p>

        {(song.musicalKey || song.tempo) && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {song.musicalKey && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                Key of {song.musicalKey}
              </Badge>
            )}
            {song.tempo && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                {song.tempo} BPM
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
