import userEvent from "@testing-library/user-event"
import { Sheet } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CreateLineupForm } from "@/components/line-ups/CreateLineupForm"
import { apiClient } from "@/lib/api-client"
import type { Team } from "@/components/teams/TeamList"
import type { User } from "@/components/teams/TeamMembershipFields"
import { createMockTeam, createMockTeamMember } from "../../../test/fixtures"
import { fireEvent, renderWithProviders, screen, waitFor } from "../../../test/render"

type SetupUserEvent = ReturnType<typeof userEvent.setup>

// CreateLineupForm renders <SheetClose> (from its SheetFooter), which reads
// base-ui's dialog root context - it's only ever mounted inside a <Sheet>
// in the app (see CreateLineupSheet.tsx), so tests need the same wrapper.
function renderForm(props: Parameters<typeof CreateLineupForm>[0] = {}) {
  return renderWithProviders(
    <Sheet open>
      <CreateLineupForm {...props} />
    </Sheet>
  )
}

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

// Isolates CreateLineupForm's own logic (validation, team-driven roster
// pre-fill, submit payload, mutation outcome) from LineupSongsField's/
// LineupRosterFields' own combobox behavior, which each have their own
// dedicated test file.
vi.mock("@/components/line-ups/LineupSongsField", () => ({
  LineupSongsField: ({
    songs,
    onSongsChange,
  }: {
    songs: { id: string; title: string; artist: string | null }[]
    onSongsChange: (songs: { id: string; title: string; artist: string | null }[]) => void
  }) => (
    <div>
      <span data-testid="songs">{songs.map((song) => song.id).join(",")}</span>
      <button
        type="button"
        onClick={() =>
          onSongsChange([...songs, { id: "song-1", title: "Amazing Grace", artist: "Traditional" }])
        }
      >
        mock-add-song
      </button>
    </div>
  ),
}))

vi.mock("@/components/line-ups/LineupRosterFields", () => ({
  LineupRosterFields: ({
    members,
    onMembersChange,
  }: {
    members: { user: { id: string; name: string; image: string | null } }[]
    onMembersChange: (members: { user: { id: string; name: string; image: string | null } }[]) => void
  }) => (
    <div>
      <span data-testid="members">{members.map((member) => member.user.name).join(",")}</span>
      <button
        type="button"
        onClick={() =>
          onMembersChange([...members, { user: { id: "user-9", name: "Cody Diaz", image: null } }])
        }
      >
        mock-add-member
      </button>
    </div>
  ),
}))

const DEVO_USER: User = { id: "user-5", name: "Dana Cruz", email: "dana@example.com", image: null }

const TEAM: Team = createMockTeam({ members: [createMockTeamMember()] })

function mockQueries({ teams = [TEAM], users = [DEVO_USER] }: { teams?: Team[]; users?: User[] } = {}) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/teams") return Promise.resolve({ data: teams, error: undefined }) as never
    if (path === "/api/users") return Promise.resolve({ data: users, error: undefined }) as never
    throw new Error(`Unexpected path: ${path}`)
  })
}

// Matches CalendarDayButton's own `data-day` computation
// (day.date.toLocaleDateString()) - same targeting approach as
// LineupFilterBar.test.tsx.
function dayCell(date: Date) {
  return document.querySelector(`[data-day="${date.toLocaleDateString()}"]`) as HTMLElement
}

// Drives one DateTimePicker end to end: open by its labeled trigger, click a
// day, optionally set the time, then close so the next interaction doesn't
// collide with the still-open popover.
async function pickDateTime(user: SetupUserEvent, triggerName: string, date: Date, time?: string) {
  await user.click(screen.getByRole("button", { name: triggerName }))
  await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
  await user.click(dayCell(date))
  if (time) fireEvent.change(screen.getByLabelText("Time"), { target: { value: time } })
  await user.keyboard("{Escape}")
}

async function fillRequiredFields(user: SetupUserEvent) {
  await user.click(screen.getByRole("button", { name: "Service type" }))
  await user.click(await screen.findByRole("menuitemradio", { name: "Sunday Service" }))
  await pickDateTime(user, "Service date", new Date("2026-08-02T00:00:00"))
}

async function selectTeam(user: SetupUserEvent, team: Team) {
  const input = screen.getByPlaceholderText("Search teams...")
  await user.click(input)
  await user.click(await screen.findByText(team.name))
}

describe("CreateLineupForm", () => {
  // The empty pickers' calendars open on the current month - pinning "today"
  // lets every test target August 2026 day cells deterministically.
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-15T09:00:00"))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("shows inline validation errors for the required fields and blocks submission", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Create line up" }))

    expect(await screen.findByText("Service type is required.")).toBeInTheDocument()
    expect(screen.getByText("Service date is required.")).toBeInTheDocument()
    expect(screen.getByText("Team is required.")).toBeInTheDocument()
    // Series name, topic, and word reference are optional - no errors for them.
    expect(screen.queryAllByText(/is required/)).toHaveLength(3)
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("shows an inline validation error when submitting without selecting a team", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await fillRequiredFields(user)
    await user.click(screen.getByRole("button", { name: "Create line up" }))

    expect(await screen.findByText("Team is required.")).toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("submits the full payload and resets the form on success", async () => {
    mockQueries()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm({ onSuccess })

    await fillRequiredFields(user)
    await pickDateTime(user, "Rehearsal date & time", new Date("2026-08-30T00:00:00"), "18:00")
    await user.type(screen.getByLabelText("Series name"), "Renewed")
    await user.type(screen.getByLabelText("Topic"), "Walking in Grace")
    await user.type(screen.getByLabelText("Word reference"), "John 3:16")
    await user.type(screen.getByLabelText("Direction"), "Keep it upbeat")

    const devoLeaderInput = screen.getByPlaceholderText("Optional - search users...")
    await user.click(devoLeaderInput)
    await user.click(await screen.findByText("Dana Cruz"))

    await selectTeam(user, TEAM)

    await user.click(screen.getByRole("tab", { name: "Songs" }))
    await user.click(screen.getByRole("button", { name: "mock-add-song" }))

    await user.click(screen.getByRole("tab", { name: "Singers & Musicians" }))
    // Team selection pre-fills the roster with the team's own member - the
    // mock renders it as a comma-joined name list so both the pre-fill and
    // this manual addition can be asserted from the same test.
    expect(screen.getByTestId("members")).toHaveTextContent("Ben Ortega")
    await user.click(screen.getByRole("button", { name: "mock-add-member" }))

    await user.click(screen.getByRole("button", { name: "Create line up" }))

    const expectedServiceDate = new Date("2026-08-02T00:00").toISOString()
    const expectedRehearsalDate = new Date("2026-08-30T18:00").toISOString()

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups", {
        body: {
          serviceType: "sunday_service",
          serviceDate: expectedServiceDate,
          rehearsalDate: expectedRehearsalDate,
          teamId: TEAM.id,
          seriesName: "Renewed",
          topic: "Walking in Grace",
          wordReference: "John 3:16",
          direction: "Keep it upbeat",
          devoLeaderId: DEVO_USER.id,
          songs: [{ songId: "song-1", singerId: undefined }],
          members: ["user-2", "user-9"],
        },
      })
    })

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Line up created.", { position: "top-center" })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("tab", { name: "Information" }))
    expect(screen.getByText("Select a service type")).toBeInTheDocument()
    expect(screen.getByText("Pick a date")).toBeInTheDocument()
    expect(screen.getByText("Optional")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Search teams...")).toHaveValue("")
    expect(screen.getByPlaceholderText("Optional - search users...")).toHaveValue("")
    expect(screen.getByLabelText("Series name")).toHaveValue("")
  })

  it("clears a picked date by re-clicking the same day", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    const day = new Date("2026-08-20T00:00:00")
    await user.click(screen.getByRole("button", { name: "Rehearsal date & time" }))
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
    await user.click(dayCell(day))
    expect(screen.getByText("Aug 20, 2026 at 12:00 AM")).toBeInTheDocument()

    await user.click(dayCell(day))

    expect(screen.getByText("Optional")).toBeInTheDocument()
    expect(screen.queryByText("Aug 20, 2026 at 12:00 AM")).not.toBeInTheDocument()
  })

  it("anchors a time picked before any date to today", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Rehearsal date & time" }))
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } })

    expect(screen.getByText("Aug 15, 2026 at 9:30 AM")).toBeInTheDocument()
  })

  it("keeps the picked time when changing the day, and falls back to midnight when the time is cleared", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Rehearsal date & time" }))
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
    await user.click(dayCell(new Date("2026-08-02T00:00:00")))
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "10:00" } })

    await user.click(dayCell(new Date("2026-08-05T00:00:00")))
    expect(screen.getByText("Aug 5, 2026 at 10:00 AM")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "" } })
    expect(screen.getByText("Aug 5, 2026 at 12:00 AM")).toBeInTheDocument()
  })

  it("closes the service type menu as soon as an option is selected", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Service type" }))
    await user.click(await screen.findByRole("menuitemradio", { name: "Youth Service" }))

    await waitFor(() => {
      expect(screen.queryByRole("menuitemradio", { name: "Youth Service" })).not.toBeInTheDocument()
    })
    expect(screen.getByText("Youth Service")).toBeInTheDocument()
  })

  it("shows a date-only label for the service date and offers no time input", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("button", { name: "Service date" }))
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
    await user.click(dayCell(new Date("2026-08-02T00:00:00")))

    expect(screen.getByText("Aug 2, 2026")).toBeInTheDocument()
    expect(screen.queryByLabelText("Time")).not.toBeInTheDocument()
  })

  it("sends every optional field as undefined when left blank", async () => {
    mockQueries()
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    const user = userEvent.setup()
    renderForm()

    await fillRequiredFields(user)
    await selectTeam(user, TEAM)
    await user.click(screen.getByRole("button", { name: "Create line up" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith(
        "/api/lineups",
        expect.objectContaining({
          body: expect.objectContaining({
            rehearsalDate: undefined,
            seriesName: undefined,
            topic: undefined,
            wordReference: undefined,
            direction: undefined,
            devoLeaderId: undefined,
          }),
        })
      )
    })
  })

  it("does not duplicate an already-added roster member when selecting a team, and clearing the team leaves the roster untouched", async () => {
    const teamWithDuplicate: Team = createMockTeam({
      id: "team-2",
      name: "Youth Team",
      members: [
        createMockTeamMember({ user: { id: "user-9", name: "Cody Diaz", image: null } }),
        createMockTeamMember({ id: "member-2", user: { id: "user-2", name: "Ben Ortega", image: null } }),
      ],
    })
    mockQueries({ teams: [teamWithDuplicate] })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole("tab", { name: "Singers & Musicians" }))
    await user.click(screen.getByRole("button", { name: "mock-add-member" }))
    expect(screen.getByTestId("members")).toHaveTextContent("Cody Diaz")

    await user.click(screen.getByRole("tab", { name: "Information" }))
    await selectTeam(user, teamWithDuplicate)

    await user.click(screen.getByRole("tab", { name: "Singers & Musicians" }))
    expect(screen.getByTestId("members")).toHaveTextContent("Cody Diaz,Ben Ortega")
  })

  it("clears the selected team without touching the roster", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    await selectTeam(user, TEAM)
    const teamInput = screen.getByPlaceholderText("Search teams...")
    expect(teamInput).toHaveValue(TEAM.name)

    const clearButton = document.querySelector('[data-slot="combobox-clear"]') as HTMLButtonElement
    await user.click(clearButton)

    expect(teamInput).toHaveValue("")
    // Clearing the team only unsets the assignment - the roster it pre-filled
    // stays, so members aren't silently dropped.
    await user.click(screen.getByRole("tab", { name: "Singers & Musicians" }))
    expect(screen.getByTestId("members")).toHaveTextContent("Ben Ortega")
  })

  it("clears a selected devo leader", async () => {
    mockQueries()
    const user = userEvent.setup()
    renderForm()

    const devoLeaderInput = screen.getByPlaceholderText("Optional - search users...")
    await user.click(devoLeaderInput)
    await user.click(await screen.findByText("Dana Cruz"))
    expect(devoLeaderInput).toHaveValue("Dana Cruz")

    const clearButton = document.querySelector('[data-slot="combobox-clear"]') as HTMLButtonElement
    await user.click(clearButton)

    expect(devoLeaderInput).toHaveValue("")
  })

  it("shows no candidates when the teams and users queries error", async () => {
    vi.mocked(apiClient.GET).mockImplementation((path: string) => {
      if (path === "/api/teams" || path === "/api/users") {
        return Promise.resolve({ data: undefined, error: { status: 500, message: "Server error" } }) as never
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByPlaceholderText("Search teams..."))
    expect(await screen.findByText("No teams found.")).toBeInTheDocument()

    await user.click(screen.getByPlaceholderText("Optional - search users..."))
    expect(await screen.findByText("No users found.")).toBeInTheDocument()
  })

  it("shows a toast error when the API returns an error, without resetting the selected team", async () => {
    mockQueries()
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: undefined,
      error: { message: "bad" },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await fillRequiredFields(user)
    await selectTeam(user, TEAM)
    await user.click(screen.getByRole("button", { name: "Create line up" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to create line up.", {
        position: "top-center",
      })
    })
    expect(screen.getByPlaceholderText("Search teams...")).toHaveValue(TEAM.name)
  })

  it("disables the cancel and submit buttons while the mutation is pending", async () => {
    mockQueries()
    let resolvePost!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePost = resolve
    })
    vi.mocked(apiClient.POST).mockReturnValue(pending as never)
    const user = userEvent.setup()
    renderForm()

    await fillRequiredFields(user)
    await selectTeam(user, TEAM)
    await user.click(screen.getByRole("button", { name: "Create line up" }))

    expect(await screen.findByRole("button", { name: "Creating..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePost({ data: {}, error: undefined })

    expect(await screen.findByRole("button", { name: "Create line up" })).not.toBeDisabled()
  })
})
