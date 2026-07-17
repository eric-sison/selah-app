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
import { formatInstrument, INSTRUMENTS, type Instrument } from "@/utils/instruments"
import type { Team } from "@/components/teams/TeamList"

type TeamMember = Team["members"][number]

interface UpdateTeamMemberDialogProps {
  /** Null closes the dialog - passing the member itself (rather than just an id) avoids an extra `team.members.find` lookup at every call site. */
  member: TeamMember | null
  onOpenChange: (open: boolean) => void
}

// A member's only editable field here is their instruments - which live
// globally on their musician profile, not per-team, so this edits the same
// record the Musicians page and TeamMembershipFields' popover do. Renaming,
// removing, or reassigning as leader all go through EditTeamForm instead.
export const UpdateTeamMemberDialog: FunctionComponent<UpdateTeamMemberDialogProps> = ({
  member,
  onOpenChange,
}) => {
  const queryClient = useQueryClient()
  const [instruments, setInstruments] = useState<Instrument[]>([])

  // Reseeds the draft whenever a different member is opened - adjusted
  // during render (React's recommended alternative to a setState-in-effect
  // here, see https://react.dev/learn/you-might-not-need-an-effect) rather
  // than an effect, since the dialog stays mounted across opens/closes and
  // would otherwise keep showing whichever member's instruments it last held.
  const [seededMemberId, setSeededMemberId] = useState<string | null>(null)
  if (member && member.id !== seededMemberId) {
    setSeededMemberId(member.id)
    setInstruments(member.instruments)
  }

  const toggleInstrument = (instrument: Instrument) => {
    setInstruments((prev) =>
      prev.includes(instrument) ? prev.filter((i) => i !== instrument) : [...prev, instrument]
    )
  }

  const updateInstruments = useMutation({
    mutationFn: async () => {
      // Guaranteed non-null while this can actually be invoked - the save
      // button is only rendered when `member` is set (see the dialog body
      // below), and disabled while a save is in flight.
      const current = member!

      const { error } = await apiClient.PATCH("/api/musicians/{id}", {
        params: { path: { id: current.musicianId } },
        body: { instruments },
      })
      if (error) throw new Error("Failed to update instruments.")
    },
    onSuccess: () => {
      toast.success("Instruments updated.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <Dialog
      open={!!member}
      onOpenChange={(next) => {
        if (!updateInstruments.isPending) onOpenChange(next)
      }}
    >
      {/* Stops clicks from bubbling to the member row that opened this - see
        SongDetailsSheet.tsx for the same guard. */}
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar>
              <AvatarImage src={member?.user.image ?? undefined} alt={member?.user.name} />
              <AvatarFallback>{member?.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{member?.user.name}</span>
          </DialogTitle>
        </DialogHeader>

        {member && (
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
        )}

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
