import type { operations } from "@/types/api"

export type LineupServiceType =
  operations["createLineup"]["requestBody"]["content"]["application/json"]["serviceType"]

// Mirrors the closed set defined by apps/api/src/db/app-schema.ts's
// `lineupServiceType` pgEnum - listed by hand for anything that needs to
// render/iterate them (e.g. a service type picker), same as INSTRUMENTS in
// utils/instruments.ts.
export const LINEUP_SERVICE_TYPES: LineupServiceType[] = [
  "sunday_service",
  "youth_service",
  "necrological_service",
  "prayer_meeting_service",
  "victory_day",
  "other",
]

export function formatLineupServiceType(type: LineupServiceType): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
