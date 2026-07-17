"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/Dialog"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { Musician } from "@/components/musicians/MusicianList"
import { formatInstrument, INSTRUMENTS, type Instrument } from "@/utils/instruments"

interface EditMusicianInstrumentsDialogProps {
  musician: Musician
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const EditMusicianInstrumentsDialog: FunctionComponent<EditMusicianInstrumentsDialogProps> = ({
  musician,
  open,
  onOpenChange,
}) => {
  const queryClient = useQueryClient()
  const [instruments, setInstruments] = useState<Instrument[]>(musician.instruments)

  // Reseeds the draft whenever the dialog is (re)opened, adjusted during
  // render (React's recommended alternative to a setState-in-effect here,
  // see https://react.dev/learn/you-might-not-need-an-effect) rather than an
  // effect - the dialog stays mounted while closed, so it would otherwise
  // keep showing whatever it last held.
  const [seededForOpen, setSeededForOpen] = useState(false)
  if (open && !seededForOpen) {
    setSeededForOpen(true)
    setInstruments(musician.instruments)
  } else if (!open && seededForOpen) {
    setSeededForOpen(false)
  }

  const toggleInstrument = (instrument: Instrument) => {
    setInstruments((prev) =>
      prev.includes(instrument) ? prev.filter((i) => i !== instrument) : [...prev, instrument]
    )
  }

  const updateInstruments = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.PATCH("/api/musicians/{id}", {
        params: { path: { id: musician.id } },
        body: { instruments },
      })
      if (error) throw new Error("Failed to update instruments.")
    },
    onSuccess: () => {
      toast.success("Instruments updated.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!updateInstruments.isPending) onOpenChange(next)
      }}
    >
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar>
              <AvatarImage src={musician.user.image ?? undefined} alt={musician.user.name} />
              <AvatarFallback>{musician.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{musician.user.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {INSTRUMENTS.map((instrument) => {
            const isSelected = instruments.includes(instrument)
            return (
              <Badge
                key={instrument}
                variant={isSelected ? "default" : "outline"}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => toggleInstrument(instrument)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return
                  e.preventDefault()
                  toggleInstrument(instrument)
                }}
                className="cursor-pointer select-none"
              >
                {formatInstrument(instrument)}
              </Badge>
            )
          })}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={updateInstruments.isPending} />}>
            Cancel
          </DialogClose>
          <Button onClick={() => updateInstruments.mutate()} disabled={updateInstruments.isPending}>
            {updateInstruments.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
