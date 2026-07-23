import { z } from "@hono/zod-openapi"
import "dotenv/config"

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  ALLOWED_ORIGINS: z
    .string()
    .transform((s) => s.split(",").map((o) => o.trim()))
    .pipe(z.array(z.url())),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),
  WEB_URL: z.url().default("http://localhost:3000"),
  FACEBOOK_CLIENT_ID: z.string().min(1),
  FACEBOOK_CLIENT_SECRET: z.string().min(1),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Selah <no-reply@selah.local>"),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default("garage"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().default("selah-songs"),
  // Stem separation: apps/api posts a job to the worker (STEM_WORKER_URL,
  // authenticated with STEM_WORKER_SECRET) and the worker posts its result
  // back to apps/api's callback route (authenticated with
  // STEM_CALLBACK_SECRET) - two distinct secrets so a leak in one direction
  // doesn't compromise the other. API_PUBLIC_URL is this API's own
  // externally-reachable base URL, needed so the callback URL handed to the
  // worker (which may run on a different host) actually resolves back here.
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
  STEM_WORKER_URL: z.url(),
  STEM_WORKER_SECRET: z.string().min(32),
  STEM_CALLBACK_SECRET: z.string().min(32),
})

export type Env = z.infer<typeof EnvSchema>

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env)

  if (!result.success) {
    console.error(
      "Invalid environment variables:",
      z.treeifyError(result.error)
    )
    throw new Error("Invalid environment variables")
  }

  return result.data
}

export const env = parseEnv()
