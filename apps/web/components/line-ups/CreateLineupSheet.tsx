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
import { CreateLineupForm } from "@/components/line-ups/CreateLineupForm"

// Lineup creation is admin-only at the API level (see createLineupRoute in
// apps/api/src/routes/lineups.ts) - self-gated here so both places this
// renders (the page header and LineupList's empty state) don't have to
// duplicate the role check.
export const CreateLineupSheet: FunctionComponent = () => {
  const session = useSession()
  const [open, setOpen] = useState(false)

  if (session?.user.role !== "admin") return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button>
            <Plus />
            <span>Add a line up</span>
          </Button>
        }
      />
      <SheetContent side="right" className="flex flex-col gap-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create a line up</SheetTitle>
          <SheetDescription>
            Set the service and rehearsal schedule, assign a team, and build the set list and roster - you can
            also add songs and roles later.
          </SheetDescription>
        </SheetHeader>
        <CreateLineupForm onSuccess={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
