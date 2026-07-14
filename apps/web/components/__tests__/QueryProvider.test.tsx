import { QueryClient, useQueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryProvider } from "@/components/QueryProvider"
import { render, screen } from "../../test/render"

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => <div data-testid="devtools" />,
}))

function ClientReader() {
  const queryClient = useQueryClient()
  return <div data-testid="is-query-client">{String(queryClient instanceof QueryClient)}</div>
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("QueryProvider", () => {
  it("renders children and provides a real QueryClient", () => {
    render(
      <QueryProvider>
        <ClientReader />
      </QueryProvider>
    )

    expect(screen.getByTestId("is-query-client")).toHaveTextContent("true")
  })

  it("renders the devtools when NODE_ENV is development", () => {
    vi.stubEnv("NODE_ENV", "development")

    render(
      <QueryProvider>
        <div>content</div>
      </QueryProvider>
    )

    expect(screen.getByTestId("devtools")).toBeInTheDocument()
  })

  it("does not render the devtools when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production")

    render(
      <QueryProvider>
        <div>content</div>
      </QueryProvider>
    )

    expect(screen.queryByTestId("devtools")).not.toBeInTheDocument()
  })
})
