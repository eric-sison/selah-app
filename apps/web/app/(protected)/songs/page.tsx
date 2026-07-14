import {
  Page,
  PageAction,
  PageContent,
  PageDescription,
  PageFooter,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { NowPlayingCard } from "@/components/NowPlayingCard"
import { MusicPlayerBar } from "@/components/MusicPlayerBar"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { SongList } from "@/components/SongList"
import { UploadSongDialog } from "@/components/UploadSongDialog"

export default function SongBank() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <div className="flex h-full flex-col">
          <PageHeader>
            <PageTitle>Songs</PageTitle>
            <PageDescription>
              Every track uploaded for worship services — key, tempo, and album art at a glance.
            </PageDescription>
            <PageAction>
              <UploadSongDialog />
            </PageAction>
          </PageHeader>
          <div className="flex min-h-0 flex-1 gap-6 pt-10">
            <NowPlayingCard />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SongList />
            </div>
          </div>
        </div>
      </PageContent>
      <PageFooter className="mt-0!">
        <MusicPlayerBar />
      </PageFooter>
    </Page>
  )
}
