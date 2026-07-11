import createClient from "openapi-fetch"
import type { paths } from "@/types/api"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

// Server-side calls (RSC, route handlers) hit the API directly. Client-side
// calls must go through next.config.ts's "/api/:path*" rewrite instead - it's
// same-origin from the browser's perspective, so the session cookie (scoped
// to the web app's origin) actually gets sent; a direct cross-origin request
// to API_URL never would.
export const apiClient = createClient<paths>({
  baseUrl: typeof window === "undefined" ? API_URL : "",
})
