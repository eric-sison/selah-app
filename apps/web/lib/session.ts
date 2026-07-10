import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

export interface Session {
  user: Record<string, unknown>
  session: Record<string, unknown>
}

// React's cache() dedupes calls within a single render pass, so a layout,
// a page, and any nested Server Components can all call this and only one
// request reaches the API.
export const getServerSession = cache(async (): Promise<Session | null> => {
  const cookie = (await headers()).get("cookie") ?? ""

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  })

  if (!res.ok) return null

  return res.json()
})

// Data Access Layer entry point: call this directly next to sensitive data
// reads/mutations (Server Actions, route handlers, data-heavy pages), not
// just in a layout. Proxy only checks that a session cookie exists; this
// does the real validation against the API.
export async function verifySession(): Promise<Session> {
  const session = await getServerSession()

  if (!session) redirect("/session-expired")

  return session
}
