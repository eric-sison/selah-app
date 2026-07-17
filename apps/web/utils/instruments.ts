import type { operations } from "@/types/api"

export type Instrument =
  operations["updateMusician"]["requestBody"]["content"]["application/json"]["instruments"][number]

// Mirrors the closed set defined by apps/api/src/db/app-schema.ts's
// `instrument` pgEnum - the generated `Instrument` union above keeps this in
// sync at the type level, but the enum's actual members still have to be
// listed by hand for anything that needs to render/iterate them (e.g. an
// instrument picker).
export const INSTRUMENTS: Instrument[] = [
  "bass",
  "drums",
  "singer",
  "electric_guitar",
  "acoustic_guitar",
  "keyboard",
]

export function formatInstrument(instrument: Instrument): string {
  return instrument
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
