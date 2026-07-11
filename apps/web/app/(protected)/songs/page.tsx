import { PageAction, PageDescription, PageHeader, PageTitle } from "@workspace/ui/components/Page"
import { MiniMusicPlayer } from "@/components/MiniMusicPlayer"
import { SongList } from "@/components/SongList"
import { SongPlayerProvider } from "@/components/SongPlayerProvider"
import { UploadSongDialog } from "@/components/UploadSongDialog"

export default function SongBank() {
  return (
    <SongPlayerProvider>
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
          <MiniMusicPlayer />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SongList />
          </div>
        </div>
      </div>
    </SongPlayerProvider>
  )
}
