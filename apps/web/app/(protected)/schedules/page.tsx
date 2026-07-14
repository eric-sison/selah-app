import { Page, PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function Schedules() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <PageHeader>
          <PageTitle>Schedules</PageTitle>
          <PageDescription>
            Plan services, rehearsals, and set lists, and see what is coming up next.
          </PageDescription>
        </PageHeader>
      </PageContent>
    </Page>
  )
}
