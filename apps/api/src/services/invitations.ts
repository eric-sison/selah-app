import { randomBytes } from "node:crypto"
import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { db } from "../db/index.js"
import { invitation } from "../db/app-schema.js"
import { users } from "../db/auth-schema.js"
import { env } from "../utils/env.js"
import { sendMail } from "../lib/mailer.js"

const INVITATION_TTL_MS = 2 * 60 * 60 * 1000

/**
 * Thrown by {@link createInvitation} when the target email already belongs
 * to a registered user. `code` is machine-readable so route handlers can
 * map it to a specific HTTP status (409) without string-matching the
 * message.
 */
export class InvitationError extends Error {
  code: "USER_ALREADY_EXISTS"

  constructor(code: "USER_ALREADY_EXISTS", message: string) {
    super(message)
    this.code = code
  }
}

export interface CreateInvitationInput {
  email: string
  /** User id of the admin sending the invite - stored on the row and used as an FK to `users`. */
  invitedBy: string
}

/**
 * Creates a sign-up invitation and emails the link to `email`.
 *
 * Generates a random token, persists an invitation row valid for
 * {@link INVITATION_TTL_MS} (2 hours), and sends an email containing a
 * `/auth/sign-up?token=...` link built from `env.WEB_URL`.
 *
 * @throws {InvitationError} if a user with this email is already registered.
 */
export async function createInvitation({ email, invitedBy }: CreateInvitationInput) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (existingUser) {
    throw new InvitationError("USER_ALREADY_EXISTS", "A user with this email already exists.")
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)

  const [created] = await db
    .insert(invitation)
    .values({
      email,
      token,
      invitedBy,
      expiresAt,
    })
    .returning()

  const url = `${env.WEB_URL}/auth/sign-up?token=${token}`
  await sendMail({
    to: email,
    subject: "You're invited",
    html: `<p>Click <a href="${url}">here</a> to create your account. This link expires in 2 hours.</p>`,
  })

  return created
}

/**
 * Looks up an invitation by its token, returning it only if it's still
 * usable - `null` if no invitation has that token, it was already accepted,
 * or it's past its `expiresAt`. Used by the sign-up page to validate a token
 * before showing the form, and by the sign-up flow itself before creating
 * the account.
 */
export async function getValidInvitationByToken(token: string) {
  const found = await db.query.invitation.findFirst({
    where: eq(invitation.token, token),
  })

  if (!found || found.acceptedAt || found.expiresAt.getTime() < Date.now()) {
    return null
  }

  return found
}

/**
 * Stamps an invitation as accepted (`acceptedAt = now`) so
 * {@link getValidInvitationByToken} stops treating it as usable - called
 * once the invited user finishes signing up.
 */
export async function markInvitationAccepted(id: string) {
  await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, id))
}

/**
 * Lists every still-usable invitation (not yet accepted, not yet expired),
 * newest first, joined with the admin who sent it - backs the pending
 * invitations list on the settings page.
 */
export async function listPendingInvitations() {
  return db.query.invitation.findMany({
    where: and(isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())),
    orderBy: desc(invitation.createdAt),
    with: {
      invitedByUser: { columns: { id: true, name: true } },
    },
  })
}

/**
 * Revokes a pending invitation by deleting its row, so its token
 * immediately stops working.
 *
 * @returns `true` if an invitation with this id was found and deleted, `false` otherwise.
 */
export async function revokeInvitation(id: string): Promise<boolean> {
  const found = await db.query.invitation.findFirst({ where: eq(invitation.id, id) })
  if (!found) return false

  await db.delete(invitation).where(eq(invitation.id, id))
  return true
}
