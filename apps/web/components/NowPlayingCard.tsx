"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@workspace/ui/components/Card"
import { LiveWaveform } from "@workspace/ui/components/LiveWaveform"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Music } from "lucide-react"
import Image from "next/image"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { operations } from "@/types/api"

export type Song = operations["listSongs"]["responses"][200]["content"]["application/json"][number]

// Prefers whichever song is actually loaded/playing; falls back to the most
// recently uploaded song as a static preview when nothing has been played yet.
// Purely a display card - playback controls live in MusicPlayerBar.
export const NowPlayingCard: FunctionComponent = () => {
  const { activeSongId, isPlaying, analyserNode } = usePlayer()

  const songs = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs")
      if (error) throw new Error("Failed to load songs.")
      return data
    },
  })

  const song = songs.data?.find((s) => s.id === activeSongId) ?? songs.data?.[0]

  const albumArt = useQuery({
    queryKey: ["song-album-url", song?.id],
    // `enabled` guarantees `song` is defined whenever this runs.
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: song!.id } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: !!song?.hasAlbumArt,
  })

  if (songs.isLoading) {
    return (
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="flex w-full flex-col items-center gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">No songs uploaded yet.</p>
      </div>
    )
  }

  const isCurrentlyPlaying = activeSongId === song.id && isPlaying

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <Card className="w-full gap-0 rounded-xl py-0 opacity-95">
        <CardContent className="relative flex aspect-square items-center justify-center">
          {albumArt.data ? (
            <Image
              src={albumArt.data}
              alt={`${song.title} album art`}
              fill
              unoptimized
              loading="eager"
              className="object-cover"
            />
          ) : (
            <div className="flex w-full flex-col items-center gap-2">
              <Music className="size-32 text-muted-foreground" />
              <LiveWaveform
                active={isCurrentlyPlaying}
                analyserNode={analyserNode}
                mode="static"
                className="h-20 w-full text-primary"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <p className="truncate text-lg font-semibold tracking-tight">{song.title}</p>
        <p className="truncate text-sm text-muted-foreground">{song.artist ?? "Unknown artist"}</p>
      </div>
    </div>
  )
}
