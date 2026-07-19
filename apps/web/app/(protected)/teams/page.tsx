import { CreateTeamSheet } from "@/components/teams/CreateTeamSheet"
import { TeamList } from "@/components/teams/TeamList"
import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"

export default function Teams() {
  return (
    <PageContent>
      <div className="flex min-h-full flex-col">
        <PageHeader>
          <PageTitle>Teams</PageTitle>
          <PageDescription>Manage your worship team members and their instruments.</PageDescription>
          <PageAction>
            <CreateTeamSheet />
          </PageAction>
        </PageHeader>
        <TeamList />
      </div>
    </PageContent>
  )
}
