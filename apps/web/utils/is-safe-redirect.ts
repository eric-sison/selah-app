// Must be a same-origin relative path. Rejects absolute/protocol-relative
// URLs (e.g. "//evil.com") so a redirect/callback param can't be used to
// send signed-in users off-site.
export function isSafeRedirectTarget(target: string | null | undefined): target is string {
  return !!target && target.startsWith("/") && !target.startsWith("//")
}
