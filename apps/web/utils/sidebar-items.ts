import { endOfMonth, format, startOfMonth } from "date-fns"
import { Calendar, LayoutGrid, LibraryBig, type LucideIcon, Mic2, Music, Settings, Users } from "lucide-react"

type AppPath = string

const URL_DATE_FORMAT = "yyyy-MM-dd"

export type Item = {
  id: string
  title: string
  path?: AppPath
  icon: LucideIcon
  description?: string | undefined
}

export type SidebarItem = {
  group?: string | undefined
  groupId: string
  items: Array<
    Item & {
      subItems: Array<Item>
    }
  >
}

export const SIDEBAR_CONTENT_ITEMS = (): SidebarItem[] => {
  const now = new Date()
  const from = format(startOfMonth(now), URL_DATE_FORMAT)
  const to = format(endOfMonth(now), URL_DATE_FORMAT)

  return [
    {
      group: "General",
      groupId: "general",
      items: [
        {
          id: "general-dashboard",
          title: "Dashboard",
          path: "/dashboard",
          icon: LayoutGrid,
          subItems: [],
        },
        {
          id: "general-songs",
          title: "Song Library",
          path: "/songs",
          icon: Music,
          subItems: [],
        },
        {
          id: "general-line-ups",
          title: "Line Ups",
          path: `/line-ups?from=${from}&to=${to}`,
          icon: LibraryBig,
          subItems: [],
        },
        {
          id: "general-teams",
          title: "Teams",
          path: "/teams",
          icon: Users,
          subItems: [],
        },
        {
          id: "general-musicians",
          title: "Musicians",
          path: "/musicians",
          icon: Mic2,
          subItems: [],
        },
        {
          id: "general-schedules",
          title: "Schedules",
          path: "/schedules",
          icon: Calendar,
          subItems: [],
        },
        {
          id: "general-settings",
          title: "Settings",
          path: "/settings",
          icon: Settings,
          subItems: [],
        },
      ],
    },
  ]
}

export const SIDEBAR_FOOTER_ITEMS: Item[] = []
