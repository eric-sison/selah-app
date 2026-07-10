import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/session"
import { SessionProvider } from "@/components/SessionProvider"
import { AppSidebar } from "@/components/AppSidebar"
import { routeMap } from "@/utils/route-metadata"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/Sidebar"
import { Page, PageBreadcrumb, PageContent } from "@workspace/ui/components/Page"
import { type CSSProperties, type PropsWithChildren } from "react"

export default async function ProtectedLayout({ children }: Readonly<PropsWithChildren>) {
  const session = await getServerSession()
  const pathname = (await headers()).get("x-pathname") ?? "/"
  // x-pathname carries the query string too (needed so the sign-in redirect
  // round-trips it) - PageBreadcrumb only wants the path segments.
  const pathnameOnly = pathname.split("?").at(0) ?? pathname

  if (!session) {
    redirect(`/session-expired?redirect=${encodeURIComponent(pathname)}`)
  }

  return (
    <SessionProvider value={session}>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <AppSidebar variant="sidebar" />
        <SidebarInset>
          <Page>
            <PageBreadcrumb pathname={pathnameOnly} routes={routeMap} />
            <PageContent>{children}</PageContent>
          </Page>
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  )
}
