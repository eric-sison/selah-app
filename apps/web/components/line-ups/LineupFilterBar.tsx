"use client"

import { Button } from "@workspace/ui/components/Button"
import { ButtonGroup } from "@workspace/ui/components/ButtonGroup"
import { Calendar } from "@workspace/ui/components/Calendar"
import { Checkbox } from "@workspace/ui/components/Checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/InputGroup"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { cn } from "@workspace/ui/lib/utils"
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import {
  CalendarArrowDown,
  CalendarArrowUp,
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Search,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FunctionComponent, useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { LINEUP_STATUS_LABELS, type LineupStatus } from "@/utils/lineup-status"

const SEARCH_DEBOUNCE_MS = 250

const STATUS_OPTIONS = Object.keys(LINEUP_STATUS_LABELS) as LineupStatus[]

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}

// Lineups are filtered by service date on/after `from` and on/before `to` -
// this is the wire format both directions (the URL and the API's `from`/`to`
// query params), so a shared link stays valid across a refresh either way.
const URL_DATE_FORMAT = "yyyy-MM-dd"

// `new Date("2026-07-01")` parses as UTC midnight, which can display as the
// previous day once formatted in a negative-UTC-offset timezone - appending
// a local-time suffix keeps the parsed Date anchored to the intended
// calendar day in whatever timezone the browser is in.
function parseUrlDate(value: string | null): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const LineupFilterBar: FunctionComponent = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const q = searchParams.get("q") ?? ""
  const from = parseUrlDate(searchParams.get("from"))
  const to = parseUrlDate(searchParams.get("to"))
  const statuses = searchParams.get("status")?.split(",").filter(Boolean) ?? []
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc"

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  // The URL is the single source of truth for every filter - this is the one
  // place that writes to it for the search box, so rapid typing collapses
  // into a single navigation once the debounce settles instead of one per
  // keystroke. The date range below writes immediately instead, since
  // picking a day is already a deliberate, single action.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (debouncedSearch) params.set("q", debouncedSearch)
    else params.delete("q")

    const next = params.toString()
    if (next === searchParams.toString()) return

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [debouncedSearch, pathname, router, searchParams])

  const setDateRange = (range: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams.toString())
    // A single click on a day with no range in progress yet comes back as
    // `{ from: day, to: day }`, not `{ from: day, to: undefined }` - treat
    // that as picking a start date (open-ended), not a one-day range, so
    // the first click always means "from this date on" rather than "only
    // this exact date".
    const isSingleDayClick = range?.from && range?.to && range.from.getTime() === range.to.getTime()
    // react-day-picker's range mode only ever calls onSelect with `undefined`
    // when a same-day complete range (`{from: X, to: X}`) is clicked again -
    // this component never persists that shape back into the URL (a
    // same-day pair always collapses to `to: undefined` above), so the
    // Calendar never receives it back as `selected` and this else branch is
    // unreachable through the actual UI.
    /* v8 ignore else */
    if (range?.from) {
      params.set("from", format(range.from, URL_DATE_FORMAT))
    } else {
      params.delete("from")
    }
    if (range?.to && !isSingleDayClick) params.set("to", format(range.to, URL_DATE_FORMAT))
    else params.delete("to")
    // `from` is always set above, so `next` is never empty here - unlike the
    // debounced search effect below, there's no "clear back to no params" case.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const setMonthRange = (date: Date) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", format(startOfMonth(date), URL_DATE_FORMAT))
    params.set("to", format(endOfMonth(date), URL_DATE_FORMAT))
    // Both `from` and `to` are always set above, so the query string is never empty.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const goToPreviousMonth = () => setMonthRange(subMonths(from ?? new Date(), 1))
  const goToNextMonth = () => setMonthRange(addMonths(from ?? new Date(), 1))

  const toggleSort = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort", sort === "asc" ? "desc" : "asc")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const setStatuses = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.length > 0) params.set("status", next.join(","))
    else params.delete("status")
    const nextQs = params.toString()
    router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false })
  }

  const hasActiveFilters = q.length > 0 || from !== undefined || to !== undefined || statuses.length > 0

  const clearFilters = () => {
    setSearchInput("")
    const now = new Date()
    const params = new URLSearchParams()
    params.set("from", format(startOfMonth(now), URL_DATE_FORMAT))
    params.set("to", format(endOfMonth(now), URL_DATE_FORMAT))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const dateRangeLabel = from
    ? to
      ? `${format(from, "MMM d")} - ${format(to, "MMM d, yyyy")}`
      : `${format(from, "MMM d, yyyy")} onward`
    : "Date range"

  const statusLabel =
    statuses.length === 0
      ? "Status"
      : statuses.length === 1
        ? LINEUP_STATUS_LABELS[statuses[0] as LineupStatus]
        : `${statuses.length} statuses`

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      <InputGroup className="w-64">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by series or topic..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </InputGroup>

      <ButtonGroup>
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={goToPreviousMonth}>
          <ChevronLeft />
        </Button>
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" className={cn((from || to) && "border-primary")} />}
          >
            <CalendarIcon />
            {dateRangeLabel}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={setDateRange}
              defaultMonth={from}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={goToNextMonth}>
          <ChevronRight />
        </Button>
      </ButtonGroup>

      <Button variant="outline" onClick={toggleSort}>
        {sort === "asc" ? <CalendarArrowUp /> : <CalendarArrowDown />}
        {sort === "asc" ? "Asc" : "Desc"}
      </Button>

      <Popover>
        <PopoverTrigger
          render={<Button variant="outline" className={cn(statuses.length > 0 && "border-primary")} />}
        >
          {statusLabel}
          <ChevronDown />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 gap-0 p-1">
          {STATUS_OPTIONS.map((status) => (
            <label
              key={status}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={statuses.includes(status)}
                onCheckedChange={() => setStatuses(toggleId(statuses, status))}
              />
              {LINEUP_STATUS_LABELS[status]}
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {hasActiveFilters && (
        <Button variant="outline" onClick={clearFilters}>
          <RefreshCcw />
          Reset filters
        </Button>
      )}
    </div>
  )
}
