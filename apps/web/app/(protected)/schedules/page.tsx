import { Page, PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { addDays, startOfMonth } from "date-fns"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { ScheduleCalendar, type ScheduleCalendarEvent } from "@/components/ScheduleCalendar"

// Placeholder data until schedules/events have a real API-backed model -
// scattered across the current month so the grid is visually verifiable
// regardless of which day this renders on.
const monthStart = startOfMonth(new Date())
const mockEvents: ScheduleCalendarEvent[] = [
  { id: "1", title: "Sunday Service", date: addDays(monthStart, 2), color: "blue" },
  { id: "2", title: "Worship Rehearsal", date: addDays(monthStart, 4), color: "violet" },
  { id: "3", title: "Setlist Review", date: addDays(monthStart, 4), color: "amber" },
  { id: "4", title: "Sunday Service", date: addDays(monthStart, 9), color: "blue" },
  { id: "5", title: "Team Meeting", date: addDays(monthStart, 15), color: "green" },
  { id: "6", title: "Sunday Service", date: addDays(monthStart, 16), color: "blue" },
]

export default function Schedules() {
  return (
    <Page noGap>
      <PageBreadcrumbNav />
      <PageContent className="py-5">
        {/* <PageHeader>
          <PageTitle>Schedules</PageTitle>
          <PageDescription>
            Plan services, rehearsals, and set lists, and see what is coming up next.
          </PageDescription>
        </PageHeader> */}

        <ScheduleCalendar events={mockEvents} />
      </PageContent>
    </Page>
  )
}
