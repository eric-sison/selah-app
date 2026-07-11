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
import { SongUploadForm } from "@/components/SongUploadForm"

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a song</DialogTitle>
          <DialogDescription>Add an audio file and its basic details to the song bank.</DialogDescription>
        </DialogHeader>
        <SongUploadForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
