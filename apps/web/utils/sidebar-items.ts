import {
  Calendar,
  Home,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Music,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react"

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

export const SIDEBAR_CONTENT_ITEMS = (_userId?: string): SidebarItem[] => [
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
        id: "general-music-player",
        title: "Music Player",
        path: "/music-player",
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
