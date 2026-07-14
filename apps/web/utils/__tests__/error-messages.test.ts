import { describe, expect, it } from "vitest"
import { ErrorMessages } from "@/utils/error-messages"

describe("ErrorMessages", () => {
  it("covers the documented HTTP status codes", () => {
    expect(
      Object.keys(ErrorMessages)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504])
  })

  it("gives every message a non-empty full and short variant", () => {
    for (const statusEntries of Object.values(ErrorMessages)) {
      for (const message of Object.values(statusEntries)) {
        expect(typeof message.full).toBe("string")
        expect(message.full.length).toBeGreaterThan(0)
        expect(typeof message.short).toBe("string")
        expect(message.short.length).toBeGreaterThan(0)
      }
    }
  })

  it("exposes the specific keys consumed by SignInForm/SignUpForm/InviteForm", () => {
    expect(ErrorMessages[401].INVALID_CREDENTIALS.short).toBeTruthy()
    expect(ErrorMessages[403].EMAIL_NOT_VERIFIED.short).toBeTruthy()
    expect(ErrorMessages[404].RESOURCE_NOT_FOUND.short).toBeTruthy()
    expect(ErrorMessages[409].RESOURCE_CONFLICT.short).toBeTruthy()
    expect(ErrorMessages[422].VALIDATION_FAILED.short).toBeTruthy()
    expect(ErrorMessages[429].TOO_MANY_REQUESTS.short).toBeTruthy()
    expect(ErrorMessages[500].SERVER_ERROR.short).toBeTruthy()
  })
})
