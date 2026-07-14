import type { CSSProperties, PropsWithChildren } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/session"
import { SessionProvider } from "@/components/SessionProvider"
import { AppSidebar } from "@/components/AppSidebar"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/Sidebar"

export default async function ProtectedLayout({ children }: Readonly<PropsWithChildren>) {
  const session = await getServerSession()

  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/"
    redirect(`/session-expired?redirect=${encodeURIComponent(pathname)}`)
  }

  return (
    <SessionProvider value={session}>
      <SidebarProvider
        style={{ "--sidebar-width": "15rem" } as CSSProperties}
        className="bg-linear-to-b from-primary/8 to-transparent"
      >
        {/* Both the sidebar's own inner panel and SidebarInset paint an
          opaque background by default, which would otherwise fully hide
          the gradient above - clear them so it shows through everywhere. */}
        <AppSidebar variant="sidebar" className="**:data-[slot=sidebar-inner]:bg-transparent" />
        <SidebarInset className="bg-transparent">{children}</SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  )
}
