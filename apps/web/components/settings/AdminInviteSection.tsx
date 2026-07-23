"use client"

import { FunctionComponent } from "react"
import { useSession } from "@/components/SessionProvider"
import { InviteForm } from "@/components/auth/InviteForm"

export const AdminInviteSection: FunctionComponent = () => {
  const session = useSession()

  if (session?.user.role !== "admin") return null

  return <InviteForm />
}
