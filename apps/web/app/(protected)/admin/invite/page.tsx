import { PageContent } from "@workspace/ui/components/Page"
import { InviteForm } from "@/components/InviteForm"

export default function InvitePage() {
  return (
    <PageContent>
      <div className="flex h-full items-center justify-center">
        <InviteForm />
      </div>
    </PageContent>
  )
}
