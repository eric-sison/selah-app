import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { Fragment } from "react"

export default function Musicians() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Teams</PageTitle>
        <PageDescription>
          Manage your worship team roster, their roles, and their availability for upcoming services.
        </PageDescription>
      </PageHeader>
    </Fragment>
  )
}
