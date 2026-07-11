"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { DialogClose, DialogFooter } from "@workspace/ui/components/Dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import type { paths } from "@/types/api"

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

interface SongUploadFormProps {
  onSuccess?: () => void
}

export const SongUploadForm: FunctionComponent<SongUploadFormProps> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null)
  const [albumArt, setAlbumArt] = useState<File | null>(null)
  const queryClient = useQueryClient()

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
      await upload.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <>
      <form
        id="song-upload-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void uploadForm.handleSubmit()
        }}
      >
        <FieldGroup>
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
          <uploadForm.Field name="releaseDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Release date</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="date"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Field>
            )}
          </uploadForm.Field>
          <Field>
            <FieldLabel htmlFor="file">Audio file</FieldLabel>
            <Input
              id="file"
              name="file"
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="albumArt">Album art</FieldLabel>
            <Input
              id="albumArt"
              name="albumArt"
              type="file"
              accept="image/*"
              onChange={(e) => setAlbumArt(e.target.files?.[0] ?? null)}
            />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={upload.isPending} />}>Cancel</DialogClose>
        <Button type="submit" form="song-upload-form" disabled={upload.isPending}>
          {upload.isPending ? "Uploading..." : "Upload song"}
        </Button>
      </DialogFooter>
    </>
  )
}
