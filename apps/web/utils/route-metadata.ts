import type { LucideIcon } from "lucide-react"
import { SIDEBAR_CONTENT_ITEMS } from "./sidebar-items"

export type RouteMetadata = {
  label: string
  icon: LucideIcon
}

const allItems = SIDEBAR_CONTENT_ITEMS()
  .flatMap((group) => group.items)
  .flatMap((item) => [item, ...item.subItems])

// Keyed by pathname alone (no query string) - breadcrumbs look this up by
// `usePathname()`, which never includes one, but a sidebar item's `path` can
// (e.g. Line Ups' default date range) since it also doubles as the nav
// link's href.
export const routeMap: Record<string, RouteMetadata> = Object.fromEntries(
  allItems
    .filter((item) => item.path)
    .map((item) => [item.path!.split("?")[0], { label: item.title, icon: item.icon }])
)
