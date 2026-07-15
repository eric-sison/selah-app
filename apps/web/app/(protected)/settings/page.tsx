import { PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { LinkedAccounts } from "@/components/LinkedAccounts"

export default function SettingsPage() {
  return (
    <PageContent>
      <PageHeader>
        <PageTitle>Settings</PageTitle>
        <PageDescription>Manage connected applications and their access permissions.</PageDescription>
      </PageHeader>

      <LinkedAccounts />
    </PageContent>
  )
}
