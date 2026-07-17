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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { format } from "date-fns"
import { FileMusic, ListMusic, Users } from "lucide-react"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { CreateLineupSheet } from "@/components/line-ups/CreateLineupSheet"
import { formatLineupServiceType } from "@/utils/lineup-service-type"
import { LINEUP_STATUS_LABELS, type LineupStatus } from "@/utils/lineup-status"
import type { operations } from "@/types/api"

export type Lineup = operations["listLineups"]["responses"][200]["content"]["application/json"][number]

// Caps how many roster avatars stack before collapsing into a "+N" count,
// mirroring TeamList's AvatarGroup/AvatarGroupCount usage.
const MAX_VISIBLE_MEMBER_AVATARS = 5
const SKELETON_CARD_COUNT = 6

const STATUS_BADGE_CLASSES: Record<LineupStatus, string> = {
  draft: "",
  pending: "",
  approved:
    "border-transparent bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
}

const LineupCardSkeleton: FunctionComponent = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 shrink-0 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </CardContent>
  </Card>
)

interface LineupCardProps {
  lineup: Lineup
}

const LineupCard: FunctionComponent<LineupCardProps> = ({ lineup }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={lineup.status === "draft" ? "outline" : "secondary"}
            className={STATUS_BADGE_CLASSES[lineup.status]}
          >
            {LINEUP_STATUS_LABELS[lineup.status]}
          </Badge>
          <Badge variant="outline">{formatLineupServiceType(lineup.serviceType)}</Badge>
        </div>
        <CardTitle className="min-w-0 truncate">{lineup.seriesName}</CardTitle>
        <CardDescription className="truncate">{lineup.topic}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>{format(new Date(lineup.serviceDate), "EEE, MMM d 'at' h:mm a")}</span>
          <span className="truncate">{lineup.team.name}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListMusic className="size-3.5" />
            {lineup.songs.length === 0
              ? "No songs yet"
              : `${lineup.songs.length} song${lineup.songs.length === 1 ? "" : "s"}`}
          </div>

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
        </div>
      </CardContent>
    </Card>
  )
}

export const LineupList: FunctionComponent = () => {
  const lineups = useQuery({
    queryKey: ["lineups"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups")
      if (error) throw new Error("Failed to load line ups.")
      return data
    },
  })

  if (lineups.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <LineupCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (!lineups.data?.length) {
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
    <div className="grid grid-cols-1 gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
      {lineups.data.map((lineup) => (
        <LineupCard key={lineup.id} lineup={lineup} />
      ))}
    </div>
  )
}
