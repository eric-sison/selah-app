"use client"

import { FunctionComponent } from "react"
import { useSession } from "@/components/SessionProvider"
import { InviteForm } from "@/components/auth/InviteForm"
import { PendingInvitationsList } from "@/components/settings/PendingInvitationsList"

export const AdminInviteSection: FunctionComponent = () => {
  const session = useSession()

  if (session?.user.role !== "admin") return null

  return (
    <div className="flex flex-col gap-6">
      <InviteForm />
      <PendingInvitationsList />
    </div>
  )
}
