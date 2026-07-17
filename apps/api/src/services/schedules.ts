import { asc } from "drizzle-orm"
import { db } from "../db/index.js"
import { schedule } from "../db/app-schema.js"

/**
 * Lists every schedule entry, ordered by when it happens, each joined with
 * its lineup (if any) - a lineup-linked entry's display title comes from
 * the lineup's own series/topic rather than `schedule.title`, which is only
 * meaningful for standalone entries (see its comment in app-schema.ts).
 */
export async function listSchedules() {
  return db.query.schedule.findMany({
    orderBy: asc(schedule.startAt),
    with: {
      lineup: {
        columns: { id: true, seriesName: true, topic: true },
      },
    },
  })
}
