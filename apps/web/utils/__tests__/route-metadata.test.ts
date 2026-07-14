import { describe, expect, it } from "vitest"
import { routeMap } from "@/utils/route-metadata"
import { SIDEBAR_CONTENT_ITEMS } from "@/utils/sidebar-items"

describe("routeMap", () => {
  it("has an entry for every top-level sidebar item with a label and icon", () => {
    const [group] = SIDEBAR_CONTENT_ITEMS()

    for (const item of group?.items ?? []) {
      expect(routeMap[item.path!]).toEqual({ label: item.title, icon: item.icon })
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
})
