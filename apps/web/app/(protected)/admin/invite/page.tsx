import { Page, PageContent } from "@workspace/ui/components/Page"
import { InviteForm } from "@/components/InviteForm"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"

export default function InvitePage() {
  return (
    <Page>
      <PageBreadcrumbNav />
      <PageContent>
        <div className="flex h-full items-center justify-center">
          <InviteForm />
        </div>
      </PageContent>
    </Page>
  )
}
