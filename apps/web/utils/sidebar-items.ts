import { Calendar, LayoutGrid, type LucideIcon, Music, Settings, Users } from "lucide-react"

type AppPath = string

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

export const SIDEBAR_CONTENT_ITEMS = (): SidebarItem[] => [
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
        id: "general-teams",
        title: "Teams",
        path: "/teams",
        icon: Users,
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

export const SIDEBAR_FOOTER_ITEMS: Item[] = []
