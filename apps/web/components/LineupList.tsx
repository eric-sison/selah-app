"use client"

import { Button } from "@workspace/ui/components/Button"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { FileMusic } from "lucide-react"
import { FunctionComponent } from "react"

export const LineupList: FunctionComponent = () => {
  return (
    <Empty className="min-h-0">
      <EmptyIcon>
        <FileMusic />
      </EmptyIcon>
      <EmptyTitle>No line ups yet</EmptyTitle>
      <EmptyDescription>Create a lineup to organize songs for services.</EmptyDescription>
      <EmptyAction>
        <Button>Create a line up</Button>
      </EmptyAction>
    </Empty>
  )
}
