"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/Dialog"
import { Slider } from "@workspace/ui/components/Slider"
import { toast } from "@workspace/ui/components/Sonner"
import { Textarea } from "@workspace/ui/components/Textarea"
import { Loader2, Pause, Play, Redo2, Undo2 } from "lucide-react"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { ChordProView } from "@/components/ChordProView"
import { usePlayer } from "@/components/SongPlayerProvider"
import { formatTime } from "@/utils/format-time"
import type { Song } from "@/components/NowPlayingCard"

interface EditChordProDialogProps {
  song: Song
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const EditChordProDialog: FunctionComponent<EditChordProDialogProps> = ({
  song,
  open,
  onOpenChange,
}) => {
  const queryClient = useQueryClient()
  const { activeSongId, isPlaying, isLoadingSongId, currentTime, duration, playOrToggle, skip, seek } =
    usePlayer()

  const update = useMutation({
    mutationFn: async (chordpro: string) => {
      const { data, error } = await apiClient.PATCH("/api/songs/{id}", {
        params: { path: { id: song.id } },
        body: { chordpro },
      })
      if (error) throw new Error("Failed to save lyrics & chords.")
      return data
    },
    onSuccess: () => {
      toast.success("Lyrics & chords saved.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["song", song.id] })
      queryClient.invalidateQueries({ queryKey: ["songs"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const form = useForm({
    defaultValues: {
      chordpro: song.chordpro ?? "",
    },
    onSubmit: async ({ value }) => {
      // See CLAUDE.md: mutateAsync rethrows on failure (onError above already
      // shows a toast), and TanStack Form's handleSubmit rethrows again on
      // top of that - left uncaught here it becomes an unhandled rejection
      // since the form submits via `void form.handleSubmit()`.
      await update.mutateAsync(value.chordpro).catch(() => {})
    },
  })

  const isActive = activeSongId === song.id
  const isCurrentlyPlaying = isActive && isPlaying
  const isLoading = isLoadingSongId === song.id
  const canControlPlayback = isActive && duration > 0
  const displayTime = isActive ? currentTime : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100%-2rem)] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit lyrics & chords</DialogTitle>
          <DialogDescription>
            Put a chord in brackets right before the word it changes on, e.g. &quot;[G]Amazing [C]grace&quot;.
            A line that&apos;s just one bracketed label, like [Verse 1], becomes a section header.
          </DialogDescription>
        </DialogHeader>
        <form
          id="edit-chordpro-form"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="chordpro">
            {(field) => (
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                <div className="grid h-full gap-4 sm:grid-cols-2">
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={"[Verse 1]\n[G]Amazing [C]grace, how [G]sweet the sound"}
                    className="min-h-64 font-mono text-sm"
                  />
                  <div className="min-h-64 overflow-y-auto rounded-lg border border-input p-2.5">
                    {field.state.value ? (
                      <ChordProView chordpro={field.state.value} />
                    ) : (
                      <p className="text-sm text-muted-foreground">Preview will appear here.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form.Field>
        </form>
        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Back 5 seconds"
              disabled={!isActive}
              onClick={() => skip(-5)}
            >
              <Undo2 className="size-4" />
            </Button>

            <Button
              variant="default"
              size="icon-lg"
              className="rounded-full"
              aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
              disabled={isLoading}
              onClick={() => playOrToggle(song)}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isCurrentlyPlaying ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Forward 5 seconds"
              disabled={!isActive}
              onClick={() => skip(5)}
            >
              <Redo2 className="size-4" />
            </Button>

            <div className="flex w-48 items-center gap-2">
              <span className="w-9 text-xs text-muted-foreground">{formatTime(displayTime)}</span>
              <Slider
                value={[displayTime]}
                min={0}
                max={canControlPlayback ? duration : 100}
                disabled={!canControlPlayback}
                onValueChange={(value) => seek(Array.isArray(value) ? (value[0] ?? 0) : value)}
                className="flex-1 cursor-pointer data-disabled:cursor-not-allowed"
              />
              <span className="w-9 text-xs text-muted-foreground">
                {formatTime(canControlPlayback ? duration : 0)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" disabled={update.isPending} />}>
              Cancel
            </DialogClose>
            <Button type="submit" form="edit-chordpro-form" disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
