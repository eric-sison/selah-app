"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { format } from "date-fns"
import { Check, Clock, FileMusic, ListMusic, MessageCircle, SearchX, Users } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { FunctionComponent, type ReactNode } from "react"
import { apiClient } from "@/lib/api-client"
import { CreateLineupSheet } from "@/components/line-ups/CreateLineupSheet"
import { LINEUP_STATUS_LABELS, type LineupStatus } from "@/utils/lineup-status"
import type { operations } from "@/types/api"

export type Lineup = operations["listLineups"]["responses"][200]["content"]["application/json"][number]

// Caps how many roster avatars stack before collapsing into a "+N" count,
// mirroring TeamList's AvatarGroup/AvatarGroupCount usage.
const MAX_VISIBLE_MEMBER_AVATARS = 5
const SKELETON_CARD_COUNT = 6

const STATUS_BADGE_CLASSES: Record<LineupStatus, string> = {
  draft: "",
  pending: "border-transparent bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  approved:
    "border-transparent bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
}

const STATUS_ICONS: Record<LineupStatus, ReactNode> = {
  draft: null,
  pending: <Clock />,
  approved: <Check />,
}

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

// Mirrors the "Line Ups" list-card design (big date block, a colored status
// pill, series/topic hierarchy, then a team+roster row and a song/discussion
// count footer) - service type, word reference, and rehearsal date are
// deliberately left for the detail view rather than crowding this card.
const LineupCard: FunctionComponent<LineupCardProps> = ({ lineup }) => {
  const serviceDate = new Date(lineup.serviceDate)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-xl leading-none font-bold tracking-tight">
            {format(serviceDate, "dd")}
          </span>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {format(serviceDate, "MMM")}
          </span>
        </div>
        <CardAction>
          <Badge
            variant={lineup.status === "draft" ? "outline" : "secondary"}
            className={STATUS_BADGE_CLASSES[lineup.status]}
          >
            {STATUS_ICONS[lineup.status]}
            {LINEUP_STATUS_LABELS[lineup.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold tracking-wide text-sidebar-primary uppercase">
            {lineup.seriesName}
          </p>
          <CardTitle className="min-w-0 truncate">{lineup.topic}</CardTitle>
        </div>

        <div className="flex items-center justify-between gap-2">
          {lineup.members.length > 0 ? (
            <AvatarGroup>
              {lineup.members.slice(0, MAX_VISIBLE_MEMBER_AVATARS).map((member) => (
                <Avatar key={member.id} size="sm">
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
          <span className="min-w-0 truncate text-xs text-muted-foreground">{lineup.team.name}</span>
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
  )
}

export const LineupList: FunctionComponent = () => {
  const searchParams = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  const status = searchParams.get("status") ?? ""
  const hasActiveFilters = q.length > 0 || from.length > 0 || to.length > 0 || status.length > 0

  const lineups = useQuery({
    queryKey: ["lineups", { q, from, to, status }],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups", {
        params: {
          query: {
            q: q || undefined,
            from: from || undefined,
            to: to || undefined,
            status: status || undefined,
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
