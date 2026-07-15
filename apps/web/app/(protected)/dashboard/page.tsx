import { PageContent, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"

export default function Dashboard() {
  return (
    <PageContent>
      <PageHeader>
        <PageTitle>Dashboard</PageTitle>
        <PageDescription>
          An overview of upcoming services, set lists, and musician availability.
        </PageDescription>
      </PageHeader>
    </PageContent>
  )
}
