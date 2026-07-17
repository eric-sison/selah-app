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
import { CreateMusicianForm } from "@/components/musicians/CreateMusicianForm"

// Musician creation is admin-only at the API level (see createMusicianRoute
// in apps/api/src/routes/musicians.ts) - self-gated here so both places this
// renders (the page header and MusicianList's empty state) don't have to
// duplicate the role check.
export const CreateMusicianSheet: FunctionComponent = () => {
  const session = useSession()
  const [open, setOpen] = useState(false)

  if (session?.user.role !== "admin") return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button>
            <Plus />
            <span>Add musician</span>
          </Button>
        }
      />
      <SheetContent side="right" className="flex flex-col gap-0 data-[side=right]:lg:max-w-xl">
        <SheetHeader>
          <SheetTitle>Add a musician</SheetTitle>
          <SheetDescription>
            Pick a user and their instruments - once created, they&apos;ll show up in any team&apos;s member
            picker.
          </SheetDescription>
        </SheetHeader>
        <CreateMusicianForm onSuccess={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
