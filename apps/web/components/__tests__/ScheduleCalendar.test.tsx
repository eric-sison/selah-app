import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ScheduleCalendar, type ScheduleCalendarEvent } from "@/components/schedules/ScheduleCalendar"
import { render, screen } from "../../test/render"

// Matches the day-number span's exact utility classes so it can be selected
// without depending on text content (adjacent-month days can repeat numbers).
const DAY_NUMBER_SELECTOR = "span.ml-auto.flex.size-6"

function daysInMonth(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month))
  const end = endOfWeek(endOfMonth(month))
  return eachDayOfInterval({ start, end })
}

describe("ScheduleCalendar", () => {
  it("renders weekday headers and a day cell for every day in the grid, including muted adjacent-month days", () => {
    const { container } = render(<ScheduleCalendar />)

    for (const label of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    const now = new Date()
    const expectedDays = daysInMonth(now)
    const dayCells = container.querySelectorAll(DAY_NUMBER_SELECTOR)
    expect(dayCells).toHaveLength(expectedDays.length)

    expectedDays.forEach((day, index) => {
      expect(dayCells[index]).toHaveTextContent(format(day, "d"))
    })

    const outOfMonthIndex = expectedDays.findIndex((day) => !isSameMonth(day, now))
    // Virtually every month needs at least one leading or trailing day from
    // an adjacent month to fill out the week rows.
    expect(outOfMonthIndex).toBeGreaterThanOrEqual(0)
    const outOfMonthSpan = dayCells[outOfMonthIndex]
    expect(outOfMonthSpan).toHaveClass("text-muted-foreground")
    expect(outOfMonthSpan?.parentElement).toHaveClass("bg-muted/20")
  })

  it("highlights today's date with the filled circle style", () => {
    const { container } = render(<ScheduleCalendar />)

    const now = new Date()
    const expectedDays = daysInMonth(now)
    const dayCells = container.querySelectorAll(DAY_NUMBER_SELECTOR)
    const todayIndex = expectedDays.findIndex((day) => isToday(day))

    expect(todayIndex).toBeGreaterThanOrEqual(0)
    expect(dayCells[todayIndex]).toHaveClass("bg-primary")
    expect(dayCells[todayIndex]).toHaveClass("text-primary-foreground")
  })

  it("does not highlight any date once navigated away from the current month", async () => {
    const user = userEvent.setup()
    const { container } = render(<ScheduleCalendar />)

    await user.click(screen.getByRole("button", { name: "Next month" }))

    const dayCells = container.querySelectorAll(DAY_NUMBER_SELECTOR)
    dayCells.forEach((cell) => expect(cell).not.toHaveClass("bg-primary"))
  })

  it("navigates between months using the previous, next, and today controls", async () => {
    const user = userEvent.setup()
    render(<ScheduleCalendar />)

    const initialHeading = screen.getByRole("heading").textContent

    await user.click(screen.getByRole("button", { name: "Next month" }))
    expect(screen.getByRole("heading").textContent).not.toBe(initialHeading)

    await user.click(screen.getByRole("button", { name: "Previous month" }))
    expect(screen.getByRole("heading").textContent).toBe(initialHeading)

    await user.click(screen.getByRole("button", { name: "Next month" }))
    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByRole("heading").textContent).toBe(initialHeading)
  })

  it("maps event colors to the correct border classes, including the default when color is omitted", () => {
    const base = startOfMonth(new Date())
    const events: ScheduleCalendarEvent[] = [
      { id: "1", title: "Red Event", date: addDays(base, 2), color: "red" },
      { id: "2", title: "Green Event", date: addDays(base, 4), color: "green" },
      { id: "3", title: "Default Event", date: addDays(base, 6) },
    ]

    render(<ScheduleCalendar events={events} />)

    expect(screen.getByText("Red Event")).toHaveClass("border-l-red-500")
    expect(screen.getByText("Green Event")).toHaveClass("border-l-emerald-500")
    expect(screen.getByText("Default Event")).toHaveClass("border-l-blue-500")
  })

  it("shows a '+N more' overflow label when a day has more than the max visible events", () => {
    const day = addDays(startOfMonth(new Date()), 11)
    const events: ScheduleCalendarEvent[] = [
      { id: "1", title: "Event One", date: day },
      { id: "2", title: "Event Two", date: day },
      { id: "3", title: "Event Three", date: day },
      { id: "4", title: "Event Four", date: day },
      { id: "5", title: "Event Five", date: day },
    ]

    render(<ScheduleCalendar events={events} />)

    expect(screen.getByText("Event One")).toBeInTheDocument()
    expect(screen.getByText("Event Two")).toBeInTheDocument()
    expect(screen.getByText("Event Three")).toBeInTheDocument()
    expect(screen.queryByText("Event Four")).not.toBeInTheDocument()
    expect(screen.queryByText("Event Five")).not.toBeInTheDocument()
    expect(screen.getByText("+2 more")).toBeInTheDocument()
  })
})
