"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent } from "@workspace/ui/components/Card"
import { LiveWaveform } from "@workspace/ui/components/LiveWaveform"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Spinner } from "@workspace/ui/components/Spinner"
import { ChevronLeft, Disc3, Music } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { FunctionComponent, useEffect, useRef } from "react"
import { apiClient } from "@/lib/api-client"
import { usePlayer } from "@/components/songs/SongPlayerProvider"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"

interface SongDetailsViewProps {
  songId: string
}

export const SongDetailsView: FunctionComponent<SongDetailsViewProps> = ({ songId }) => {
  const { activeSongId, isPlaying, isLoadingSongId, analyserNode, selectSong } = usePlayer()

  const songQuery = useQuery({
    queryKey: ["song", songId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}", {
        params: { path: { id: songId } },
      })
      if (error) throw error
      return data
    },
    retry: false,
  })

  const song = songQuery.data

  // Loads (but doesn't play) this song into MusicPlayerBar when landing
  // directly on its detail page - only if nothing else is already active,
  // so it doesn't interrupt playback started elsewhere. See SongList.tsx
  // for the equivalent auto-select on the list page.
  const hasAutoSelectedRef = useRef(false)
  useEffect(() => {
    if (hasAutoSelectedRef.current || activeSongId || !song) return
    hasAutoSelectedRef.current = true
    selectSong(song)
  }, [song, activeSongId, selectSong])

  const albumArt = useQuery({
    queryKey: ["song-album-url", songId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: songId } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: !!song?.hasAlbumArt,
  })

  const isCurrentlyPlaying = song ? activeSongId === song.id && isPlaying : false
  const isLoading = song ? isLoadingSongId === song.id : false

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={
            <Link href="/songs">
              <ChevronLeft />
              Song Library
            </Link>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {songQuery.isLoading ? (
          <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
            <Skeleton className="aspect-square w-full max-w-md rounded-xl" />
            <div className="flex w-full flex-col items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ) : songQuery.isError || !song ? (
          <Empty className="h-full">
            <EmptyIcon>
              <Disc3 />
            </EmptyIcon>
            <EmptyTitle>Song not found</EmptyTitle>
            <EmptyDescription>The requested song could not be found.</EmptyDescription>
          </Empty>
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
            <Card className="aspect-square w-full max-w-md overflow-hidden py-0">
              <CardContent className="relative flex h-full items-center justify-center p-0">
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
                    <Spinner className="size-10 text-foreground" />
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
        )}
      </div>
    </div>
  )
}
