import type { operations } from "@/types/api"

export type LineupStatus =
  operations["listLineups"]["responses"][200]["content"]["application/json"][number]["status"]

// Mirrors apps/api/src/db/app-schema.ts's `lineupStatus` pgEnum.
export const LINEUP_STATUS_LABELS: Record<LineupStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
}
