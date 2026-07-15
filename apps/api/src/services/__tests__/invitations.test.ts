import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockDb = {
  query: {
    users: { findFirst: vi.fn() },
    invitation: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
}

vi.mock("../../db/index.js", () => ({ db: mockDb }))

const sendMail = vi.fn().mockResolvedValue(undefined)
vi.mock("../../lib/mailer.js", () => ({ sendMail }))

vi.mock("../../utils/env.js", () => ({ env: { WEB_URL: "https://selah.example" } }))

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({ toString: () => "deadbeef".repeat(8) })),
}))

const { createInvitation, getValidInvitationByToken, InvitationError, markInvitationAccepted } =
  await import("../invitations.js")

function mockInsertReturning(row: unknown) {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([row]),
    }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("createInvitation", () => {
  it("throws InvitationError without creating a row or sending mail when the email is already registered", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({ id: "user-1", email: "taken@example.com" })

    await expect(createInvitation({ email: "taken@example.com", invitedBy: "admin-1" })).rejects.toThrow(
      InvitationError
    )

    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("tags the thrown error with the USER_ALREADY_EXISTS code", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({ id: "user-1" })

    await expect(
      createInvitation({ email: "taken@example.com", invitedBy: "admin-1" })
    ).rejects.toMatchObject({
      code: "USER_ALREADY_EXISTS",
    })
  })

  it("creates an invitation row with a generated token and a 2-hour expiry", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(undefined)
    const created = { id: "inv-1", email: "new@example.com", token: "deadbeef".repeat(8) }
    mockInsertReturning(created)

    const result = await createInvitation({ email: "new@example.com", invitedBy: "admin-1" })

    expect(result).toBe(created)
    const valuesCall = mockDb.insert.mock.results[0].value.values as ReturnType<typeof vi.fn>
    expect(valuesCall).toHaveBeenCalledWith({
      email: "new@example.com",
      token: "deadbeef".repeat(8),
      invitedBy: "admin-1",
      expiresAt: new Date("2026-01-01T02:00:00.000Z"),
    })
  })

  it("emails the invite link with the generated token and configured WEB_URL", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(undefined)
    mockInsertReturning({ id: "inv-1", email: "new@example.com" })

    await createInvitation({ email: "new@example.com", invitedBy: "admin-1" })

    expect(sendMail).toHaveBeenCalledWith({
      to: "new@example.com",
      subject: "You're invited",
      html: expect.stringContaining(`https://selah.example/auth/sign-up?token=${"deadbeef".repeat(8)}`),
    })
  })
})

describe("getValidInvitationByToken", () => {
  it("returns null when no invitation matches the token", async () => {
    mockDb.query.invitation.findFirst.mockResolvedValue(undefined)

    expect(await getValidInvitationByToken("missing")).toBeNull()
  })

  it("returns null when the invitation was already accepted", async () => {
    mockDb.query.invitation.findFirst.mockResolvedValue({
      acceptedAt: new Date("2025-12-31T00:00:00.000Z"),
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    })

    expect(await getValidInvitationByToken("used")).toBeNull()
  })

  it("returns null when the invitation has expired", async () => {
    mockDb.query.invitation.findFirst.mockResolvedValue({
      acceptedAt: null,
      expiresAt: new Date("2025-12-31T00:00:00.000Z"),
    })

    expect(await getValidInvitationByToken("expired")).toBeNull()
  })

  it("returns the invitation when it is unaccepted and not yet expired", async () => {
    const invitation = { acceptedAt: null, expiresAt: new Date("2026-01-02T00:00:00.000Z") }
    mockDb.query.invitation.findFirst.mockResolvedValue(invitation)

    expect(await getValidInvitationByToken("valid")).toBe(invitation)
  })
})

describe("markInvitationAccepted", () => {
  it("sets acceptedAt to the current time for the given invitation id", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    mockDb.update.mockReturnValue({ set })

    await markInvitationAccepted("inv-1")

    expect(set).toHaveBeenCalledWith({ acceptedAt: new Date("2026-01-01T00:00:00.000Z") })
    expect(where).toHaveBeenCalledTimes(1)
  })
})
