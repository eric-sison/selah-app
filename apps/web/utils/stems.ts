export type StemName = "vocals" | "drums" | "bass" | "guitar" | "piano" | "other"

export const STEM_NAMES: readonly StemName[] = ["vocals", "drums", "bass", "guitar", "piano", "other"]

export interface StemUrls {
  vocals: string
  drums: string
  bass: string
  guitar: string
  piano: string
  other: string
}
