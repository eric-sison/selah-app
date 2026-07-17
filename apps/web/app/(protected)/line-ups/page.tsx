import { CreateLineupSheet } from "@/components/line-ups/CreateLineupSheet"
import { LineupList } from "@/components/line-ups/LineupList"
import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"

export default function LineUps() {
  return (
    <PageContent>
      <div className="flex h-full flex-col">
        <PageHeader>
          <PageTitle>Line Ups</PageTitle>
          <PageDescription>Build and manage the set list for each upcoming service.</PageDescription>
          <PageAction>
            <CreateLineupSheet />
          </PageAction>
        </PageHeader>
        <LineupList />
      </div>
    </PageContent>
  )
}
