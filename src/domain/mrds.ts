/**
 * MRD (planned date) rules shared by Models & MRDs and Project Initiation (pure, no React). Which dates exist comes
 * from the archetype's milestones (see wbsTree.plannedDateFields).
 */
import type { MilestoneDef, ProjectArchetype } from './index'
import { plannedDateFields, validatePlannedDates } from './wbsTree'

/**
 * Given milestones in their configured order, return the set of milestone ids whose own dates violate
 * chronological order (non-blocking warning only).
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

/** Required planned dates of the archetype that are blank. Returns date key → message. */
export function validateMrds(archetype: ProjectArchetype | undefined, mrds: Record<string, string>): Record<string, string> {
  return validatePlannedDates(plannedDateFields(archetype), mrds)
}

/** Drop blank values (a missing key = "Awaiting MRD"). */
export function cleanMrds(mrds: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mrds).filter(([, v]) => !!v))
}
