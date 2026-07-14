import { describe, expect, it } from "vitest"
import { isSafeRedirectTarget } from "@/utils/is-safe-redirect"

describe("isSafeRedirectTarget", () => {
  it("rejects null", () => {
    expect(isSafeRedirectTarget(null)).toBe(false)
  })

  it("rejects undefined", () => {
    expect(isSafeRedirectTarget(undefined)).toBe(false)
  })

  it("rejects an empty string", () => {
    expect(isSafeRedirectTarget("")).toBe(false)
  })

  it("rejects a relative path with no leading slash", () => {
    expect(isSafeRedirectTarget("dashboard")).toBe(false)
  })

  it("rejects a protocol-relative URL", () => {
    expect(isSafeRedirectTarget("//evil.com")).toBe(false)
  })

  it("rejects an absolute URL", () => {
    expect(isSafeRedirectTarget("https://evil.com")).toBe(false)
  })

  it("accepts a same-origin relative path", () => {
    expect(isSafeRedirectTarget("/dashboard")).toBe(true)
  })

  it("accepts a bare slash", () => {
    expect(isSafeRedirectTarget("/")).toBe(true)
  })
})
