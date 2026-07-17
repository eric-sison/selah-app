import { describe, expect, it } from "vitest"
import { LineupList } from "@/components/LineupList"
import { render, screen } from "../../test/render"

describe("LineupList", () => {
  it("shows the empty state with a create action", () => {
    render(<LineupList />)

    expect(screen.getByText("No line ups yet")).toBeInTheDocument()
    expect(screen.getByText("Create a lineup to organize songs for services.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create a line up" })).toBeInTheDocument()
  })
})
