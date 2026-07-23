"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/Sonner"
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { apiClient } from "@/lib/api-client"
import type { paths } from "@/types/api"

export interface ActiveYoutubeImport {
  id: string
  title: string
}

type YoutubeImportStatus =
  paths["/api/youtube-imports/{id}"]["get"]["responses"][200]["content"]["application/json"]

interface YoutubeImportContextValue {
  activeImport: ActiveYoutubeImport | null
  status: YoutubeImportStatus | undefined
  startImport: (job: ActiveYoutubeImport, initialStatus: YoutubeImportStatus) => void
  dismiss: () => void
  isFormOpen: boolean
  setFormOpen: (open: boolean) => void
}

const YoutubeImportContext = createContext<YoutubeImportContextValue | null>(null)

export function useYoutubeImport(): YoutubeImportContextValue {
  const context = useContext(YoutubeImportContext)
  if (!context) {
    throw new Error("useYoutubeImport must be used within a YoutubeImportProvider")
  }
  return context
}

// Tracks a YouTube-to-mp3 import independently of whichever component
// started it, so the job (and its polling) survives SongUploadForm/the
// upload dialog closing or the user navigating to another page entirely -
// YoutubeImportIndicator (mounted once, app-wide, alongside MiniMusicPlayer)
// is what actually surfaces that persisted state.
export const YoutubeImportProvider: FunctionComponent<PropsWithChildren> = ({ children }) => {
  const [activeImport, setActiveImport] = useState<ActiveYoutubeImport | null>(null)
  // Seeds the very first render of statusQuery below (via `initialData`) with
  // the "pending" row the start-import request itself already returned, so
  // there's an immediate in-progress state to show instead of a loading gap
  // before the first poll resolves.
  const [initialStatus, setInitialStatus] = useState<YoutubeImportStatus | undefined>(undefined)
  const [isFormOpen, setFormOpen] = useState(false)
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ["youtube-import", activeImport?.id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/youtube-imports/{id}", {
        params: { path: { id: activeImport!.id } },
      })
      if (error) throw new Error("Failed to check the import's progress.")
      return data
    },
    enabled: !!activeImport,
    initialData: initialStatus,
    // Polls while the download/conversion is in flight, stops as soon as it
    // lands on a terminal state.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" || status === "downloading" ? 3000 : false
    },
    // Downloading and converting can take a while - keep polling even if the
    // user tabs away or navigates elsewhere, instead of only catching up
    // once this stays in view again.
    refetchIntervalInBackground: true,
  })

  // Fires the completion side-effects exactly once when the polled status
  // lands on "completed" - guarded by a ref (rather than doing this inline
  // during render) since statusQuery.data keeps returning the same
  // "completed" row on every subsequent re-render.
  const hasHandledCompletion = useRef(false)
  useEffect(() => {
    if (statusQuery.data?.status !== "completed" || hasHandledCompletion.current) return
    hasHandledCompletion.current = true
    toast.success("Song imported.", { position: "top-center" })
    queryClient.invalidateQueries({ queryKey: ["songs"] })
    // Nothing further to show once the toast has told the user - clears the
    // floating indicator rather than leaving a stale "completed" card up.
    setActiveImport(null)
  }, [statusQuery.data?.status, queryClient])

  const startImport = (job: ActiveYoutubeImport, initialJobStatus: YoutubeImportStatus) => {
    hasHandledCompletion.current = false
    setInitialStatus(initialJobStatus)
    setActiveImport(job)
  }

  const dismiss = () => {
    setActiveImport(null)
  }

  return (
    <YoutubeImportContext.Provider
      value={{ activeImport, status: statusQuery.data, startImport, dismiss, isFormOpen, setFormOpen }}
    >
      {children}
    </YoutubeImportContext.Provider>
  )
}
