import { randomBytes, randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { invitation } from "../db/app-schema.js"
import { user } from "../db/schema.js"
import { env } from "../utils/env.js"
import { sendMail } from "../lib/mailer.js"

const INVITATION_TTL_MS = 2 * 60 * 60 * 1000

export class InvitationError extends Error {
  code: "USER_ALREADY_EXISTS"

  constructor(code: "USER_ALREADY_EXISTS", message: string) {
    super(message)
    this.code = code
  }
}

export interface CreateInvitationInput {
  email: string
  invitedBy: string
}

export async function createInvitation({ email, invitedBy }: CreateInvitationInput) {
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, email),
  })

  if (existingUser) {
    throw new InvitationError(
      "USER_ALREADY_EXISTS",
      "A user with this email already exists."
    )
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)

  const [created] = await db
    .insert(invitation)
    .values({
      id: randomUUID(),
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

export async function getValidInvitationByToken(token: string) {
  const found = await db.query.invitation.findFirst({
    where: eq(invitation.token, token),
  })

  if (!found || found.acceptedAt || found.expiresAt.getTime() < Date.now()) {
    return null
  }

  return found
}

export async function markInvitationAccepted(id: string) {
  await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, id))
}
