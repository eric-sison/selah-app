import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthMiddleware } from "better-auth/api"
import { admin } from "better-auth/plugins"
import { db } from "../db/index.js"
import { env } from "../utils/env.js"
import { getValidInvitationByToken, markInvitationAccepted } from "../services/invitations.js"
import { sendMail } from "./mailer.js"
import * as schema from "../db/auth-schema.js"

// Local/LAN origins reach the API directly on its own port; the public
// domain is assumed to reverse-proxy /api on the same host, so it keeps
// whatever port its origin implies (443 for https).
function toApiHost(origin: string) {
  const url = new URL(origin)
  return url.protocol === "https:" ? url.host : `${url.hostname}:${env.PORT}`
}

export const auth = betterAuth({
  plugins: [admin()],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  baseURL: {
    allowedHosts: env.ALLOWED_ORIGINS.map(toApiHost),
    fallback: `http://localhost:${env.PORT}`,
  },
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.ALLOWED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your email",
        html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
      })
    },
  },
  socialProviders: {
    facebook: {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      // Facebook sign-in only works for users who already have an account;
      // it never implicitly creates one.
      disableSignUp: true,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Only link via an explicit authClient.linkSocial() call from an
      // already-authenticated session, never implicitly during sign-in.
      disableImplicitLinking: true,
      // Facebook doesn't reliably return emailVerified:true on its OAuth
      // profile. Without trusting it here, every link-social call fails
      // with "unable_to_link_account" regardless of the account linked.
      trustedProviders: ["facebook"],
    },
  },
  advanced: {
    cookies: {
      session_token: {
        name: "_ssid",
      },
      state: {
        name: "_st",
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return

      const token = ctx.query?.token
      if (typeof token !== "string") {
        throw new APIError("BAD_REQUEST", {
          message: "An invitation link is required to sign up.",
        })
      }

      const invitation = await getValidInvitationByToken(token)
      if (!invitation || invitation.email !== ctx.body?.email) {
        throw new APIError("FORBIDDEN", {
          message: "This invitation is invalid or has expired.",
        })
      }

      // Marked accepted here rather than after sign-up succeeds, since
      // there's no reliable per-request "after" hook available for this -
      // a failed sign-up past this point (e.g. duplicate email) means the
      // invite must be re-issued.
      await markInvitationAccepted(invitation.id)
    }),
  },
})
