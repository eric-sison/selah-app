import { describe, expect, it } from "vitest"
import { LineupStatusBadge } from "@/components/line-ups/LineupStatusBadge"
import { render, screen } from "../../../test/render"

describe("LineupStatusBadge", () => {
  it("renders the draft label", () => {
    render(<LineupStatusBadge status="draft" />)
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("renders the pending label", () => {
    render(<LineupStatusBadge status="pending" />)
    expect(screen.getByText("Pending")).toBeInTheDocument()
  })

  it("renders the approved label", () => {
    render(<LineupStatusBadge status="approved" />)
    expect(screen.getByText("Approved")).toBeInTheDocument()
  })
})
