"use client"

import type { FunctionComponent, ReactNode } from "react"
import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

interface QueryProviderProps {
  children: ReactNode
}

export const QueryProvider: FunctionComponent<QueryProviderProps> = ({
  children,
}) => {
  // One client per component instance so server-rendered query state stays
  // scoped to a single request instead of leaking across users on a shared
  // module-level instance.
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
