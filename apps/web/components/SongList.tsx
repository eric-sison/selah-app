"use client"

import { useQuery } from "@tanstack/react-query"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { DataTable } from "@/components/DataTable"
import { songsColumns } from "@/components/features/columns-songs"

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

  return <DataTable columns={songsColumns} data={songs.data ?? []} />
}
