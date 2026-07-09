import nodemailer from "nodemailer"
import { env } from "../utils/env.js"

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth:
    env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
})

interface SendMailOptions {
  to: string
  subject: string
  html: string
}

export const sendMail = async ({
  to,
  subject,
  html,
}: SendMailOptions): Promise<void> => {
  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
  })
}
