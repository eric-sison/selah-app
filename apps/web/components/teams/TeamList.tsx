"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { toast } from "@workspace/ui/components/Sonner"
import { Spinner } from "@workspace/ui/components/Spinner"
import { EllipsisVertical, Trash, User, UserRoundX } from "lucide-react"
import { FunctionComponent, MouseEvent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { CreateTeamSheet } from "./CreateTeamSheet"
import { useSession } from "@/components/SessionProvider"
import { TeamDetailsSheet } from "./TeamDetailsSheet"
import type { operations } from "@/types/api"

export type Team = operations["listTeams"]["responses"][200]["content"]["application/json"][number]

// Caps how many member avatars stack before collapsing into a "+N" count,
// mirroring AvatarGroup/AvatarGroupCount's intended usage.
const MAX_VISIBLE_MEMBER_AVATARS = 5
const SKELETON_CARD_COUNT = 6

const TeamCardSkeleton: FunctionComponent = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </CardHeader>
    <CardContent className="flex items-center gap-2">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <Skeleton className="h-3 w-24" />
    </CardContent>
  </Card>
)

interface TeamCardProps {
  team: Team
}

// Stops a click (including one inside the dropdown menu or the delete
// confirmation) from bubbling up to the card's own onClick - see
// SongList.tsx's SongRow for the same guard around its row-level actions.
const stop = (e: MouseEvent) => e.stopPropagation()

const TeamCard: FunctionComponent<TeamCardProps> = ({ team }) => {
  const session = useSession()
  const isAdmin = session?.user.role === "admin"
  const queryClient = useQueryClient()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsMode, setDetailsMode] = useState<"view" | "edit">("view")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const openDetails = (mode: "view" | "edit") => {
    setDetailsMode(mode)
    setDetailsOpen(true)
  }

  const deleteTeam = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE("/api/teams/{id}", { params: { path: { id: team.id } } })
      if (error) throw new Error("Failed to delete team.")
    },
    onSuccess: () => {
      toast.success("Team deleted.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      setDeleteDialogOpen(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => openDetails("view")}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          openDetails("view")
        }}
        className="cursor-pointer transition-colors hover:bg-accent/50"
      >
        <CardHeader>
          <CardTitle className="min-w-0 truncate">{team.name}</CardTitle>
          <CardDescription className="text-xs">
            {team.members.length === 0
              ? "No members"
              : team.members.length === 1
                ? `${team.members.length} member`
                : `${team.members.length} members`}
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label="Team options"
                      onClick={stop}
                    />
                  }
                >
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={stop}>
                  <DropdownMenuItem onClick={() => openDetails("view")}>View details</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openDetails("edit")}>Update</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {team.leader ? (
              <>
                <Avatar size="sm">
                  <AvatarImage src={team.leader.image ?? undefined} alt={team.leader.name} />
                  <AvatarFallback>{team.leader.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{team.leader.name}</span>
              </>
            ) : (
              <>
                <User className="size-4 shrink-0" />
                <span className="truncate text-xs">No leader assigned</span>
              </>
            )}
          </div>

          {team.members.length > 0 && (
            <AvatarGroup>
              {team.members.slice(0, MAX_VISIBLE_MEMBER_AVATARS).map((member) => (
                <Avatar key={member.id} size="sm">
                  <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                  <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
                </Avatar>
              ))}
              {team.members.length > MAX_VISIBLE_MEMBER_AVATARS && (
                <AvatarGroupCount>+{team.members.length - MAX_VISIBLE_MEMBER_AVATARS}</AvatarGroupCount>
              )}
            </AvatarGroup>
          )}
        </CardContent>
      </Card>

      <TeamDetailsSheet
        team={team}
        open={detailsOpen}
        onOpenChange={(next) => {
          setDetailsOpen(next)
          if (!next) setDetailsMode("view")
        }}
        mode={detailsMode}
        onModeChange={setDetailsMode}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(next) => {
          if (!deleteTeam.isPending) setDeleteDialogOpen(next)
        }}
      >
        <AlertDialogContent onClick={stop} size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete &quot;{team.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the team, its roster, and every member&apos;s role assignments. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTeam.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTeam.isPending}
              onClick={() => deleteTeam.mutate()}
            >
              {deleteTeam.isPending && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const TeamList: FunctionComponent = () => {
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/teams")
      if (error) throw new Error("Failed to load teams.")
      return data
    },
  })

  if (teams.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <TeamCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (!teams.data?.length) {
    return (
      <Empty className="min-h-0">
        <EmptyIcon>
          <UserRoundX />
        </EmptyIcon>
        <EmptyTitle>No teams yet</EmptyTitle>
        <EmptyDescription>Create a team to start assigning musicians.</EmptyDescription>
        <EmptyAction>
          <CreateTeamSheet />
        </EmptyAction>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
      {teams.data.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}
    </div>
  )
}
