/**
 * Bundling. Every part number has a Main Part Number (Part Intake); the main part is itself one of the part numbers.
 * Parts whose main part is another part are "bundled" with it: what is filled for the main part applies to them
 * automatically, so each activity is worked once, on the main part. A bundled part can be given its own data for an
 * activity (ActivityEntry.bundleOwn) and switched back to follow the main part again.
 */
import type { PartRecord } from './index'

/** The main part a part is bundled with, or undefined when it is a main part itself (or has no main part). */
export function mainPartOf(p: { partNo: string; attrs?: Record<string, string> } | undefined): string | undefined {
  const m = p?.attrs?.main_part_number?.trim()
  return m && m !== p!.partNo ? m : undefined
}

/** The parts bundled with this main part (not the main part itself, not superseded). */
export function bundledPartsOf(mainPartNo: string, parts: PartRecord[]): PartRecord[] {
  return parts.filter((p) => !p.supersededBy && mainPartOf(p) === mainPartNo)
}

/** Part numbers that are main parts of at least one bundled part (shown in blue). */
export function bundleMains(parts: PartRecord[]): Set<string> {
  const out = new Set<string>()
  for (const p of parts) { const m = !p.supersededBy ? mainPartOf(p) : undefined; if (m) out.add(m) }
  return out
}
/** Text colour for a main part with bundled parts (blue); empty for every other part. */
export const MAIN_PART_CLS = 'font-semibold !text-[#1d4ed8]'
