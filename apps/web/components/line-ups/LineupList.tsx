"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
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
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
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
import { Spinner } from "@workspace/ui/components/Spinner"
import { toast } from "@workspace/ui/components/Sonner"
import { format } from "date-fns"
import { EllipsisVertical, FileMusic, ListMusic, MessageCircle, SearchX, Trash, Users } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FunctionComponent, type MouseEvent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { CreateLineupSheet } from "@/components/line-ups/CreateLineupSheet"
import { EditLineupSheet } from "@/components/line-ups/EditLineupSheet"
import { LineupStatusBadge } from "@/components/line-ups/LineupStatusBadge"
import { useSession } from "@/components/SessionProvider"
import type { operations } from "@/types/api"

export type Lineup = operations["listLineups"]["responses"][200]["content"]["application/json"][number]

// Caps how many roster avatars stack before collapsing into a "+N" count,
// mirroring TeamList's AvatarGroup/AvatarGroupCount usage.
const MAX_VISIBLE_MEMBER_AVATARS = 5
const SKELETON_CARD_COUNT = 6

const LineupCardSkeleton: FunctionComponent = () => (
  <Card>
    <CardHeader>
      <div className="flex items-baseline gap-1.5">
        <Skeleton className="h-6 w-8" />
        <Skeleton className="h-3 w-8" />
      </div>
      <CardAction>
        <Skeleton className="h-5 w-16 rounded-full" />
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="size-6 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </CardContent>
    <CardFooter className="flex items-center justify-between gap-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-6" />
    </CardFooter>
  </Card>
)

interface LineupCardProps {
  lineup: Lineup
}

// Whether an admin can still freely change a lineup's set list/roster/own
// fields through Update/Delete - once it's been submitted (pending) or
// signed off (approved), those are locked from this menu; "Convert to
// draft" (pending-only) is the escape hatch back to an editable state.
const EDITABLE_STATUSES: ReadonlySet<Lineup["status"]> = new Set(["draft"])

// Mirrors the "Line Ups" list-card design (big date block, a colored status
// pill, series/topic hierarchy, then a team+roster row and a song/discussion
// count footer) - service type, word reference, and rehearsal date are
// deliberately left for the detail view rather than crowding this card.
const LineupCard: FunctionComponent<LineupCardProps> = ({ lineup }) => {
  const router = useRouter()
  const session = useSession()
  const queryClient = useQueryClient()
  const isAdmin = session?.user.role === "admin"

  const [updateSheetOpen, setUpdateSheetOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const serviceDate = new Date(lineup.serviceDate)
  const isEditable = EDITABLE_STATUSES.has(lineup.status)

  // Menu items open in portals, which still bubble React synthetic events up
  // through the component tree (not the DOM tree) to the card's wrapping
  // <Link>. stopPropagation alone isn't enough here (unlike SongList.tsx's
  // `stop`, whose row is a plain div) - Next's Link navigates via its own
  // onClick, but a click's default action (the actual navigation) fires
  // based on the event reaching the anchor natively, independent of
  // stopPropagation; only preventDefault reliably suppresses it.
  const stop = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const convertToDraft = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.PATCH("/api/lineups/{id}", {
        params: { path: { id: lineup.id } },
        body: { status: "draft" },
      })
      if (error) throw new Error("Failed to convert line up to draft.")
    },
    onSuccess: () => {
      toast.success("Line up converted to draft.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["lineups"] })
      queryClient.invalidateQueries({ queryKey: ["lineup", lineup.id] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const deleteLineup = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE("/api/lineups/{id}", {
        params: { path: { id: lineup.id } },
      })
      if (error) throw new Error("Failed to delete line up.")
    },
    onSuccess: () => {
      toast.success("Line up deleted.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["lineups"] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["lineup", lineup.id] })
      setDeleteDialogOpen(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <>
      <Link
        href={`/line-ups/${lineup.id}`}
        className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl leading-none font-bold tracking-tight">
                {format(serviceDate, "dd")}
              </span>
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {format(serviceDate, "MMM")}
              </span>
            </div>
            <CardAction className="flex items-center gap-1.5">
              <LineupStatusBadge status={lineup.status} />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label="Line up actions"
                      onClick={stop}
                    />
                  }
                >
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={stop}>
                  {isAdmin && lineup.status === "pending" && (
                    <>
                      <DropdownMenuItem
                        disabled={convertToDraft.isPending}
                        onClick={() => convertToDraft.mutate()}
                      >
                        {convertToDraft.isPending && <Spinner />}
                        Convert to draft
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => router.push(`/line-ups/${lineup.id}`)}>
                    View Details
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuItem disabled={!isEditable} onClick={() => setUpdateSheetOpen(true)}>
                        Update
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!isEditable}
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="min-w-0">
              {lineup.seriesName && (
                <p className="truncate text-[11px] font-bold tracking-wide text-sidebar-primary uppercase">
                  {lineup.seriesName}
                </p>
              )}
              <CardTitle className="min-w-0 truncate">{lineup.topic ?? "Untitled"}</CardTitle>
            </div>

            <div className="flex items-center justify-between gap-2">
              {lineup.members.length > 0 ? (
                <AvatarGroup>
                  {lineup.members.slice(0, MAX_VISIBLE_MEMBER_AVATARS).map((member) => (
                    <Avatar key={member.id}>
                      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                      <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  ))}
                  {lineup.members.length > MAX_VISIBLE_MEMBER_AVATARS && (
                    <AvatarGroupCount>+{lineup.members.length - MAX_VISIBLE_MEMBER_AVATARS}</AvatarGroupCount>
                  )}
                </AvatarGroup>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  No roster yet
                </div>
              )}
              <span className="min-w-0 truncate text-muted-foreground">{lineup.team.name}</span>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-1.5">
              <ListMusic className="size-3.5 shrink-0" />
              <span className="truncate">
                {lineup.songs.length === 0
                  ? "No songs yet"
                  : `${lineup.songs.length} song${lineup.songs.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <MessageCircle className="size-3.5" />
              <span>{lineup.commentCount}</span>
            </div>
          </CardFooter>
        </Card>
      </Link>

      {/* Rendered as a sibling of the Link, not nested inside it - these
          portal their content, but React still bubbles clicks up through
          the *component* tree regardless of where the DOM node ends up, so
          keeping them out of the Link's subtree entirely means interacting
          with the sheet/dialog (typing, submitting, canceling) can never
          also trigger the card's navigation. */}
      {isAdmin && (
        <>
          <EditLineupSheet lineup={lineup} open={updateSheetOpen} onOpenChange={setUpdateSheetOpen} />

          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (!deleteLineup.isPending) setDeleteDialogOpen(open)
            }}
          >
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <Trash />
                </AlertDialogMedia>
                <AlertDialogTitle>Delete this line up?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the line up, its set list, roster, schedule slots, and discussion.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteLineup.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteLineup.isPending}
                  onClick={() => deleteLineup.mutate()}
                >
                  {deleteLineup.isPending && <Spinner />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  )
}

export const LineupList: FunctionComponent = () => {
  const searchParams = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  const status = searchParams.get("status") ?? ""
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc"
  const hasActiveFilters = q.length > 0 || from.length > 0 || to.length > 0 || status.length > 0

  const lineups = useQuery({
    queryKey: ["lineups", { q, from, to, status, sort }],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups", {
        params: {
          query: {
            q: q || undefined,
            from: from || undefined,
            to: to || undefined,
            status: status || undefined,
            sort,
          },
        },
      })
      if (error) throw new Error("Failed to load line ups.")
      return data
    },
  })

  if (lineups.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <LineupCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (!lineups.data?.length) {
    if (hasActiveFilters) {
      return (
        <Empty className="min-h-0">
          <EmptyIcon>
            <SearchX />
          </EmptyIcon>
          <EmptyTitle>No line ups match your filters</EmptyTitle>
          <EmptyDescription>Try a different search or clear the filters above.</EmptyDescription>
        </Empty>
      )
    }

    return (
      <Empty className="min-h-0">
        <EmptyIcon>
          <FileMusic />
        </EmptyIcon>
        <EmptyTitle>No line ups yet</EmptyTitle>
        <EmptyDescription>Create a lineup to organize songs for services.</EmptyDescription>
        <EmptyAction>
          <CreateLineupSheet />
        </EmptyAction>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
      {lineups.data.map((lineup) => (
        <LineupCard key={lineup.id} lineup={lineup} />
      ))}
    </div>
  )
}
