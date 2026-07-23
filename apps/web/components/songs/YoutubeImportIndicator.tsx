"use client"

import { Button } from "@workspace/ui/components/Button"
import { Spinner } from "@workspace/ui/components/Spinner"
import { CircleAlert, X } from "lucide-react"
import { FunctionComponent } from "react"
import { useYoutubeImport } from "@/components/songs/YoutubeImportProvider"

// A floating "background import" widget, mirroring MiniMusicPlayer's fixed
// corner placement - opposite corner (bottom-left vs its bottom-right) so
// the two never overlap when both a song is playing and an import is
// running. Only shown once the upload dialog that started the import has
// closed (isFormOpen false) - while it's open, that dialog's own progress
// view already shows the same thing, so showing both would be redundant.
export const YoutubeImportIndicator: FunctionComponent = () => {
  const { activeImport, status, dismiss, isFormOpen } = useYoutubeImport()

  if (!activeImport || isFormOpen) return null

  const failed = status?.status === "failed"

  return (
    <div className="fixed bottom-4 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-start gap-3 p-3">
        {failed ? (
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
        ) : (
          <Spinner className="mt-0.5 size-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{activeImport.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {failed ? status.errorMessage : "Downloading and converting…"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1 shrink-0 rounded-full"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
