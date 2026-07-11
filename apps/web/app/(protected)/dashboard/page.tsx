import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { Fragment } from "react"

export default function Dashboard() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Dashboard</PageTitle>
        <PageDescription>
          An overview of upcoming services, set lists, and musician availability.
        </PageDescription>
      </PageHeader>
    </Fragment>
  )
}
