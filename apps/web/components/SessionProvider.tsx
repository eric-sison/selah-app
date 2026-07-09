"use client"

import type { FunctionComponent, ReactNode } from "react"
import { createContext, useContext } from "react"
import type { Session } from "@/lib/session"

const SessionContext = createContext<Session | null>(null)

interface SessionProviderProps {
  value: Session | null
  children: ReactNode
}

export const SessionProvider: FunctionComponent<SessionProviderProps> = ({
  value,
  children,
}) => {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
