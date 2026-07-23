"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Separator } from "@workspace/ui/components/Separator"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { format } from "date-fns"
import { BookOpen, CalendarX2, ChevronLeft, Compass } from "lucide-react"
import Link from "next/link"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { EditLineupSheet } from "@/components/line-ups/EditLineupSheet"
import { LineupDiscussion } from "@/components/line-ups/LineupDiscussion"
import { LineupRosterSection } from "@/components/line-ups/LineupRosterSection"
import { LineupSongList } from "@/components/line-ups/LineupSongList"
import { LineupStatusBadge } from "@/components/line-ups/LineupStatusBadge"
import { formatLineupServiceType } from "@/utils/lineup-service-type"
import type { Lineup } from "@/components/line-ups/LineupList"

interface LineupDetailsViewProps {
  lineupId: string
}

interface AboutFieldProps {
  icon: FunctionComponent<{ className?: string }>
  label: string
  value: string | null
  placeholder: string
}

// One "About" field - an icon-labeled heading over either the value or a
// muted placeholder when it hasn't been set. Mirrors LineupSongList's own
// CardHeader/CardContent shape so the About tab reads as the same visual
// language as the Line up tab's card, just swapped for a different pair of
// fields.
const AboutField: FunctionComponent<AboutFieldProps> = ({ icon: Icon, label, value, placeholder }) => (
  <>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {value ? (
        <p className="text-sm whitespace-pre-line text-foreground/90">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{placeholder}</p>
      )}
    </CardContent>
  </>
)

interface LineupAboutProps {
  lineup: Lineup
}

const LineupAbout: FunctionComponent<LineupAboutProps> = ({ lineup }) => (
  <Card size="sm">
    <AboutField
      icon={BookOpen}
      label="Word Reference"
      value={lineup.wordReference}
      placeholder="No reference added yet."
    />
    <Separator />
    <AboutField
      icon={Compass}
      label="Direction"
      value={lineup.direction}
      placeholder="No direction added yet."
    />
  </Card>
)

// Thin orchestrator for the lineup detail page - fetches the lineup itself
// (title/meta, roster, songs, singers all come off this one query) and
// assembles the three self-contained "lego" sections around it:
// LineupRosterSection, LineupSongList, and LineupDiscussion. Each of those
// owns its own data fetching/mutations for its slice of the page, so this
// component only has to pass through the bits of `lineup` each one needs.
export const LineupDetailsView: FunctionComponent<LineupDetailsViewProps> = ({ lineupId }) => {
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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
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
                <div className="min-w-0 flex-1">
                  {lineup.seriesName && (
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium tracking-wide text-sidebar-primary uppercase">
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

                  <LineupRosterSection lineupId={lineupId} members={lineup.members} />
                </div>
              </div>

              <Tabs defaultValue="line-up" className="gap-4">
                <TabsList className="grid w-full grid-cols-2 lg:w-sm">
                  <TabsTrigger value="about">About</TabsTrigger>
                  <TabsTrigger value="line-up">Line up</TabsTrigger>
                </TabsList>

                <TabsContent value="about">
                  <LineupAbout lineup={lineup} />
                </TabsContent>

                <TabsContent value="line-up">
                  <Card size="sm">
                    <LineupSongList lineupId={lineupId} songs={lineup.songs} members={lineup.members} />
                    <LineupDiscussion lineupId={lineupId} />
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
