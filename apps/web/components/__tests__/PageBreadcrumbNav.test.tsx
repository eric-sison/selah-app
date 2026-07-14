import { usePathname } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import { PageBreadcrumbNav } from "@/components/PageBreadcrumbNav"
import { render, screen } from "../../test/render"

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}))

describe("PageBreadcrumbNav", () => {
  it("renders breadcrumb items derived from the current pathname", () => {
    vi.mocked(usePathname).mockReturnValue("/songs")

    render(<PageBreadcrumbNav />)

    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/")
  })

  it("renders a nested path's segments", () => {
    vi.mocked(usePathname).mockReturnValue("/songs/song-1")

    render(<PageBreadcrumbNav />)

    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument()
  })
})
