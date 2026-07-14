import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { SessionProvider } from "@/components/SessionProvider"
import type { Session } from "@/lib/session"

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  session?: Session | null
}

// A fresh QueryClient per render, same reasoning as QueryProvider.tsx
// (avoids cross-test cache leakage) - retries/gcTime disabled so failed
// queries don't hang a test waiting out backoff timers.
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: ReactElement,
  { session = null, ...options }: RenderWithProvidersOptions = {}
) {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider value={session}>{children}</SessionProvider>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}

export * from "@testing-library/react"
