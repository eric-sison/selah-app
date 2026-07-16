import { LineupList } from "@/components/LineupList"
import { Button } from "@workspace/ui/components/Button"
import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { Plus } from "lucide-react"

export default function LineUps() {
  return (
    <PageContent>
      <div className="flex h-full flex-col">
        <PageHeader>
          <PageTitle>Line Ups</PageTitle>
          <PageDescription>Build and manage the set list for each upcoming service.</PageDescription>
          <PageAction>
            <Button>
              <Plus />
              Add a line up
            </Button>
          </PageAction>
        </PageHeader>
        <LineupList />
      </div>
    </PageContent>
  )
}
