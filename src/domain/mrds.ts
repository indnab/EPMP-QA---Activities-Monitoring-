/**
 * MRD date rules shared by Models & MRDs and Project Initiation (pure, no React).
 */
import type { MilestoneDef } from './index'
import { TIMELINE_MILESTONES } from './timelineCatalog'

/**
 * Given milestones in their configured order, return the set of milestone ids whose dates violate chronological
 * order (non-blocking warning only).
 */
export function findOutOfOrderMilestones(milestones: MilestoneDef[], mrds: Record<string, string>): Set<string> {
  const filled = milestones.map((m) => ({ id: m.id, date: mrds[m.id] })).filter((m) => m.date)
  const bad = new Set<string>()
  for (let i = 1; i < filled.length; i++) {
    if (filled[i].date < filled[i - 1].date) {
      bad.add(filled[i].id)
      bad.add(filled[i - 1].id)
    }
  }
  return bad
}

/**
 * Required-MRD check. Mandatory milestones with their own date (e.g. SOP) must be filled; PP / MPP / Pilot have no
 * single date (their dates are sub-type MRDs), so they are not required here. Returns milestone id → message.
 */
export function validateMrds(milestones: MilestoneDef[], mrds: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const m of milestones) {
    if (TIMELINE_MILESTONES.includes(m.id)) continue
    if (m.mandatory && !mrds[m.id]) errors[m.id] = `${m.label} MRD is required.`
  }
  return errors
}

/** Drop blank values (a missing key = "Awaiting MRD"). */
export function cleanMrds(mrds: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mrds).filter(([, v]) => !!v))
}
