import type pino from "pino"
import type { auth } from "../lib/auth.js"

export type RequestContext = {
  Variables: {
    logger: pino.Logger
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}
