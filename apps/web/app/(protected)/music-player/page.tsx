import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { Fragment } from "react"

export default function SongBank() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Music Player</PageTitle>
        <PageDescription>
          Browse and manage the songs available for worship services, including key, tempo, and play history.
        </PageDescription>
      </PageHeader>
    </Fragment>
  )
}
