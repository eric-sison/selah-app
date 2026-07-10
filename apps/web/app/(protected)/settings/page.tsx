import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { LinkedAccounts } from "@/components/LinkedAccounts"
import { Fragment } from "react"

export default function SettingsPage() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Settings</PageTitle>
        <PageDescription>Manage connected applications and their access permissions.</PageDescription>
      </PageHeader>

      <LinkedAccounts />
    </Fragment>
  )
}
