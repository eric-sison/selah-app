"use client"

import { Button } from "@workspace/ui/components/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/Dialog"
import { Plus } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { SongUploadForm } from "@/components/songs/SongUploadForm"

export const UploadSongDialog: FunctionComponent = () => {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            <span>Upload a song</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a song</DialogTitle>
          <DialogDescription>Add an audio file, or import one straight from a YouTube URL.</DialogDescription>
        </DialogHeader>
        <SongUploadForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
