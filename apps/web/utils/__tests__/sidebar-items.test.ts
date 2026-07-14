import { describe, expect, it } from "vitest"
import { SIDEBAR_CONTENT_ITEMS, SIDEBAR_FOOTER_ITEMS } from "@/utils/sidebar-items"

describe("SIDEBAR_CONTENT_ITEMS", () => {
  it("returns a fresh array of groups each call", () => {
    const first = SIDEBAR_CONTENT_ITEMS()
    const second = SIDEBAR_CONTENT_ITEMS()

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })

  it("includes a General group with an item per top-level route, each without sub-items", () => {
    const [group] = SIDEBAR_CONTENT_ITEMS()

    expect(group?.group).toBe("General")
    expect(group?.groupId).toBe("general")
    expect(group?.items.map((item) => item.path)).toEqual([
      "/dashboard",
      "/songs",
      "/services",
      "/teams",
      "/schedules",
      "/settings",
    ])
    expect(group?.items.every((item) => item.subItems.length === 0)).toBe(true)
  })

  it("gives every item a stable, unique id and an icon", () => {
    const [group] = SIDEBAR_CONTENT_ITEMS()
    const ids = group?.items.map((item) => item.id) ?? []

    expect(new Set(ids).size).toBe(ids.length)
    expect(group?.items.every((item) => item.icon != null)).toBe(true)
  })
})

describe("SIDEBAR_FOOTER_ITEMS", () => {
  it("is currently empty", () => {
    expect(SIDEBAR_FOOTER_ITEMS).toEqual([])
  })
})
