import { useTheme } from "next-themes"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "@/components/ThemeProvider"
import { render, screen } from "../../test/render"

function ThemeReader() {
  const { forcedTheme } = useTheme()
  return <div data-testid="theme-reader">{forcedTheme ?? "no-forced-theme"}</div>
}

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <div>child content</div>
      </ThemeProvider>
    )

    expect(screen.getByText("child content")).toBeInTheDocument()
  })

  it("passes default props through to next-themes and allows overriding them", () => {
    render(
      <ThemeProvider forcedTheme="dark">
        <ThemeReader />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme-reader")).toHaveTextContent("dark")
  })
})
