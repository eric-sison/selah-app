import { Page, PageContent, PageFooter } from "@workspace/ui/components/Page"
import { MusicPlayerBar } from "@/components/MusicPlayerBar"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { SongDetailView } from "@/components/SongDetailView"

interface SongDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function SongDetailPage({ params }: SongDetailPageProps) {
  const { id } = await params
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <SongDetailView songId={id} />
      </PageContent>
      <PageFooter className="mt-0! border-t-0">
        <MusicPlayerBar />
      </PageFooter>
    </Page>
  )
}
