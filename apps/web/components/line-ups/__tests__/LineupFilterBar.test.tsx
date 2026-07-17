import userEvent from "@testing-library/user-event"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupFilterBar } from "@/components/line-ups/LineupFilterBar"
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

function mockNavigation(query = "") {
  const replace = vi.fn()
  vi.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePathname).mockReturnValue("/line-ups")
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(query) as never)
  return replace
}

// Matches CalendarDayButton's own `data-day` computation (day.date.toLocaleDateString()) -
// the most unambiguous way to target a specific day cell when two months
// (which can share day-of-month numbers, e.g. both have a "20") are open at once.
function dayCell(date: Date) {
  return document.querySelector(`[data-day="${date.toLocaleDateString()}"]`) as HTMLElement
}

// numberOfMonths={2} renders two grids side by side, so this waits for
// "at least one" rather than using getByRole's single-match assumption.
async function openDateRangePicker(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(await screen.findByRole("button", { name }))
  await waitFor(() => expect(screen.getAllByRole("grid").length).toBeGreaterThan(0))
}

describe("LineupFilterBar", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("renders the search input, a 'Date range' trigger, and a 'Status' trigger with no filters active", () => {
    mockNavigation()

    render(<LineupFilterBar />)

    expect(screen.getByPlaceholderText("Search by series...")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Date range" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Clear filters/ })).not.toBeInTheDocument()
  })

  it("shows the selected status's label, or a count once more than one is selected", () => {
    mockNavigation("status=pending")
    const { unmount } = render(<LineupFilterBar />)
    expect(screen.getByRole("button", { name: "Pending" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Clear filters/ })).toBeInTheDocument()
    unmount()

    mockNavigation("status=pending,approved")
    render(<LineupFilterBar />)
    expect(screen.getByRole("button", { name: "2 statuses" })).toBeInTheDocument()
  })

  it("toggles a status via its checkbox", async () => {
    const replace = mockNavigation()
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    await user.click(screen.getByRole("button", { name: "Status" }))
    await user.click(await screen.findByRole("checkbox", { name: "Pending" }))

    expect(replace).toHaveBeenCalledWith("/line-ups?status=pending", { scroll: false })
  })

  it("clears the `status` param when the only selected status is unchecked", async () => {
    const replace = mockNavigation("status=pending")
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    await user.click(screen.getByRole("button", { name: "Pending" }))
    await user.click(await screen.findByRole("checkbox", { name: "Pending" }))

    expect(replace).toHaveBeenCalledWith("/line-ups", { scroll: false })
  })

  it("shows an open-ended label and Clear filters when only `from` is set", () => {
    mockNavigation("from=2026-07-01")

    render(<LineupFilterBar />)

    expect(screen.getByRole("button", { name: "Jul 1, 2026 onward" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Clear filters/ })).toBeInTheDocument()
  })

  it("shows a bounded range label when both `from` and `to` are set", () => {
    mockNavigation("from=2026-07-01&to=2026-07-15")

    render(<LineupFilterBar />)

    expect(screen.getByRole("button", { name: "Jul 1 - Jul 15, 2026" })).toBeInTheDocument()
  })

  it("debounces typing into the search box into a single URL replace", async () => {
    vi.useFakeTimers()
    const replace = mockNavigation()

    render(<LineupFilterBar />)
    const input = screen.getByPlaceholderText("Search by series...")

    fireEvent.input(input, { target: { value: "g" } })
    fireEvent.input(input, { target: { value: "gr" } })
    fireEvent.input(input, { target: { value: "gra" } })
    fireEvent.input(input, { target: { value: "grace" } })

    expect(replace).not.toHaveBeenCalled()

    for (let elapsed = 0; elapsed < 1000; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50)
    }

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith("/line-ups?q=grace", { scroll: false })
  })

  it("picks a single date with nothing selected yet, writing it as an open-ended `from`", async () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00"))
    const replace = mockNavigation()
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    await openDateRangePicker(user, "Date range")
    await user.click(dayCell(new Date("2026-07-10T00:00:00")))

    expect(replace).toHaveBeenCalledWith("/line-ups?from=2026-07-10", { scroll: false })
  })

  it("picks a second, later date to complete the range", async () => {
    const replace = mockNavigation("from=2026-07-01")
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    await openDateRangePicker(user, "Jul 1, 2026 onward")
    await user.click(dayCell(new Date("2026-07-20T00:00:00")))

    expect(replace).toHaveBeenCalledWith("/line-ups?from=2026-07-01&to=2026-07-20", { scroll: false })
  })

  it("re-clicking the already-selected single day keeps it open-ended (no `to`)", async () => {
    const replace = mockNavigation("from=2026-07-10")
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    await openDateRangePicker(user, "Jul 10, 2026 onward")
    await user.click(dayCell(new Date("2026-07-10T00:00:00")))

    expect(replace).toHaveBeenCalledWith("/line-ups?from=2026-07-10", { scroll: false })
  })

  it("clears every filter and resets the search input", async () => {
    const replace = mockNavigation("q=rooted&from=2026-07-01&to=2026-07-15&status=pending")
    const user = userEvent.setup()

    render(<LineupFilterBar />)
    const input = screen.getByPlaceholderText("Search by series...") as HTMLInputElement
    expect(input.value).toBe("rooted")

    await user.click(screen.getByRole("button", { name: /Clear filters/ }))

    expect(replace).toHaveBeenCalledWith("/line-ups", { scroll: false })
    expect(input.value).toBe("")
  })
})
