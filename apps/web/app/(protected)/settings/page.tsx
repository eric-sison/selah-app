import { PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { LinkedAccounts } from "@/components/LinkedAccounts"
import { ProfileForm } from "@/components/settings/ProfileForm"
import { EmailForm } from "@/components/settings/EmailForm"
import { PasswordForm } from "@/components/settings/PasswordForm"
import { AdminInviteSection } from "@/components/settings/AdminInviteSection"

export default function SettingsPage() {
  return (
    <PageContent>
      <PageHeader>
        <PageTitle>Settings</PageTitle>
        <PageDescription>Manage your profile, account security, and connected applications.</PageDescription>
      </PageHeader>

      <div className="flex flex-wrap gap-5">
        <ProfileForm />
        <EmailForm />
        <PasswordForm />
        <LinkedAccounts />
        <AdminInviteSection />
      </div>
    </PageContent>
  )
}
