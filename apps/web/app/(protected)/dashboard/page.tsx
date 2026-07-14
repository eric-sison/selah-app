import { Page, PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function Dashboard() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <PageHeader>
          <PageTitle>Dashboard</PageTitle>
          <PageDescription>
            An overview of upcoming services, set lists, and musician availability.
          </PageDescription>
        </PageHeader>
      </PageContent>
    </Page>
  )
}
