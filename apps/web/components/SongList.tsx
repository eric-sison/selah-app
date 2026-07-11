"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@workspace/ui/components/AlertDialog"
import { Button } from "@workspace/ui/components/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { toast } from "@workspace/ui/components/Sonner"
import { Spinner } from "@workspace/ui/components/Spinner"
import { cn } from "@workspace/ui/lib/utils"
import { CloudDownload, EllipsisVertical, Loader2, Music, Pause, Play, RedoDot, Trash } from "lucide-react"
import Image from "next/image"
import { FunctionComponent, MouseEvent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useSession } from "@/components/SessionProvider"
import { usePlayer } from "@/components/SongPlayerProvider"
import type { Song } from "@/components/MiniMusicPlayer"

interface SongRowProps {
  song: Song
  isActive: boolean
  isPlaying: boolean
  isLoadingAudio: boolean
  isDownloading: boolean
  isDeleting: boolean
  canDelete: boolean
  onSelect: () => void
  onTogglePlay: () => void
  onDownload: () => void
  onDelete: () => Promise<boolean>
}

const SongRow: FunctionComponent<SongRowProps> = ({
  song,
  isActive,
  isPlaying,
  isLoadingAudio,
  isDownloading,
  isDeleting,
  canDelete,
  onSelect,
  onTogglePlay,
  onDownload,
  onDelete,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const albumArt = useQuery({
    queryKey: ["song-album-url", song.id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: song.hasAlbumArt,
  })

  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50",
        isActive && "bg-muted/30"
      )}
    >
      <div className="group relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card opacity-70 ring-1 ring-foreground/10">
        {albumArt.data ? (
          <Image
            src={albumArt.data}
            alt={`${song.title} album art`}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <Music className="size-5 text-muted-foreground" />
        )}
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={isLoadingAudio}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay()
          }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100",
            (isPlaying || isLoadingAudio) && "opacity-100"
          )}
        >
          {isLoadingAudio ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{song.title}</p>
          {song.musicalKey && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {song.musicalKey}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{song.artist ?? "Unknown artist"}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              aria-label="More options"
              onClick={stop}
            />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          <DropdownMenuItem disabled>
            <RedoDot />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isDownloading} onClick={onDownload}>
            {isDownloading ? <Loader2 className="animate-spin" /> : <CloudDownload />}
            Download
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteDialogOpen(open)
        }}
      >
        <AlertDialogContent onClick={stop} size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete &quot;{song.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the song, its audio file, and its album art (if any). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                const success = await onDelete()
                if (success) setDeleteDialogOpen(false)
              }}
            >
              {isDeleting && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const SongList: FunctionComponent = () => {
  const { activeSongId, isPlaying, isLoadingSongId, selectSong, playOrToggle } = usePlayer()
  const session = useSession()
  const queryClient = useQueryClient()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canDelete = session?.user.role === "admin"

  const songs = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs")
      if (error) throw new Error("Failed to load songs.")
      return data
    },
  })

  const handleDownload = async (song: Song) => {
    setDownloadingId(song.id)
    try {
      const { data, error } = await apiClient.GET("/api/songs/{id}/download-url", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to get download link.")

      const link = document.createElement("a")
      link.href = data.url
      link.download = song.originalFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      toast.error("Failed to download song.", { position: "top-center" })
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (song: Song): Promise<boolean> => {
    setDeletingId(song.id)
    try {
      const { error } = await apiClient.DELETE("/api/songs/{id}", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to delete song.")

      toast.success("Song successfully deleted.")
      await queryClient.invalidateQueries({ queryKey: ["songs"] })
      return true
    } catch {
      toast.error("Failed to delete song.", { position: "top-center" })
      return false
    } finally {
      setDeletingId(null)
    }
  }

  if (songs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading songs...</p>
  }

  if (!songs.data?.length) {
    return <p className="text-sm text-muted-foreground">No songs uploaded yet.</p>
  }

  const songList = songs.data

  return (
    <div className="flex flex-col gap-1">
      {songList.map((song) => (
        <SongRow
          key={song.id}
          song={song}
          isActive={activeSongId === song.id}
          isPlaying={activeSongId === song.id && isPlaying}
          isLoadingAudio={isLoadingSongId === song.id}
          isDownloading={downloadingId === song.id}
          isDeleting={deletingId === song.id}
          canDelete={canDelete}
          onSelect={() => selectSong(song, songList)}
          onTogglePlay={() => playOrToggle(song, songList)}
          onDownload={() => handleDownload(song)}
          onDelete={() => handleDelete(song)}
        />
      ))}
    </div>
  )
}
