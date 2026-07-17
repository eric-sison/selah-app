import userEvent from "@testing-library/user-event"
import { Music } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@workspace/ui/components/Sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { render, screen } from "../../test/render"

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))

// The real sidebar-items.ts currently has no items with subItems - synthesize
// data here so the CollapsibleMenuItem (expanded) and dropdown-with-subItems
// (collapsed) branches get exercised. "Child 3" deliberately omits `path` to
// cover the falsy-path branches in both the collapsible sub-link render and
// the dropdown item's onClick.
vi.mock("@/utils/sidebar-items", () => ({
  SIDEBAR_CONTENT_ITEMS: () => [
    {
      group: "Test",
      groupId: "g1",
      items: [
        {
          id: "i1",
          title: "Parent",
          icon: Music,
          subItems: [
            { id: "s1", title: "Child 1", path: "/child-1", icon: Music },
            { id: "s2", title: "Child 2", path: "/child-2", icon: Music },
            { id: "s3", title: "Child 3", icon: Music },
          ],
        },
        { id: "i2", title: "Plain", path: "/plain", icon: Music, subItems: [] },
        {
          id: "i3",
          title: "With Query",
          path: "/with-query?from=2026-07-01&to=2026-07-31",
          icon: Music,
          subItems: [],
        },
      ],
    },
  ],
  SIDEBAR_FOOTER_ITEMS: [{ id: "f1", title: "Footer Item", path: "/footer", icon: Music }],
}))

function renderSidebar({
  pathname = "/plain",
  defaultOpen = true,
}: { pathname?: string; defaultOpen?: boolean } = {}) {
  const push = vi.fn()
  vi.mocked(usePathname).mockReturnValue(pathname)
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>)

  render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
    </SidebarProvider>
  )

  return { push }
}

describe("AppSidebar", () => {
  it("renders a plain content item as a link and marks it active on an exact pathname match", () => {
    renderSidebar({ pathname: "/plain" })

    const link = screen.getByRole("link", { name: "Plain" })
    expect(link).toHaveAttribute("href", "/plain")
    expect(link).toHaveAttribute("data-active", "")
  })

  it("marks a content item active when pathname is a nested route under its path", () => {
    renderSidebar({ pathname: "/plain/sub-route" })

    const link = screen.getByRole("link", { name: "Plain" })
    expect(link).toHaveAttribute("data-active", "")
  })

  it("does not mark a content item active for an unrelated pathname", () => {
    renderSidebar({ pathname: "/somewhere-else" })

    const link = screen.getByRole("link", { name: "Plain" })
    expect(link).not.toHaveAttribute("data-active")
  })

  it("marks a content item active when pathname matches the route ignoring the item's query string", () => {
    renderSidebar({ pathname: "/with-query" })

    const link = screen.getByRole("link", { name: "With Query" })
    expect(link).toHaveAttribute("href", "/with-query?from=2026-07-01&to=2026-07-31")
    expect(link).toHaveAttribute("data-active", "")
  })

  it("calls router.push('/') when the Selah header button is clicked", async () => {
    const user = userEvent.setup()
    const { push } = renderSidebar({ pathname: "/plain" })

    await user.click(screen.getByRole("button", { name: /selah/i }))

    expect(push).toHaveBeenCalledWith("/")
  })

  it("renders footer items as links and reflects isActive the same way", () => {
    renderSidebar({ pathname: "/footer" })

    const link = screen.getByRole("link", { name: "Footer Item" })
    expect(link).toHaveAttribute("href", "/footer")
    expect(link).toHaveAttribute("data-active", "")
  })

  it("does not mark a footer item active for a non-matching pathname", () => {
    renderSidebar({ pathname: "/plain" })

    const link = screen.getByRole("link", { name: "Footer Item" })
    expect(link).not.toHaveAttribute("data-active")
  })

  describe("when the sidebar is open", () => {
    it("renders an item with subItems as a CollapsibleMenuItem, defaulting open when pathname matches a sub-item", () => {
      renderSidebar({ pathname: "/child-1", defaultOpen: true })

      // Defaults open because "/child-1" matches subItem s1's path.
      const childLink = screen.getByRole("link", { name: "Child 1" })
      expect(childLink).toHaveAttribute("href", "/child-1")
      expect(childLink).toHaveAttribute("data-active", "")
      expect(screen.getByRole("link", { name: "Child 2" })).toBeInTheDocument()
      // Child 3 has no path, so it's never rendered as a link.
      expect(screen.queryByRole("link", { name: "Child 3" })).not.toBeInTheDocument()
    })

    it("defaults collapsed and expands sub-items on trigger click when pathname doesn't match any sub-item", async () => {
      const user = userEvent.setup()
      renderSidebar({ pathname: "/plain", defaultOpen: true })

      expect(screen.queryByRole("link", { name: "Child 1" })).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Parent" }))

      expect(screen.getByRole("link", { name: "Child 1" })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Child 2" })).toBeInTheDocument()
    })
  })

  describe("when the sidebar is collapsed", () => {
    it("renders an item with subItems as a dropdown menu instead of a CollapsibleMenuItem", () => {
      renderSidebar({ pathname: "/plain", defaultOpen: false })

      expect(screen.getByRole("button", { name: "Parent" })).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: "Child 1" })).not.toBeInTheDocument()
    })

    it("opens the dropdown and shows sub-items as menu items with separators between all but the last", async () => {
      const user = userEvent.setup()
      renderSidebar({ pathname: "/plain", defaultOpen: false })

      await user.click(screen.getByRole("button", { name: "Parent" }))

      const items = screen.getAllByRole("menuitem")
      expect(items.map((item) => item.textContent)).toEqual(["Child 1", "Child 2", "Child 3"])

      const separators = document.querySelectorAll('[data-slot="dropdown-menu-separator"]')
      expect(separators).toHaveLength(2)
    })

    it("clicking a sub-item with a path calls router.push with that path", async () => {
      const user = userEvent.setup()
      const { push } = renderSidebar({ pathname: "/plain", defaultOpen: false })

      await user.click(screen.getByRole("button", { name: "Parent" }))
      await user.click(screen.getByRole("menuitem", { name: "Child 1" }))

      expect(push).toHaveBeenCalledWith("/child-1")
    })

    it("clicking a sub-item without a path does not call router.push", async () => {
      const user = userEvent.setup()
      const { push } = renderSidebar({ pathname: "/plain", defaultOpen: false })

      await user.click(screen.getByRole("button", { name: "Parent" }))
      await user.click(screen.getByRole("menuitem", { name: "Child 3" }))

      expect(push).not.toHaveBeenCalled()
    })
  })
})
