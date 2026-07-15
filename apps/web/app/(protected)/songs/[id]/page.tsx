import { PageContent, PageFooter } from "@workspace/ui/components/Page"
import { MusicPlayerBar } from "@/components/MusicPlayerBar"
import { SongDetailsView } from "@/components/SongDetailsView"

interface SongDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function SongDetailPage({ params }: SongDetailPageProps) {
  const { id } = await params
  return (
    <>
      <PageContent className="overflow-hidden">
        <SongDetailsView songId={id} />
      </PageContent>
      <PageFooter className="mt-0! border-t-0">
        <MusicPlayerBar />
      </PageFooter>
    </>
  )
}
