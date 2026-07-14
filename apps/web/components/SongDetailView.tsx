"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { FunctionComponent, useEffect, useRef } from "react"
import { apiClient } from "@/lib/api-client"
import { SongDetailPlayer } from "@/components/SongDetailPlayer"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { components } from "@/types/api"

interface SongDetailViewProps {
  songId: string
}

type ApiErrorResponse = components["schemas"]["ErrorResponse"]

export const SongDetailView: FunctionComponent<SongDetailViewProps> = ({ songId }) => {
  const { activeSongId, selectSong } = usePlayer()

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

  const error = songQuery.error as ApiErrorResponse | null

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
              Songs
            </Link>
          }
        />
      </div>

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
        <p className="text-center text-sm text-muted-foreground">
          {error?.status === 404 ? "Song not found." : "Failed to load song."}
        </p>
      ) : (
        <SongDetailPlayer song={song} albumArtUrl={albumArt.data} />
      )}
    </div>
  )
}
