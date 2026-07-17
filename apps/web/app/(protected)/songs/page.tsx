import {
  PageAction,
  PageContent,
  PageDescription,
  PageFooter,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { MusicPlayerBar } from "@/components/songs/MusicPlayerBar"
import { SongList } from "@/components/songs/SongList"
import { UploadSongDialog } from "@/components/songs/UploadSongDialog"

export default function SongBank() {
  return (
    <>
      <PageContent>
        <div className="flex h-full flex-col">
          <PageHeader>
            <PageTitle>Song Library</PageTitle>
            <PageDescription>
              Every track uploaded for worship services — key, tempo, and album art at a glance.
            </PageDescription>
            <PageAction className="flex items-center gap-2">
              <UploadSongDialog />
            </PageAction>
          </PageHeader>
          <SongList />
        </div>
      </PageContent>
      <PageFooter className="mt-0!">
        <MusicPlayerBar />
      </PageFooter>
    </>
  )
}
