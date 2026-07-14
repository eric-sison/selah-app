import type { ColumnDef } from "@tanstack/react-table"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { DataTable } from "@/components/DataTable"
import { render, screen, within } from "../../test/render"

interface TestRow {
  id: string
  name: string
  role: string
}

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "role",
    header: "Role",
    enableSorting: false,
  },
]

const rows: TestRow[] = [
  { id: "1", name: "Alice", role: "Admin" },
  { id: "2", name: "Bob", role: "Member" },
]

describe("DataTable", () => {
  it("renders headers and cell values for each row", () => {
    render(<DataTable columns={columns} data={rows} />)

    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument()
    expect(screen.getByText("Role")).toBeInTheDocument()

    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Admin")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getByText("Member")).toBeInTheDocument()
  })

  it("renders a non-sortable column header without a dropdown trigger", () => {
    render(<DataTable columns={columns} data={rows} />)

    const roleHeader = screen.getByRole("columnheader", { name: "Role" })
    expect(within(roleHeader).queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders 'No results.' spanning all columns when data is empty", () => {
    render(<DataTable columns={columns} data={[]} />)

    const cell = screen.getByText("No results.")
    expect(cell).toBeInTheDocument()
    expect(cell.closest("td")).toHaveAttribute("colspan", String(columns.length))
  })

  it("sorts ascending, then descending, then hides the column via the dropdown menu", async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={rows} />)

    const nameHeader = screen.getByRole("columnheader", { name: /name/i })
    const trigger = within(nameHeader).getByRole("button")

    // Ascending: each item always renders one icon (ArrowUp/ArrowDown/EyeOff);
    // a second svg (the Check) appears only once that sort direction is active.
    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: /asc/i }))

    await user.click(trigger)
    const ascItem = screen.getByRole("menuitem", { name: /asc/i })
    expect(ascItem.querySelectorAll("svg")).toHaveLength(2)
    const descItemBeforeActive = screen.getByRole("menuitem", { name: /desc/i })
    expect(descItemBeforeActive.querySelectorAll("svg")).toHaveLength(1)
    await user.keyboard("{Escape}")

    // Descending
    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: /desc/i }))

    await user.click(trigger)
    const descItem = screen.getByRole("menuitem", { name: /desc/i })
    expect(descItem.querySelectorAll("svg")).toHaveLength(2)
    await user.keyboard("{Escape}")

    // Hide
    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: /hide/i }))

    expect(screen.queryByRole("columnheader", { name: /name/i })).not.toBeInTheDocument()
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
    expect(screen.queryByText("Bob")).not.toBeInTheDocument()
  })
})
