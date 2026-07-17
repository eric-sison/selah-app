"use client"

import { Button } from "@workspace/ui/components/Button"
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
import { ChevronLeft, ChevronRight } from "lucide-react"
import { FunctionComponent, useMemo, useState } from "react"

export interface ScheduleCalendarEvent {
  id: string
  title: string
  date: Date
  color?: "red" | "green" | "blue" | "amber" | "violet"
}

interface ScheduleCalendarProps {
  events?: ScheduleCalendarEvent[]
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const EVENT_COLOR_CLASSES: Record<NonNullable<ScheduleCalendarEvent["color"]>, string> = {
  red: "border-l-red-500 text-red-700 dark:text-red-400",
  green: "border-l-emerald-500 text-emerald-700 dark:text-emerald-400",
  blue: "border-l-blue-500 text-blue-700 dark:text-blue-400",
  amber: "border-l-amber-500 text-amber-700 dark:text-amber-400",
  violet: "border-l-violet-500 text-violet-700 dark:text-violet-400",
}

// Beyond this many, a day cell shows a "+N more" overflow label instead of
// growing the row height to fit every event.
const MAX_VISIBLE_EVENTS_PER_DAY = 3

const dayKey = (date: Date): string => format(date, "yyyy-MM-dd")

export const ScheduleCalendar: FunctionComponent<ScheduleCalendarProps> = ({ events = [] }) => {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth))
    const end = endOfWeek(endOfMonth(currentMonth))
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

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
                  <p
                    key={event.id}
                    className={cn(
                      "truncate border-l-2 pl-1.5 text-xs font-medium",
                      EVENT_COLOR_CLASSES[event.color ?? "blue"]
                    )}
                  >
                    {event.title}
                  </p>
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
