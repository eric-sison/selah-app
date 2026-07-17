"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/ui/components/HoverCard"
import { Separator } from "@workspace/ui/components/Separator"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { toast } from "@workspace/ui/components/Sonner"
import { format } from "date-fns"
import { BookOpen, CalendarX2, ChevronDown, ChevronLeft, Mic2, Music } from "lucide-react"
import Link from "next/link"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { EditLineupSheet } from "@/components/line-ups/EditLineupSheet"
import type { Lineup } from "@/components/line-ups/LineupList"
import { LineupStatusBadge } from "@/components/line-ups/LineupStatusBadge"
import { formatInstrument, type Instrument } from "@/utils/instruments"
import { formatLineupServiceType } from "@/utils/lineup-service-type"

// Caps how many roster avatars stack before collapsing into a "+N" count -
// mirrors LineupList.tsx's own MAX_VISIBLE_MEMBER_AVATARS.
const MAX_VISIBLE_MEMBER_AVATARS = 5

interface RosterAvatarProps {
  name: string
  image: string | null
  role: string
  instruments?: Instrument[]
  isAvailable?: boolean
}

// One roster member's avatar within the AvatarGroup - hovering reveals who
// they are and what they play without leaving the page or opening a
// separate roster section. `data-slot="avatar"` is re-asserted on the
// HoverCardTrigger's render target because merging the trigger's own props
// onto the Avatar element would otherwise overwrite Avatar's own
// `data-slot="avatar"`, which is what AvatarGroup's sibling-ring styling
// (`*:data-[slot=avatar]:ring-2`) keys off of.
const RosterAvatar: FunctionComponent<RosterAvatarProps> = ({
  name,
  image,
  role,
  instruments,
  isAvailable,
}) => (
  <HoverCard>
    <HoverCardTrigger render={<Avatar size="sm" data-slot="avatar" />}>
      <AvatarImage src={image ?? undefined} alt={name} />
      <AvatarFallback>{name.charAt(0)}</AvatarFallback>
    </HoverCardTrigger>
    <HoverCardContent className="w-56">
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          <AvatarImage src={image ?? undefined} alt={name} />
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{role}</p>
        </div>
      </div>
      {instruments && instruments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {instruments.map((instrument) => (
            <Badge key={instrument} variant="secondary" className="text-[11px]">
              {formatInstrument(instrument)}
            </Badge>
          ))}
        </div>
      )}
      {isAvailable === false && (
        <Badge variant="secondary" className="mt-2">
          Unavailable
        </Badge>
      )}
    </HoverCardContent>
  </HoverCard>
)

interface AssignSingerDropdownProps {
  members: Lineup["members"]
  disabled?: boolean
  onAssign: (singerId: string) => void
}

// Lets an admin pick a singer for a song directly from the detail page,
// sourced from the lineup's own roster - shown in place of "No singer" so
// assigning one doesn't require going back into the edit sheet. Reassigning
// an already-sung song isn't supported here yet, only the initial pick.
const AssignSingerDropdown: FunctionComponent<AssignSingerDropdownProps> = ({
  members,
  disabled,
  onAssign,
}) => {
  if (members.length === 0) {
    return <span className="shrink-0 text-xs text-muted-foreground">No singer</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-6 shrink-0 gap-1 px-1.5 text-xs font-normal text-muted-foreground"
          />
        }
      >
        <Mic2 className="size-3" />
        Assign singer
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {members.map((member) => (
          <DropdownMenuItem key={member.id} onClick={() => onAssign(member.user.id)}>
            <Avatar size="sm">
              <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
              <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            {member.user.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface LineupDetailsViewProps {
  lineupId: string
}

export const LineupDetailsView: FunctionComponent<LineupDetailsViewProps> = ({ lineupId }) => {
  const queryClient = useQueryClient()

  const lineupQuery = useQuery({
    queryKey: ["lineup", lineupId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups/{id}", {
        params: { path: { id: lineupId } },
      })
      if (error) throw error
      return data
    },
    retry: false,
  })

  const lineup = lineupQuery.data
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false)

  const assignSinger = useMutation({
    mutationFn: async ({ songId, singerId }: { songId: string; singerId: string }) => {
      const { error } = await apiClient.PATCH("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: lineupId, songId } },
        body: { singerId },
      })
      if (error) throw new Error("Failed to assign singer.")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineup", lineupId] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={
            <Link href="/line-ups">
              <ChevronLeft />
              Line Ups
            </Link>
          }
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!lineup} onClick={() => setUpdateSheetOpen(true)}>
            Update details
          </Button>
          <Button size="sm" variant="outline">
            Send for approval
          </Button>
        </div>
      </div>
      {lineup && <EditLineupSheet lineup={lineup} open={updateSheetOpen} onOpenChange={setUpdateSheetOpen} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {lineupQuery.isLoading ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : lineupQuery.isError || !lineup ? (
            <Empty className="h-full">
              <EmptyIcon>
                <CalendarX2 />
              </EmptyIcon>
              <EmptyTitle>Line up not found</EmptyTitle>
              <EmptyDescription>The requested line up could not be found.</EmptyDescription>
            </Empty>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  {lineup.seriesName && (
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {lineup.seriesName}
                      </p>
                      <LineupStatusBadge status={lineup.status} />
                    </div>
                  )}
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {lineup.topic ?? "Untitled"}
                  </h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {format(new Date(lineup.serviceDate), "EEEE, MMMM d, yyyy")} &middot;{" "}
                    {formatLineupServiceType(lineup.serviceType)} &middot; {lineup.team.name}
                  </p>
                  {lineup.rehearsalDate && (
                    <p className="text-sm text-muted-foreground">
                      Rehearsal: {format(new Date(lineup.rehearsalDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              </div>

              {(lineup.wordReference || lineup.wordText || lineup.direction) && (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <BookOpen className="size-4" />
                        Word
                      </span>
                      {lineup.wordReference && <Badge variant="secondary">{lineup.wordReference}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  {(lineup.wordText || lineup.direction) && (
                    <CardContent className="flex flex-col gap-2">
                      {lineup.wordText && <p className="text-sm whitespace-pre-line">{lineup.wordText}</p>}
                      {lineup.direction && (
                        <>
                          <Separator />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">Direction</p>
                            <p className="mt-1 text-justify text-sm whitespace-pre-line">
                              {lineup.direction}
                            </p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Music className="size-4" />
                      Song List
                    </span>
                    {lineup.songs.length > 0 && (
                      <span className="font-normal">
                        {lineup.songs.length} song{lineup.songs.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lineup.songs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No songs yet.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {lineup.songs.map((entry) => {
                        const meta = [
                          entry.song.musicalKey ? `Key of ${entry.song.musicalKey}` : null,
                          entry.song.tempo ? `${entry.song.tempo} BPM` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")

                        return (
                          <li key={entry.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                            <span className="w-4 shrink-0 text-sm text-muted-foreground tabular-nums">
                              {entry.position + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{entry.song.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {entry.song.artist ?? "Unknown artist"}
                              </p>
                            </div>
                            {entry.singer ? (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Avatar size="sm">
                                  <AvatarImage
                                    src={entry.singer.image ?? undefined}
                                    alt={entry.singer.name}
                                  />
                                  <AvatarFallback>{entry.singer.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="max-w-24 truncate text-xs text-muted-foreground">
                                  {entry.singer.name}
                                </span>
                              </div>
                            ) : (
                              <AssignSingerDropdown
                                members={lineup.members}
                                disabled={assignSinger.isPending}
                                onAssign={(singerId) =>
                                  assignSinger.mutate({ songId: entry.song.id, singerId })
                                }
                              />
                            )}
                            {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
                <CardFooter className="items-center justify-between gap-2">
                  {lineup.members.length === 0 && !lineup.devoLeader ? (
                    <p className="text-sm text-muted-foreground">No roster yet.</p>
                  ) : (
                    <AvatarGroup>
                      {lineup.devoLeader && (
                        <RosterAvatar
                          name={lineup.devoLeader.name}
                          image={lineup.devoLeader.image}
                          role="Devo Leader"
                        />
                      )}
                      {lineup.members.slice(0, MAX_VISIBLE_MEMBER_AVATARS).map((member) => (
                        <RosterAvatar
                          key={member.id}
                          name={member.user.name}
                          image={member.user.image}
                          role={
                            member.instruments.length > 0
                              ? member.instruments.map(formatInstrument).join(", ")
                              : "Roster member"
                          }
                          instruments={member.instruments}
                          isAvailable={member.isAvailable}
                        />
                      ))}
                      {lineup.members.length > MAX_VISIBLE_MEMBER_AVATARS && (
                        <AvatarGroupCount>
                          +{lineup.members.length - MAX_VISIBLE_MEMBER_AVATARS}
                        </AvatarGroupCount>
                      )}
                    </AvatarGroup>
                  )}
                </CardFooter>
              </Card>

              {/* <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageCircle className="size-4" />
                {lineup.commentCount} comment{lineup.commentCount === 1 ? "" : "s"}
              </div> */}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
