import { Page, PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { LinkedAccounts } from "@/components/LinkedAccounts"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function SettingsPage() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <PageHeader>
          <PageTitle>Settings</PageTitle>
          <PageDescription>Manage connected applications and their access permissions.</PageDescription>
        </PageHeader>

        <LinkedAccounts />
      </PageContent>
    </Page>
  )
}
