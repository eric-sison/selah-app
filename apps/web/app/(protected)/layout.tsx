import type { CSSProperties, PropsWithChildren } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Page } from "@workspace/ui/components/Page"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/Sidebar"
import { getServerSession } from "@/lib/session"
import { SessionProvider } from "@/components/SessionProvider"
import { AppSidebar } from "@/components/AppSidebar"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { SongPlayerProvider } from "@/components/SongPlayerProvider"

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
        // `min-h-svh` (the shared primitive's default) is only a height floor,
        // so tall page content grows the whole shell - sidebar included - past
        // the viewport and the browser scrolls the document instead of the
        // per-page `overflow-y-auto` regions every page here is built around.
        // `h-dvh overflow-hidden` caps it so those inner regions do the work.
        className="h-dvh overflow-hidden bg-linear-to-b from-primary/8 to-transparent"
      >
        {/* Both the sidebar's own inner panel and SidebarInset paint an
          opaque background by default, which would otherwise fully hide
          the gradient above - clear them so it shows through everywhere. */}
        <AppSidebar variant="sidebar" className="**:data-[slot=sidebar-inner]:bg-transparent" />
        <SongPlayerProvider>
          <SidebarInset className="bg-transparent">
            <Page>
              <PageBreadcrumbNav />
              {children}
            </Page>
          </SidebarInset>
        </SongPlayerProvider>
      </SidebarProvider>
    </SessionProvider>
  )
}
