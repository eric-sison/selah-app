import { PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { SettingsNav } from "@/components/settings/SettingsNav"

export default function SettingsPage() {
  return (
    <PageContent>
      <PageHeader>
        <PageTitle>Settings</PageTitle>
        <PageDescription>Manage your profile, account security, and connected applications.</PageDescription>
      </PageHeader>

      <SettingsNav />
    </PageContent>
  )
}
