import {
  Page,
  PageAction,
  PageContent,
  PageDescription,
  PageFooter,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { ScrollArea } from "@workspace/ui/components/ScrollArea"
import { NowPlayingCard } from "@/components/NowPlayingCard"
import { MusicPlayerBar } from "@/components/MusicPlayerBar"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { SongList } from "@/components/SongList"
import { SongSearchCombobox } from "@/components/SongSearchCombobox"
import { UploadSongDialog } from "@/components/UploadSongDialog"

export default function SongBank() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <div className="flex h-full flex-col">
          <PageHeader>
            <PageTitle>Song Library</PageTitle>
            <PageDescription>
              Every track uploaded for worship services — key, tempo, and album art at a glance.
            </PageDescription>
            <PageAction className="flex items-center gap-2">
              <SongSearchCombobox />
              <UploadSongDialog />
            </PageAction>
          </PageHeader>
          <div className="flex min-h-0 flex-1 gap-6 pt-10">
            <NowPlayingCard />
            <ScrollArea className="min-h-0 flex-1">
              <SongList />
            </ScrollArea>
          </div>
        </div>
      </PageContent>
      <PageFooter className="mt-0!">
        <MusicPlayerBar />
      </PageFooter>
    </Page>
  )
}
