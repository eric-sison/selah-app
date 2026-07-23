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
import { describe, expect, it, vi } from "vitest"
import { ScheduleCalendar } from "@/components/schedules/ScheduleCalendar"
import { apiClient } from "@/lib/api-client"
import { renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn() },
}))

// Matches the day-number span's exact utility classes so it can be selected
// without depending on text content (adjacent-month days can repeat numbers).
const DAY_NUMBER_SELECTOR = "span.ml-auto.flex.size-6"

function daysInMonth(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month))
  const end = endOfWeek(endOfMonth(month))
  return eachDayOfInterval({ start, end })
}

function mockLineups(lineups: unknown[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/lineups") return Promise.resolve({ data: lineups, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

function mockLineupsError() {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/lineups") {
      return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
    }
    throw new Error(`Unexpected path: ${path}`)
  })
}

interface MockMember {
  id: string
  name: string
}

interface MockSong {
  id: string
  title: string
}

interface MockLineupOptions {
  id?: string
  topic?: string | null
  seriesName?: string | null
  serviceDate: Date
  rehearsalDate?: Date | null
  teamName?: string
  members?: MockMember[]
  songs?: MockSong[]
}

function createMockLineup({
  id = "lineup-1",
  topic = "Sermon",
  seriesName = null,
  serviceDate,
  rehearsalDate = null,
  teamName = "Sunday AM Team",
  members = [],
  songs = [],
}: MockLineupOptions) {
  return {
    id,
    status: "draft",
    serviceType: "sunday_service",
    topic,
    seriesName,
    team: { id: "team-1", name: teamName },
    members: members.map((member) => ({
      id: member.id,
      instruments: [],
      isAvailable: true,
      user: { id: `user-${member.id}`, name: member.name, image: null },
    })),
    songs: songs.map((song, index) => ({
      id: song.id,
      position: index,
      song: { id: `song-${song.id}`, title: song.title, artist: null, musicalKey: null, tempo: null },
      singer: null,
    })),
    serviceDate: serviceDate.toISOString(),
    rehearsalDate: rehearsalDate ? rehearsalDate.toISOString() : null,
  }
}

describe("ScheduleCalendar", () => {
  it("renders weekday headers and a day cell for every day in the grid, including muted adjacent-month days", () => {
    mockLineups([])
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
    mockLineups([])
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
    mockLineups([])
    const user = userEvent.setup()
    const { container } = render(<ScheduleCalendar />)

    await user.click(screen.getByRole("button", { name: "Next month" }))

    const dayCells = container.querySelectorAll(DAY_NUMBER_SELECTOR)
    dayCells.forEach((cell) => expect(cell).not.toHaveClass("bg-primary"))
  })

  it("navigates between months using the previous, next, and today controls", async () => {
    mockLineups([])
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

  it("fetches lineups for the visible grid range and plots each as a service-date event", async () => {
    const base = startOfMonth(new Date())
    mockLineups([
      createMockLineup({ id: "lineup-1", topic: "Stewarding the Campus", serviceDate: addDays(base, 2) }),
    ])
    render(<ScheduleCalendar />)

    expect(await screen.findByText("Stewarding the Campus")).toHaveClass("border-l-blue-500")

    expect(apiClient.GET).toHaveBeenCalledWith("/api/lineups", {
      params: {
        query: {
          from: format(startOfWeek(startOfMonth(base)), "yyyy-MM-dd"),
          to: format(endOfWeek(endOfMonth(base)), "yyyy-MM-dd"),
        },
      },
    })
  })

  it("also plots a rehearsal event on the lineup's rehearsal date, distinct from the service event", async () => {
    const base = startOfMonth(new Date())
    mockLineups([
      createMockLineup({
        id: "lineup-1",
        topic: "Stewarding the Campus",
        serviceDate: addDays(base, 2),
        rehearsalDate: addDays(base, 1),
      }),
    ])
    render(<ScheduleCalendar />)

    expect(await screen.findByText("Stewarding the Campus")).toHaveClass("border-l-blue-500")
    expect(await screen.findByText("Rehearsal: Stewarding the Campus")).toHaveClass("border-l-violet-500")
  })

  it("falls back to 'Sunday Service' as the event title when a lineup has no topic", async () => {
    const base = startOfMonth(new Date())
    mockLineups([createMockLineup({ topic: null, serviceDate: addDays(base, 2) })])
    render(<ScheduleCalendar />)

    expect(await screen.findByText("Sunday Service")).toBeInTheDocument()
  })

  it("shows a '+N more' overflow label when a day has more than the max visible events", async () => {
    const base = startOfMonth(new Date())
    const day = addDays(base, 11)
    mockLineups([
      createMockLineup({ id: "lineup-1", topic: "Event One", serviceDate: day }),
      createMockLineup({ id: "lineup-2", topic: "Event Two", serviceDate: day }),
      createMockLineup({ id: "lineup-3", topic: "Event Three", serviceDate: day }),
      createMockLineup({ id: "lineup-4", topic: "Event Four", serviceDate: day }),
      createMockLineup({ id: "lineup-5", topic: "Event Five", serviceDate: day }),
    ])
    render(<ScheduleCalendar />)

    await waitFor(() => expect(screen.getByText("Event One")).toBeInTheDocument())
    expect(screen.getByText("Event Two")).toBeInTheDocument()
    expect(screen.getByText("Event Three")).toBeInTheDocument()
    expect(screen.queryByText("Event Four")).not.toBeInTheDocument()
    expect(screen.queryByText("Event Five")).not.toBeInTheDocument()
    expect(screen.getByText("+2 more")).toBeInTheDocument()
  })

  it("opens a popover with the lineup's team roster and set list, and a link to its full page, when an event is clicked", async () => {
    const user = userEvent.setup()
    const base = startOfMonth(new Date())
    mockLineups([
      createMockLineup({
        id: "lineup-42",
        topic: "Stewarding the Campus",
        serviceDate: addDays(base, 2),
        rehearsalDate: addDays(base, 1),
        teamName: "Sunday AM Team",
        members: [
          { id: "member-1", name: "Ben Ortega" },
          { id: "member-2", name: "Casey Reyes" },
        ],
        songs: [
          { id: "song-a", title: "Lilim" },
          { id: "song-b", title: "Awit Ng Bayang" },
        ],
      }),
    ])
    render(<ScheduleCalendar />)

    await user.click(await screen.findByText("Stewarding the Campus"))

    expect(screen.getByText("Sunday AM Team")).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2)
    expect(screen.getByText("Lilim")).toBeInTheDocument()
    expect(screen.getByText("Awit Ng Bayang")).toBeInTheDocument()

    const link = screen.getByRole("button", { name: /View full details/ })
    expect(link).toHaveAttribute("href", "/line-ups/lineup-42")
  })

  it("shows 'No roster yet.' and 'No songs yet.' placeholders in the popover when a lineup has neither", async () => {
    const user = userEvent.setup()
    const base = startOfMonth(new Date())
    mockLineups([
      createMockLineup({ id: "lineup-1", topic: "Sermon", serviceDate: addDays(base, 2) }),
    ])
    render(<ScheduleCalendar />)

    await user.click(await screen.findByText("Sermon"))

    expect(screen.getByText("No roster yet.")).toBeInTheDocument()
    expect(screen.getByText("No songs yet.")).toBeInTheDocument()
  })

  it("collapses the popover's roster avatars into a '+N' count past the visible cap", async () => {
    const user = userEvent.setup()
    const base = startOfMonth(new Date())
    const members = Array.from({ length: 10 }, (_, i) => ({ id: `member-${i}`, name: `Member ${i}` }))
    mockLineups([createMockLineup({ id: "lineup-1", topic: "Sermon", serviceDate: addDays(base, 2), members })])
    render(<ScheduleCalendar />)

    await user.click(await screen.findByText("Sermon"))

    expect(document.querySelectorAll('[data-slot="avatar"]')).toHaveLength(8)
    expect(screen.getByText("+2")).toBeInTheDocument()
  })

  it("collapses the popover's song list into a '+N more' line past the visible cap", async () => {
    const user = userEvent.setup()
    const base = startOfMonth(new Date())
    const songs = Array.from({ length: 7 }, (_, i) => ({ id: `song-${i}`, title: `Song ${i}` }))
    mockLineups([createMockLineup({ id: "lineup-1", topic: "Sermon", serviceDate: addDays(base, 2), songs })])
    render(<ScheduleCalendar />)

    await user.click(await screen.findByText("Sermon"))

    expect(screen.getByText("Song 0")).toBeInTheDocument()
    expect(screen.getByText("Song 4")).toBeInTheDocument()
    expect(screen.queryByText("Song 5")).not.toBeInTheDocument()
    expect(screen.getByText("+2 more")).toBeInTheDocument()
  })

  it("shows the lineup's series name as an eyebrow above the topic in the popover", async () => {
    const user = userEvent.setup()
    const base = startOfMonth(new Date())
    mockLineups([
      createMockLineup({
        id: "lineup-1",
        topic: "Sermon",
        seriesName: "When We Gather",
        serviceDate: addDays(base, 2),
      }),
    ])
    render(<ScheduleCalendar />)

    await user.click(await screen.findByText("Sermon"))

    expect(screen.getByText("When We Gather")).toBeInTheDocument()
  })

  it("still renders the calendar grid without crashing when the lineups fetch fails", async () => {
    mockLineupsError()
    render(<ScheduleCalendar />)

    await waitFor(() => expect(apiClient.GET).toHaveBeenCalled())
    expect(screen.getByRole("heading")).toBeInTheDocument()
  })
})
