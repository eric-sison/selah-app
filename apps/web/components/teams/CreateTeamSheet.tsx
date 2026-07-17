"use client"

import { Button } from "@workspace/ui/components/Button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/Sheet"
import { Plus } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { useSession } from "@/components/SessionProvider"
import { CreateTeamForm } from "@/components/teams/CreateTeamForm"

// Team creation is admin-only at the API level (see createTeamRoute in
// apps/api/src/routes/teams.ts) - self-gated here so both places this
// renders (the page header and TeamList's empty state) don't have to
// duplicate the role check.
export const CreateTeamSheet: FunctionComponent = () => {
  const session = useSession()
  const [open, setOpen] = useState(false)

  if (session?.user.role !== "admin") return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button>
            <Plus />
            <span>Create a team</span>
          </Button>
        }
      />
      <SheetContent side="right" className="flex flex-col gap-0 data-[side=right]:lg:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create a team</SheetTitle>
          <SheetDescription>
            Give the team a name to get started - you can assign a leader and musicians right away, or add
            them later.
          </SheetDescription>
        </SheetHeader>
        <CreateTeamForm onSuccess={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
