import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"
import { CreateTeamSheet } from "@/components/CreateTeamSheet"
import { TeamList } from "@/components/TeamList"

export default function Musicians() {
  return (
    <PageContent>
      <div className="flex h-full flex-col">
        <PageHeader>
          <PageTitle>Teams</PageTitle>
          <PageDescription>Manage your worship team members and their roles.</PageDescription>
          <PageAction>
            <CreateTeamSheet />
          </PageAction>
        </PageHeader>
        <TeamList />
      </div>
    </PageContent>
  )
}
