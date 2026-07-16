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
import { formatTeamRole, TEAM_ROLES, type TeamRole } from "@/utils/team-roles"
import type { Team } from "@/components/TeamList"

type TeamMember = Team["members"][number]

interface UpdateTeamMemberDialogProps {
  teamId: string
  /** Null closes the dialog - passing the member itself (rather than just an id) avoids an extra `team.members.find` lookup at every call site. */
  member: TeamMember | null
  onOpenChange: (open: boolean) => void
}

// A member's only editable field here is their role assignments - renaming,
// removing, or reassigning as leader all go through EditTeamForm instead.
export const UpdateTeamMemberDialog: FunctionComponent<UpdateTeamMemberDialogProps> = ({
  teamId,
  member,
  onOpenChange,
}) => {
  const queryClient = useQueryClient()
  const [roles, setRoles] = useState<TeamRole[]>([])

  // Reseeds the draft whenever a different member is opened - adjusted
  // during render (React's recommended alternative to a setState-in-effect
  // here, see https://react.dev/learn/you-might-not-need-an-effect) rather
  // than an effect, since the dialog stays mounted across opens/closes and
  // would otherwise keep showing whichever member's roles it last held.
  const [seededMemberId, setSeededMemberId] = useState<string | null>(null)
  if (member && member.id !== seededMemberId) {
    setSeededMemberId(member.id)
    setRoles(member.roles)
  }

  const toggleRole = (role: TeamRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  const updateRoles = useMutation({
    mutationFn: async () => {
      // Guaranteed non-null while this can actually be invoked - the save
      // button is only rendered when `member` is set (see the dialog body
      // below), and disabled while a save is in flight.
      const current = member!

      const rolesToAdd = roles.filter((role) => !current.roles.includes(role))
      const rolesToRemove = current.roles.filter((role) => !roles.includes(role))

      for (const role of rolesToAdd) {
        const { error } = await apiClient.POST("/api/teams/{id}/members/{memberId}/roles", {
          params: { path: { id: teamId, memberId: current.id } },
          body: { role },
        })
        if (error) throw new Error("Failed to assign a role.")
      }
      for (const role of rolesToRemove) {
        const { error } = await apiClient.DELETE("/api/teams/{id}/members/{memberId}/roles/{role}", {
          params: { path: { id: teamId, memberId: current.id, role } },
        })
        if (error) throw new Error("Failed to remove a role.")
      }
    },
    onSuccess: () => {
      toast.success("Roles updated.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
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
        if (!updateRoles.isPending) onOpenChange(next)
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
            {TEAM_ROLES.map((role) => {
              const isSelected = roles.includes(role)
              return (
                <Badge
                  key={role}
                  variant={isSelected ? "default" : "outline"}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => toggleRole(role)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                    toggleRole(role)
                  }}
                  className="cursor-pointer select-none"
                >
                  {formatTeamRole(role)}
                </Badge>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={updateRoles.isPending} />}>
            Cancel
          </DialogClose>
          <Button onClick={() => updateRoles.mutate()} disabled={updateRoles.isPending}>
            {updateRoles.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
