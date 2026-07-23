"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { Separator } from "@workspace/ui/components/Separator"
import { cn } from "@workspace/ui/lib/utils"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight, ListMusic, SquareArrowOutUpRight, Users } from "lucide-react"
import Link from "next/link"
import { FunctionComponent, useMemo, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { LineupStatusBadge } from "@/components/line-ups/LineupStatusBadge"
import { formatLineupServiceType } from "@/utils/lineup-service-type"
import type { Lineup } from "@/components/line-ups/LineupList"

export interface ScheduleCalendarEvent {
  id: string
  title: string
  date: Date
  lineup: Lineup
  /** Which of the lineup's two dates this particular event plots. */
  kind: "service" | "rehearsal"
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// Keyed by `kind` (not an arbitrary color prop) - every event plotted here
// comes from a lineup's own service/rehearsal date, so there are only ever
// these two kinds, each with a fixed color.
const EVENT_COLOR_CLASSES: Record<ScheduleCalendarEvent["kind"], string> = {
  service: "border-l-blue-500 text-blue-700 dark:text-blue-400",
  rehearsal: "border-l-violet-500 text-violet-700 dark:text-violet-400",
}

// Beyond this many, a day cell shows a "+N more" overflow label instead of
// growing the row height to fit every event.
const MAX_VISIBLE_EVENTS_PER_DAY = 3

// Caps for the event popover's roster/set-list previews - a compact popup,
// so both collapse into a "+N" overflow past a handful of rows/avatars
// rather than growing to fit a large lineup.
const MAX_VISIBLE_POPOVER_AVATARS = 8
const MAX_VISIBLE_POPOVER_SONGS = 5

const dayKey = (date: Date): string => format(date, "yyyy-MM-dd")

interface ScheduleEventButtonProps {
  event: ScheduleCalendarEvent
}

// A plotted event's pill, clickable to reveal the lineup's key details and a
// link through to its full page - the pill itself stays a compact one-liner
// (day cells are small), so anything beyond title/date/status lives in here
// instead.
const ScheduleEventButton: FunctionComponent<ScheduleEventButtonProps> = ({ event }) => {
  const { lineup } = event

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "block w-full truncate border-l-2 pl-1.5 text-left text-xs font-medium hover:opacity-80",
              EVENT_COLOR_CLASSES[event.kind]
            )}
          />
        }
      >
        {event.title}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {lineup.seriesName && (
              <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {lineup.seriesName}
              </p>
            )}
            <p className="truncate text-sm font-semibold">{lineup.topic ?? "Untitled"}</p>
          </div>
          <LineupStatusBadge status={lineup.status} />
        </div>

        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          <p>
            {format(new Date(lineup.serviceDate), "EEEE, MMMM d, yyyy")} &middot;{" "}
            {formatLineupServiceType(lineup.serviceType)}
          </p>
          {lineup.rehearsalDate && (
            <p>Rehearsal: {format(new Date(lineup.rehearsalDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}</p>
          )}
        </div>

        <Separator className="my-3" />

        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" />
          {lineup.team.name}
        </div>
        {lineup.members.length > 0 ? (
          <AvatarGroup className="mt-1.5">
            {lineup.members.slice(0, MAX_VISIBLE_POPOVER_AVATARS).map((member) => (
              <Avatar key={member.id} size="sm">
                <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
              </Avatar>
            ))}
            {lineup.members.length > MAX_VISIBLE_POPOVER_AVATARS && (
              <AvatarGroupCount>+{lineup.members.length - MAX_VISIBLE_POPOVER_AVATARS}</AvatarGroupCount>
            )}
          </AvatarGroup>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No roster yet.</p>
        )}

        <Separator className="my-3" />

        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListMusic className="size-3.5" />
          Songs
        </div>
        {lineup.songs.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {lineup.songs.slice(0, MAX_VISIBLE_POPOVER_SONGS).map((entry) => (
              <li key={entry.id} className="truncate text-xs">
                {entry.song.title}
              </li>
            ))}
            {lineup.songs.length > MAX_VISIBLE_POPOVER_SONGS && (
              <li className="text-xs text-muted-foreground">
                +{lineup.songs.length - MAX_VISIBLE_POPOVER_SONGS} more
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No songs yet.</p>
        )}

        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          nativeButton={false}
          render={<Link href={`/line-ups/${lineup.id}`} />}
        >
          View full details
          <SquareArrowOutUpRight />
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export const ScheduleCalendar: FunctionComponent = () => {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))

  const rangeStart = useMemo(() => startOfWeek(startOfMonth(currentMonth)), [currentMonth])
  const rangeEnd = useMemo(() => endOfWeek(endOfMonth(currentMonth)), [currentMonth])

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  )

  // "schedules" (not "lineups") deliberately matches the query key
  // LineupList.tsx's delete/CreateLineupForm's create-or-update mutations
  // already invalidate - they were wired up in anticipation of this page
  // reading live data instead of mock events.
  const lineupsQuery = useQuery({
    queryKey: ["schedules", dayKey(rangeStart), dayKey(rangeEnd)],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups", {
        params: { query: { from: dayKey(rangeStart), to: dayKey(rangeEnd) } },
      })
      if (error) throw new Error("Failed to load lineups.")
      return data
    },
  })

  // Each lineup plots up to two events: the Sunday service itself (on
  // `serviceDate`) and its practice/rehearsal the day before (on
  // `rehearsalDate`, only when one's been set).
  const events = useMemo<ScheduleCalendarEvent[]>(
    () =>
      (lineupsQuery.data ?? []).flatMap((lineup) => {
        const title = lineup.topic ?? "Sunday Service"
        const items: ScheduleCalendarEvent[] = [
          {
            id: `${lineup.id}-service`,
            title,
            date: new Date(lineup.serviceDate),
            lineup,
            kind: "service",
          },
        ]
        if (lineup.rehearsalDate) {
          items.push({
            id: `${lineup.id}-rehearsal`,
            title: `Rehearsal: ${title}`,
            date: new Date(lineup.rehearsalDate),
            lineup,
            kind: "rehearsal",
          })
        }
        return items
      }),
    [lineupsQuery.data]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleCalendarEvent[]>()
    for (const event of events) {
      const key = dayKey(event.date)
      const existing = map.get(key)
      if (existing) existing.push(event)
      else map.set(key, [event])
    }
    return map
  }, [events])

  // Week-row count varies (5 or 6) depending on the month, so the grid's
  // row template is computed rather than hardcoded - keeps every row an
  // equal share of the remaining height instead of a fixed per-cell size.
  const weekRowCount = days.length / 7

  return (
    <div className="flex h-full flex-col gap-3">
      <header>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setCurrentMonth((month) => subMonths(month, 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setCurrentMonth((month) => addMonths(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Plan services, rehearsals, and set lists, and see what is coming up next.
        </p>
      </header>
      <div
        className="grid flex-1 grid-cols-7 overflow-hidden rounded-lg border"
        style={{ gridTemplateRows: `auto repeat(${weekRowCount}, minmax(0, 1fr))` }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b bg-muted/40 px-3 py-2 text-center text-xs font-medium text-primary-foreground"
          >
            {label}
          </div>
        ))}

        {days.map((day, index) => {
          const dayEvents = eventsByDay.get(dayKey(day)) ?? []
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS_PER_DAY)
          const overflowCount = dayEvents.length - visibleEvents.length
          const inCurrentMonth = isSameMonth(day, currentMonth)
          const isLastColumn = (index + 1) % 7 === 0

          return (
            <div
              key={dayKey(day)}
              className={cn(
                "flex flex-col gap-1 border-b p-2",
                !isLastColumn && "border-r",
                !inCurrentMonth && "bg-muted/20"
              )}
            >
              <span
                className={cn(
                  "ml-auto flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  !inCurrentMonth && "text-muted-foreground",
                  isToday(day) && "bg-primary text-primary-foreground"
                )}
              >
                {format(day, "d")}
              </span>

              <div className="flex flex-col gap-0.5">
                {visibleEvents.map((event) => (
                  <ScheduleEventButton key={event.id} event={event} />
                ))}
                {overflowCount > 0 && (
                  <p className="pl-1.5 text-xs text-muted-foreground">+{overflowCount} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
