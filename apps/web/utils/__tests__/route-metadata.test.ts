import { describe, expect, it } from "vitest"
import { routeMap } from "@/utils/route-metadata"
import { SIDEBAR_CONTENT_ITEMS } from "@/utils/sidebar-items"

describe("routeMap", () => {
  it("has an entry for every top-level sidebar item, keyed by its bare pathname", () => {
    const [group] = SIDEBAR_CONTENT_ITEMS()

    for (const item of group?.items ?? []) {
      const pathname = item.path!.split("?")[0]!
      expect(routeMap[pathname]).toEqual({ label: item.title, icon: item.icon })
    }
  })

  it("only contains as many entries as there are pathed sidebar items", () => {
    const [group] = SIDEBAR_CONTENT_ITEMS()
    const pathedItemCount = (group?.items ?? []).filter((item) => item.path).length

    expect(Object.keys(routeMap)).toHaveLength(pathedItemCount)
  })

  it("returns undefined for a path with no matching sidebar item", () => {
    expect(routeMap["/not-a-real-route"]).toBeUndefined()
  })

  it("is keyed by pathname alone, not the sidebar item's raw (query-string-bearing) path", () => {
    // PageBreadcrumb looks this up with `usePathname()`, which never
    // includes a query string - Line Ups' sidebar path does (it defaults a
    // date range), so a lookup by that raw path must miss.
    const [group] = SIDEBAR_CONTENT_ITEMS()
    const lineUps = group?.items.find((item) => item.id === "general-line-ups")

    expect(lineUps?.path).toContain("?")
    expect(routeMap["/line-ups"]).toEqual({ label: "Line Ups", icon: lineUps?.icon })
    expect(routeMap[lineUps!.path!]).toBeUndefined()
  })
})
