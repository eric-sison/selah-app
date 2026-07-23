import { PageContent } from "@workspace/ui/components/Page"
import { ScheduleCalendar } from "@/components/schedules/ScheduleCalendar"

export default function Schedules() {
  return (
    <PageContent>
      {/* <PageHeader>
        <PageTitle>Schedules</PageTitle>
        <PageDescription>
          Plan services, rehearsals, and set lists, and see what is coming up next.
        </PageDescription>
      </PageHeader> */}

      <ScheduleCalendar />
    </PageContent>
  )
}
