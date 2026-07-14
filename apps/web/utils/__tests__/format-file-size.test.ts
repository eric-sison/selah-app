import { describe, expect, it } from "vitest"
import { formatFileSize } from "@/utils/format-file-size"

describe("formatFileSize", () => {
  it("formats zero bytes", () => {
    expect(formatFileSize(0)).toBe("0.0 MB")
  })

  it("formats an exact whole number of megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB")
  })

  it("formats a fractional number of megabytes", () => {
    expect(formatFileSize(1536 * 1024)).toBe("1.5 MB")
  })

  it("rounds to one decimal place", () => {
    expect(formatFileSize(1234567)).toBe("1.2 MB")
  })

  it("formats a large file size", () => {
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25.0 MB")
  })
})
