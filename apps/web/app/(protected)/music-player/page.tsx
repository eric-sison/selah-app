import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { Fragment } from "react"
import { SongList } from "@/components/SongList"
import { SongUploadForm } from "@/components/SongUploadForm"

export default function SongBank() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Music Player</PageTitle>
        <PageDescription>
          Browse and manage the songs available for worship services, including key, tempo, and play history.
        </PageDescription>
      </PageHeader>
      <div className="flex flex-wrap items-start gap-6">
        <SongUploadForm />
        <div className="min-w-sm flex-1">
          <SongList />
        </div>
      </div>
    </Fragment>
  )
}
