import { describe, expect, it } from "vitest"
import { SessionProvider, useSession } from "@/components/SessionProvider"
import { createMockSession } from "../../test/fixtures"
import { render, screen } from "../../test/render"

function SessionConsumer() {
  const session = useSession()
  return <div data-testid="session-value">{session ? String(session.user.name) : "null"}</div>
}

describe("SessionProvider", () => {
  it("provides the given session value to consumers", () => {
    const session = createMockSession({ name: "Jane Doe" })

    render(
      <SessionProvider value={session}>
        <SessionConsumer />
      </SessionProvider>
    )

    expect(screen.getByTestId("session-value")).toHaveTextContent("Jane Doe")
  })

  it("provides null when the value prop is null", () => {
    render(
      <SessionProvider value={null}>
        <SessionConsumer />
      </SessionProvider>
    )

    expect(screen.getByTestId("session-value")).toHaveTextContent("null")
  })

  it("useSession returns null outside of a provider", () => {
    render(<SessionConsumer />)

    expect(screen.getByTestId("session-value")).toHaveTextContent("null")
  })
})
