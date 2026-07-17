"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@workspace/ui/components/Sheet"
import { cn } from "@workspace/ui/lib/utils"
import { HeadphoneOff, Plus } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { EditTeamForm } from "@/components/teams/EditTeamForm"
import { useSession } from "@/components/SessionProvider"
import { UpdateTeamMemberDialog } from "@/components/teams/UpdateTeamMemberDialog"
import { formatInstrument } from "@/utils/instruments"
import type { Team } from "@/components/teams/TeamList"

interface TeamDetailsSheetProps {
  team: Team
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "view" | "edit"
  onModeChange: (mode: "view" | "edit") => void
}

export const TeamDetailsSheet: FunctionComponent<TeamDetailsSheetProps> = ({
  team,
  open,
  onOpenChange,
  mode,
  onModeChange,
}) => {
  const session = useSession()
  const isAdmin = session?.user.role === "admin"
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const selectedMember = team.members.find((m) => m.id === selectedMemberId) ?? null
  // Set only by the "Add member" empty-state action below, so the edit
  // form's musicians search input is focused specifically for that entry
  // point - not when edit mode is reached via the regular "Update" button.
  const [focusMusiciansOnEdit, setFocusMusiciansOnEdit] = useState(false)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* Stops clicks (including the close button, whose focus-restoration
        can land back on the card that opened this) from bubbling to the
        card's own onClick - see SongDetailsSheet.tsx for the same guard. */}
        <SheetContent
          side="right"
          className="flex flex-col gap-0 data-[side=right]:lg:max-w-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {mode === "edit" ? (
            <>
              <SheetHeader>
                <SheetTitle>Edit team</SheetTitle>
              </SheetHeader>
              <EditTeamForm
                team={team}
                autoFocusMusicians={focusMusiciansOnEdit}
                onSuccess={() => {
                  onModeChange("view")
                  setFocusMusiciansOnEdit(false)
                }}
                onCancel={() => {
                  onModeChange("view")
                  setFocusMusiciansOnEdit(false)
                }}
              />
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="min-w-0 truncate">{team.name}</SheetTitle>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                <div className="flex items-center gap-2 pb-4">
                  {team.leader ? (
                    <>
                      <Avatar>
                        <AvatarImage src={team.leader.image ?? undefined} alt={team.leader.name} />
                        <AvatarFallback>{team.leader.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <p className="min-w-0 truncate text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{team.leader.name}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No leader assigned</p>
                  )}
                </div>

                <p className="border-t pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Musicians{team.members.length > 0 && ` · ${team.members.length}`}
                </p>

                {team.members.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {team.members.map((member) => (
                      <li
                        key={member.id}
                        role={isAdmin ? "button" : undefined}
                        tabIndex={isAdmin ? 0 : undefined}
                        onClick={isAdmin ? () => setSelectedMemberId(member.id) : undefined}
                        onKeyDown={
                          isAdmin
                            ? (e) => {
                                if (e.key !== "Enter" && e.key !== " ") return
                                e.preventDefault()
                                setSelectedMemberId(member.id)
                              }
                            : undefined
                        }
                        className={cn(
                          "-mx-2 flex items-center gap-3 px-2 py-3",
                          isAdmin && "cursor-pointer transition-colors hover:bg-accent/50"
                        )}
                      >
                        <Avatar size="sm">
                          <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                          <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-sm">{member.user.name}</p>
                        {member.instruments.length > 0 && (
                          <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
                            {member.instruments.map((instrument) => (
                              <Badge key={instrument} variant="outline">
                                {formatInstrument(instrument)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty className="mt-10 min-h-0 gap-1 rounded-lg py-6">
                    <EmptyIcon className="mb-0 [&>svg]:size-20">
                      <HeadphoneOff />
                    </EmptyIcon>
                    <div className="mt-2">
                      <EmptyTitle>No musicians added yet</EmptyTitle>
                      <EmptyDescription>Add someone to the roster.</EmptyDescription>
                    </div>
                    {isAdmin && (
                      <EmptyAction>
                        <Button
                          type="button"
                          onClick={() => {
                            setFocusMusiciansOnEdit(true)
                            onModeChange("edit")
                          }}
                        >
                          <Plus />
                          Add member
                        </Button>
                      </EmptyAction>
                    )}
                  </Empty>
                )}
              </div>

              <SheetFooter className="flex-row justify-end border-t bg-muted/50">
                <Button type="button" variant="outline">
                  Close
                </Button>
                {isAdmin && (
                  <Button type="button" onClick={() => onModeChange("edit")}>
                    Update
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <UpdateTeamMemberDialog
        member={selectedMember}
        onOpenChange={(next) => {
          if (!next) setSelectedMemberId(null)
        }}
      />
    </>
  )
}
