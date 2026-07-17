import { CreateMusicianSheet } from "@/components/musicians/CreateMusicianSheet"
import { MusicianList } from "@/components/musicians/MusicianList"
import {
  PageAction,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from "@workspace/ui/components/Page"

export default function Musicians() {
  return (
    <PageContent className="pb-5">
      <div className="flex h-full flex-col">
        <PageHeader>
          <PageTitle>Musicians</PageTitle>
          <PageDescription>
            Manage musician profiles and their instruments - set once here and carried over wherever
            they&apos;re referenced.
          </PageDescription>
          <PageAction>
            <CreateMusicianSheet />
          </PageAction>
        </PageHeader>
        <MusicianList />
      </div>
    </PageContent>
  )
}
