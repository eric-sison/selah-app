import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { db } from "../db/index.js"
import { env } from "../utils/env.js"
import { sendMail } from "./mailer.js"
import * as schema from "../db/schema.js"

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
})
