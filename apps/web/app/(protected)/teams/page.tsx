import { Page, PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function Musicians() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <PageHeader>
          <PageTitle>Teams</PageTitle>
          <PageDescription>
            Manage your worship team roster, their roles, and their availability for upcoming services.
          </PageDescription>
        </PageHeader>
      </PageContent>
    </Page>
  )
}
