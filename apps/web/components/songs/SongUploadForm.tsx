"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Calendar } from "@workspace/ui/components/Calendar"
import { DialogClose, DialogFooter } from "@workspace/ui/components/Dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { Spinner } from "@workspace/ui/components/Spinner"
import { toast } from "@workspace/ui/components/Sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { format } from "date-fns"
import { CalendarIcon, CircleAlert, Clapperboard, ImageIcon, Music2, Upload } from "lucide-react"
import { FunctionComponent, useEffect, useRef, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import type { paths } from "@/types/api"
import { useYoutubeImport } from "@/components/songs/YoutubeImportProvider"

const SongUploadFormSchema = z.object({
  title: z.string().min(1, { error: "Title is required." }),
  artist: z.string(),
  musicalKey: z.string(),
  tempo: z.string(),
  album: z.string(),
  releaseDate: z.string(),
})

// openapi-fetch types multipart bodies as plain objects, but at runtime it
// special-cases FormData and passes it through untouched (defaultBodySerializer) -
// this type + the cast below bridge that gap.
type CreateSongRequestBody = paths["/api/songs"]["post"]["requestBody"]["content"]["multipart/form-data"]
type StartYoutubeImportRequestBody =
  paths["/api/youtube-imports"]["post"]["requestBody"]["content"]["multipart/form-data"]

type YoutubeMetadata =
  paths["/api/youtube-imports/metadata"]["post"]["responses"][200]["content"]["application/json"]

interface SongUploadFormProps {
  onSuccess?: () => void
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

interface ReleaseDatePickerProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
}

// Calendar-in-a-popover date picker, matching the one in CreateLineupForm.tsx -
// trimmed down to just the date-only case (no time sub-field), since a
// song's release date has no time component. The value keeps the native
// date-input string shape ("yyyy-MM-dd") the plain input it replaced
// produced, so the Zod schema and submit mapping are unchanged.
const ReleaseDatePicker: FunctionComponent<ReleaseDatePickerProps> = ({ id, value, onChange, onBlur }) => {
  const [open, setOpen] = useState(false)

  // Appending a time avoids `new Date(value)` parsing the date-only string
  // as UTC midnight, which can shift a day off in local timezones west of UTC.
  const selected = value ? new Date(`${value}T00:00:00`) : undefined

  const handleSelect = (day: Date | undefined) => {
    onChange(day ? format(day, "yyyy-MM-dd") : "")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onBlur={onBlur}
        render={
          <Button id={id} type="button" variant="outline" className="w-full justify-between font-normal" />
        }
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? format(selected, "MMM d, yyyy") : "Optional"}
        </span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          className="w-full"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  )
}

export const SongUploadForm: FunctionComponent<SongUploadFormProps> = ({ onSuccess }) => {
  const [source, setSource] = useState<"file" | "youtube">("file")
  const [file, setFile] = useState<File | null>(null)
  const [albumArt, setAlbumArt] = useState<File | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [videoPreview, setVideoPreview] = useState<YoutubeMetadata | null>(null)
  const queryClient = useQueryClient()
  const {
    activeImport,
    status: importStatus,
    startImport: startTrackingImport,
    dismiss,
    setFormOpen,
  } = useYoutubeImport()

  // Tells the shared provider whether this dialog's own progress view is
  // currently on-screen - YoutubeImportIndicator (the floating widget) stays
  // hidden while it is, so the same job's progress isn't shown twice at once.
  useEffect(() => {
    setFormOpen(true)
    return () => setFormOpen(false)
  }, [setFormOpen])

  const upload = useMutation({
    mutationFn: async (values: z.infer<typeof SongUploadFormSchema>) => {
      if (!file) {
        throw new Error("Please choose an audio file.")
      }

      const formData = new FormData()
      formData.append("title", values.title)
      if (values.artist) formData.append("artist", values.artist)
      if (values.musicalKey) formData.append("musicalKey", values.musicalKey)
      if (values.tempo) formData.append("tempo", values.tempo)
      if (values.album) formData.append("album", values.album)
      if (values.releaseDate) formData.append("releaseDate", values.releaseDate)
      formData.append("file", file)
      if (albumArt) formData.append("albumArt", albumArt)

      const { data, error } = await apiClient.POST("/api/songs", {
        body: formData as unknown as CreateSongRequestBody,
      })

      if (error) throw new Error("Failed to upload song.")
      return data
    },
    onSuccess: () => {
      toast.success("Song uploaded.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["songs"] })
      uploadForm.reset()
      setFile(null)
      setAlbumArt(null)
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const fetchVideoDetails = useMutation({
    mutationFn: async (url: string) => {
      const { data, error } = await apiClient.POST("/api/youtube-imports/metadata", { body: { url } })
      if (error) throw new Error(error.message || "Failed to fetch video details.")
      return data
    },
    onSuccess: (data) => {
      setVideoPreview(data)
      if (!uploadForm.getFieldValue("title")) {
        uploadForm.setFieldValue("title", data.title)
      }
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const startImport = useMutation({
    mutationFn: async (values: z.infer<typeof SongUploadFormSchema>) => {
      if (!videoPreview) {
        throw new Error("Fetch the video's details first.")
      }

      const formData = new FormData()
      formData.append("youtubeUrl", youtubeUrl)
      formData.append("title", values.title)
      if (values.artist) formData.append("artist", values.artist)
      if (values.musicalKey) formData.append("musicalKey", values.musicalKey)
      if (values.tempo) formData.append("tempo", values.tempo)
      if (values.album) formData.append("album", values.album)
      if (values.releaseDate) formData.append("releaseDate", values.releaseDate)
      if (albumArt) formData.append("albumArt", albumArt)

      const { data, error } = await apiClient.POST("/api/youtube-imports", {
        body: formData as unknown as StartYoutubeImportRequestBody,
      })

      if (error) throw new Error(error.message || "Failed to start the import.")
      return data
    },
    onSuccess: (data) => {
      startTrackingImport({ id: data.id, title: uploadForm.getFieldValue("title") }, data)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  // Closes this dialog exactly once the shared provider's polling reports
  // completion - the provider itself (not this component) owns the
  // toast/songs-invalidation/auto-dismiss, since it needs to do that even
  // when no SongUploadForm is mounted to see it happen.
  const hasClosedOnCompletion = useRef(false)
  useEffect(() => {
    if (importStatus?.status !== "completed" || hasClosedOnCompletion.current) return
    hasClosedOnCompletion.current = true
    onSuccess?.()
  }, [importStatus?.status, onSuccess])

  const uploadForm = useForm({
    validators: {
      onSubmit: SongUploadFormSchema,
    },
    defaultValues: {
      title: "",
      artist: "",
      musicalKey: "",
      tempo: "",
      album: "",
      releaseDate: "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError below already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      if (source === "file") {
        await upload.mutateAsync(value).catch(() => {})
      } else {
        await startImport.mutateAsync(value).catch(() => {})
      }
    },
  })

  if (activeImport) {
    const failed = importStatus?.status === "failed"

    return (
      <>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          {failed ? (
            <>
              <CircleAlert className="size-8 text-destructive" />
              <p className="text-sm font-medium">Import failed</p>
              <p className="text-sm text-muted-foreground">{importStatus?.errorMessage}</p>
            </>
          ) : (
            <>
              <Spinner className="size-6" />
              <p className="text-sm font-medium">Downloading and converting…</p>
              <p className="text-sm text-muted-foreground">This can take a minute, depending on the video.</p>
            </>
          )}
        </div>
        <DialogFooter>
          {failed ? (
            <>
              <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
              <Button type="button" onClick={dismiss}>
                Try again
              </Button>
            </>
          ) : (
            <DialogClose render={<Button variant="outline" />}>Run in background</DialogClose>
          )}
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <form
        id="song-upload-form"
        className="min-h-0 flex-1 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void uploadForm.handleSubmit()
        }}
      >
        <Tabs
          value={source}
          onValueChange={(value) => setSource(value as "file" | "youtube")}
          className="mb-4 gap-3"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">
              <Upload />
              Upload file
            </TabsTrigger>
            <TabsTrigger value="youtube">
              <Clapperboard />
              From YouTube
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="file">Audio file</FieldLabel>
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-2.5 py-1.5">
                <Music2 className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept="audio/*"
                  className="h-auto border-0 bg-transparent p-0"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </Field>
          </TabsContent>

          <TabsContent value="youtube" className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="youtubeUrl">YouTube URL</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="youtubeUrl"
                  name="youtubeUrl"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value)
                    setVideoPreview(null)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!youtubeUrl || fetchVideoDetails.isPending}
                  onClick={() => fetchVideoDetails.mutate(youtubeUrl)}
                >
                  {fetchVideoDetails.isPending ? <Spinner /> : "Fetch"}
                </Button>
              </div>
            </Field>
            {videoPreview && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Clapperboard className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm font-medium">{videoPreview.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(videoPreview.durationSeconds)}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="albumArt">Album art</FieldLabel>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-2.5 py-1.5">
              <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              <Input
                id="albumArt"
                name="albumArt"
                type="file"
                accept="image/*"
                className="h-auto border-0 bg-transparent p-0"
                onChange={(e) => setAlbumArt(e.target.files?.[0] ?? null)}
              />
            </div>
          </Field>
          <uploadForm.Field name="title">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    placeholder="Amazing Grace"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </uploadForm.Field>
          <uploadForm.Field name="releaseDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Release date</FieldLabel>
                <ReleaseDatePicker
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </uploadForm.Field>
          <div className="grid grid-cols-2 gap-4">
            <uploadForm.Field name="artist">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Artist</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              )}
            </uploadForm.Field>
            <uploadForm.Field name="album">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Album</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              )}
            </uploadForm.Field>
            <uploadForm.Field name="musicalKey">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Key</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional, e.g. G"
                  />
                </Field>
              )}
            </uploadForm.Field>
            <uploadForm.Field name="tempo">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Tempo (BPM)</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              )}
            </uploadForm.Field>
          </div>
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" disabled={upload.isPending || startImport.isPending} />}
        >
          Cancel
        </DialogClose>
        <Button type="submit" form="song-upload-form" disabled={upload.isPending || startImport.isPending}>
          {source === "file"
            ? upload.isPending
              ? "Uploading..."
              : "Upload song"
            : startImport.isPending
              ? "Starting..."
              : "Import from YouTube"}
        </Button>
      </DialogFooter>
    </>
  )
}
