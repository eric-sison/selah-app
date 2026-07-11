"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const SongList: FunctionComponent = () => {
  const songs = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs")
      if (error) throw new Error("Failed to load songs.")
      return data
    },
  })

  if (songs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading songs...</p>
  }

  if (!songs.data?.length) {
    return <p className="text-sm text-muted-foreground">No songs uploaded yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {songs.data.map((song) => (
        <Card key={song.id} size="sm">
          <CardHeader>
            <CardTitle>{song.title}</CardTitle>
            <CardDescription>
              {[
                song.artist,
                song.album,
                song.musicalKey && `Key: ${song.musicalKey}`,
                song.tempo && `${song.tempo} BPM`,
                song.releaseDate,
              ]
                .filter(Boolean)
                .join(" · ") || "No additional details"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Uploaded by {song.uploader.name} · {formatFileSize(song.fileSizeBytes)} ·{" "}
            {new Date(song.createdAt).toLocaleDateString()}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
