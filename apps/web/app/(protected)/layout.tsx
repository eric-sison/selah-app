import type { CSSProperties, PropsWithChildren } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/session"
import { SessionProvider } from "@/components/SessionProvider"
import { AppSidebar } from "@/components/AppSidebar"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/Sidebar"
import { Page, PageContent } from "@workspace/ui/components/Page"

export default async function ProtectedLayout({ children }: Readonly<PropsWithChildren>) {
  const session = await getServerSession()

  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/"
    redirect(`/session-expired?redirect=${encodeURIComponent(pathname)}`)
  }

  return (
    <SessionProvider value={session}>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <AppSidebar variant="sidebar" />
        <SidebarInset>
          <Page>
            <PageBreadcrumbNav />
            <PageContent>{children}</PageContent>
          </Page>
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  )
}
