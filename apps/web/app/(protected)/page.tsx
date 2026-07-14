import { Page, PageContent } from "@workspace/ui/components/Page"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function DashboardPage() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <div>Dashboard</div>
      </PageContent>
    </Page>
  )
}
