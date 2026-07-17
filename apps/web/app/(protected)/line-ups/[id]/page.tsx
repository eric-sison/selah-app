import { PageContent } from "@workspace/ui/components/Page"
import { LineupDetailsView } from "@/components/line-ups/LineupDetailsView"

interface LineupDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LineupDetailPage({ params }: LineupDetailPageProps) {
  const { id } = await params
  return (
    <PageContent className="overflow-hidden">
      <LineupDetailsView lineupId={id} />
    </PageContent>
  )
}
