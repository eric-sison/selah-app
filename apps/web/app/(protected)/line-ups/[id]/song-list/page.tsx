import { PageContent, PageFooter } from "@workspace/ui/components/Page"
import { LineupSongListView } from "@/components/line-ups/LineupSongListView"
import { MusicPlayerBar } from "@/components/songs/MusicPlayerBar"

interface LineupSongListPageProps {
  params: Promise<{ id: string }>
}

export default async function LineupSongListPage({ params }: LineupSongListPageProps) {
  const { id } = await params
  return (
    <>
      <PageContent className="overflow-hidden">
        <LineupSongListView lineupId={id} />
      </PageContent>
      <PageFooter className="mt-0! border-t-0">
        <MusicPlayerBar />
      </PageFooter>
    </>
  )
}
