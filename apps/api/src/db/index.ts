import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { env } from "../utils/env.js"
import * as appSchema from "./app-schema.js"
import * as authSchema from "./schema.js"

const pool = new Pool({ connectionString: env.DATABASE_URL })

export const db = drizzle(pool, { schema: { ...authSchema, ...appSchema } })
