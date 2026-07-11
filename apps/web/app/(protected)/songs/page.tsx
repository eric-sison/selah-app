import { PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { Fragment } from "react"
import { SongList } from "@/components/SongList"
import { SongUploadForm } from "@/components/SongUploadForm"

export default function SongBank() {
  return (
    <Fragment>
      <PageHeader>
        <PageTitle>Songs</PageTitle>
        <PageDescription>
          Every track uploaded for worship services — key, tempo, and album art at a glance.
        </PageDescription>
      </PageHeader>
    </Fragment>
  )
}
