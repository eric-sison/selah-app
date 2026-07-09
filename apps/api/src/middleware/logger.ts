import { structuredLogger } from "@hono/structured-logger"
import pino from "pino"
import { env } from "../utils/env.js"

const rootLogger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "*.headers.authorization",
      "*.headers.cookie",
      "*.req.headers.authorization",
      "*.req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        levelFirst: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "{msg}",
      },
    },
  }),
})

export const logger = () => {
  return structuredLogger({
    createLogger: (c) => rootLogger.child({ requestId: c.var.requestId }),
  })
}
