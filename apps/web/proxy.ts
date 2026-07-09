import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isSafeRedirectTarget } from "@/utils/is-safe-redirect"

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "_ssid"

const PUBLIC_PATHS = ["/auth"]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// Bulk, path-based gate: unlisted paths are protected by default so new
// pages are safe unless explicitly made public. This only checks that the
// session cookie is present, not that it's still valid - full validation
// happens in the layouts/DAL closer to the actual data.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME)

  if (isPublicPath(pathname)) {
    if (hasSession) {
      const redirectTo = request.nextUrl.searchParams.get("redirect")
      return NextResponse.redirect(new URL(isSafeRedirectTarget(redirectTo) ? redirectTo : "/", request.url))
    }
    return NextResponse.next()
  }

  if (!hasSession) {
    const signInUrl = new URL("/auth/sign-in", request.url)
    signInUrl.searchParams.set("redirect", pathname + search)
    return NextResponse.redirect(signInUrl)
  }

  // Forward the requested path as a header so a Server Component (e.g. the
  // protected layout's own session re-check) can build the same redirect if
  // its stricter, non-optimistic check fails where this one passed.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", pathname + search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
