import { Button } from "@workspace/ui/components/Button"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { UserRoundX } from "lucide-react"
import { FunctionComponent } from "react"

export const TeamList: FunctionComponent = () => {
  return (
    <Empty className="min-h-0">
      <EmptyIcon>
        <UserRoundX />
      </EmptyIcon>
      <EmptyTitle>No teams yet</EmptyTitle>
      <EmptyDescription>Create a team to start assigning musicians.</EmptyDescription>
      <EmptyAction>
        <Button>Create a team</Button>
      </EmptyAction>
    </Empty>
  )
}
