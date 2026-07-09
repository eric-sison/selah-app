import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/session"
import { SessionProvider } from "@/components/SessionProvider"

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/"
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(pathname)}`)
  }

  return <SessionProvider value={session}>{children}</SessionProvider>
}
