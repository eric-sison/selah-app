"use client"

import { usePathname } from "next/navigation"
import type { FunctionComponent } from "react"
import { routeMap } from "@/utils/route-metadata"
import { PageBreadcrumb } from "@workspace/ui/components/Page"

// The layout that renders this is a Server Component - it only runs once
// per full page load, so a pathname read there via headers() goes stale on
// every client-side navigation to a sibling page within the same layout
// (Next reuses the layout's already-rendered output and only swaps the leaf
// segment). usePathname() is a client hook that tracks the router's live
// state instead, so this has to be a client component.
export const PageBreadcrumbNav: FunctionComponent = () => {
  const pathname = usePathname()
  return <PageBreadcrumb pathname={pathname} routes={routeMap} />
}
