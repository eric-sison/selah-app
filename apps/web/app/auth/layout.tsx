import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/session"
import { type PropsWithChildren } from "react"

export default async function AuthLayout({ children }: Readonly<PropsWithChildren>) {
  const session = await getServerSession()

  if (session) redirect("/")

  return <>{children}</>
}
