import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { isSafeRedirectTarget } from "@/utils/is-safe-redirect"

// A Server Component can redirect to /auth/sign-in when its real session
// check fails, but it can't clear the now-stale cookie - only a Route
// Handler/Server Action can. Without clearing it, proxy.ts's cheap
// cookie-presence check keeps treating the visitor as signed in and bounces
// them straight back out of /auth/sign-in, looping forever. This route is
// deliberately outside /auth (so proxy's bounce doesn't intercept it first)
// and outside /api (rewritten to the API in next.config.ts).
export function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirect")
  const signInUrl = new URL("/auth/sign-in", request.url)
  signInUrl.searchParams.set("redirect", isSafeRedirectTarget(redirectTo) ? redirectTo : "/")

  const response = NextResponse.redirect(signInUrl)
  response.cookies.delete("_ssid")
  return response
}
