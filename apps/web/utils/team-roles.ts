import type { operations } from "@/types/api"

export type TeamRole = operations["addTeamMemberRole"]["requestBody"]["content"]["application/json"]["role"]

// Mirrors the closed set defined by apps/api/src/db/app-schema.ts's
// `teamRole` pgEnum - the generated `TeamRole` union above keeps this in
// sync at the type level, but the enum's actual members still have to be
// listed by hand for anything that needs to render/iterate them (e.g. a
// role picker).
export const TEAM_ROLES: TeamRole[] = [
  "bass",
  "drums",
  "singer",
  "electric_guitar",
  "acoustic_guitar",
  "keyboard",
]

export function formatTeamRole(role: TeamRole): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
