import type { TechnicalCategory, MrdSubType } from './index'

/** The five technical categories an Admin can apply an activity to. */
export const TECHNICAL_CATEGORIES: { id: TechnicalCategory; label: string }[] = [
  { id: 'Engine', label: 'Engine' },
  { id: 'Weld', label: 'Weld' },
  { id: 'RubberAssy', label: 'Rubber Assy' },
  { id: 'PlasticAssy', label: 'Plastic Assy' },
  { id: 'OtherAssy', label: 'Other Assy' }
]

export const CATEGORY_LABEL: Record<TechnicalCategory, string> = Object.fromEntries(
  TECHNICAL_CATEGORIES.map((c) => [c.id, c.label])
) as Record<TechnicalCategory, string>

export const SUBTYPE_LABEL: Record<MrdSubType, string> = {
  Kani: 'Kani MRD',
  Jig: 'Jig MRD',
  Weld: 'Weld MRD',
  Engine: 'Engine MRD',
  Transmission: 'Transmission MRD',
  Assembly: 'Assembly MRD',
  ActualQVDate: 'Actual QV Date'
}

/** A sub-type that only applies when the technical category is Weld (Kani / Jig per the client spec). */
export const WELD_ONLY_SUBTYPES: MrdSubType[] = ['Kani', 'Jig']

/**
 * MRD sub-types that exist under each milestone, straight from the client's list.
 * Kani/Jig are Weld-only (see WELD_ONLY_SUBTYPES) but still listed under the milestone that offers them.
 *  PP    : Kani, Jig, Weld, Engine, Transmission, Assembly, Actual QV Date
 *  MPP   : Jig, Weld, Engine, Transmission, Assembly, Actual QV Date   (no Kani)
 *  Pilot : Jig (on basis of change content), Weld, Engine, Transmission
 */
export const MILESTONE_SUBTYPES: Record<string, MrdSubType[]> = {
  PP: ['Kani', 'Jig', 'Weld', 'Engine', 'Transmission', 'Assembly', 'ActualQVDate'],
  MPP: ['Jig', 'Weld', 'Engine', 'Transmission', 'Assembly', 'ActualQVDate'],
  Pilot: ['Jig', 'Weld', 'Engine', 'Transmission']
}

/** The milestones that carry timeline sub-types, in display order. */
export const TIMELINE_MILESTONES: string[] = ['PP', 'MPP', 'Pilot']

/** Sub-types applicable under a milestone for a given category (Weld-only ones are hidden for other categories). */
export function subTypesFor(milestoneId: string, category: TechnicalCategory | null): MrdSubType[] {
  const all = MILESTONE_SUBTYPES[milestoneId] ?? []
  if (category === 'Weld' || category === null) return all
  return all.filter((s) => !WELD_ONLY_SUBTYPES.includes(s))
}

/** Composite key for a sub-type MRD date on ModelRecord.mrds, e.g. 'PP:Weld'. */
export function subTypeMrdKey(milestoneId: string, subType: MrdSubType): string {
  return `${milestoneId}:${subType}`
}

/**
 * Derive a technical category for a part from its department / name, for parts that don't carry one
 * explicitly (seed/SAP parts). Heuristic only — a real system would ingest this from the part master.
 */
export function deriveTechnicalCategory(part: { department?: string; partName?: string; technicalCategory?: TechnicalCategory }): TechnicalCategory {
  if (part.technicalCategory) return part.technicalCategory
  const hay = `${part.department ?? ''} ${part.partName ?? ''}`.toLowerCase()
  if (/engine|piston|rod|cylinder|crank/.test(hay)) return 'Engine'
  if (/body|sheet|panel|weld|bracket|sill|roof|door skin|stamp/.test(hay)) return 'Weld'
  if (/seal|gasket|rubber|hose|grommet|weatherstrip|boot/.test(hay)) return 'RubberAssy'
  if (/bumper|grill|trim|plastic|interior|lamp|mirror|console|cladding/.test(hay)) return 'PlasticAssy'
  return 'OtherAssy'
}
