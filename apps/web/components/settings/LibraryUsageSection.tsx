"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/Table"
import { format } from "date-fns"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { useSession } from "@/components/SessionProvider"
import { formatFileSize } from "@/utils/format-file-size"

const RECENT_UPLOADS_LIMIT = 5

const STAT_TILES: { label: string; value: (stats: { songCount: number; totalStorageBytes: number; completedStemsCount: number; youtubeImportsCount: number }) => string }[] = [
  { label: "Songs uploaded", value: (s) => String(s.songCount) },
  { label: "Stems separated", value: (s) => String(s.completedStemsCount) },
  { label: "YouTube imports", value: (s) => String(s.youtubeImportsCount) },
  { label: "Storage used", value: (s) => formatFileSize(s.totalStorageBytes) },
]

export const LibraryUsageSection: FunctionComponent = () => {
  const session = useSession()
  const userId = session?.user.id as string | undefined

  const usage = useQuery({
    queryKey: ["usage", "me"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/usage/me")
      if (error) throw new Error(error.message ?? "Failed to load usage stats.")
      return data
    },
  })

  const recentUploads = useQuery({
    queryKey: ["songs", "mine"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs", {
        params: { query: { uploadedBy: userId, limit: RECENT_UPLOADS_LIMIT } },
      })
      if (error) throw new Error("Failed to load your uploads.")
      return data
    },
    enabled: !!userId,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {STAT_TILES.map(({ label, value }) => (
          <div key={label} className="bg-card px-4 py-3.5">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1.5 text-xl font-semibold tracking-tight">
              {usage.isLoading || !usage.data ? "—" : value(usage.data)}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent uploads</CardTitle>
          <CardDescription>Your last few songs.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentUploads.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !recentUploads.data || recentUploads.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t uploaded any songs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Key / Tempo</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentUploads.data.items.map((song) => (
                  <TableRow key={song.id}>
                    <TableCell>
                      <div className="font-medium">{song.title}</div>
                      {song.artist && <div className="text-xs text-muted-foreground">{song.artist}</div>}
                    </TableCell>
                    <TableCell>
                      {song.musicalKey ?? "—"} {song.tempo ? `· ${song.tempo} BPM` : ""}
                    </TableCell>
                    <TableCell>{formatFileSize(song.fileSizeBytes)}</TableCell>
                    <TableCell>{format(new Date(song.createdAt), "PP")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
