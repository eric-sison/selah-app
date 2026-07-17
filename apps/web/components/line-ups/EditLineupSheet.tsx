"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/Sheet"
import { FunctionComponent } from "react"
import { CreateLineupForm } from "@/components/line-ups/CreateLineupForm"
import type { Lineup } from "@/components/line-ups/LineupList"

interface EditLineupSheetProps {
  lineup: Lineup
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Externally controlled (no trigger of its own) - opened from a lineup
// card's row menu (see LineupList.tsx), one lineup at a time, rather than
// mounting its own open/closed state per card.
export const EditLineupSheet: FunctionComponent<EditLineupSheetProps> = ({ lineup, open, onOpenChange }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex flex-col gap-0 data-[side=right]:sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>Update line up</SheetTitle>
        <SheetDescription>
          Update the schedule, team assignment, series/topic, and word - the set list and roster aren&apos;t
          editable here yet.
        </SheetDescription>
      </SheetHeader>
      <CreateLineupForm lineup={lineup} onSuccess={() => onOpenChange(false)} />
    </SheetContent>
  </Sheet>
)
