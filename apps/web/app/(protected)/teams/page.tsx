import { Button } from "@workspace/ui/components/Button"
import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { Plus } from "lucide-react"
import { TeamList } from "@/components/TeamList"

export default function Musicians() {
  return (
    <PageContent>
      <div className="flex h-full flex-col">
        <PageHeader>
          <PageTitle>Teams</PageTitle>
          <PageDescription>
            Manage your worship team members, their roles, and their availability for upcoming services.
          </PageDescription>
          <PageAction>
            <Button>
              <Plus />
              Create a team
            </Button>
          </PageAction>
        </PageHeader>
        <TeamList />
      </div>
    </PageContent>
  )
}
