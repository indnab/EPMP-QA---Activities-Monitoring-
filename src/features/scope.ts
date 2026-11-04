import type { ActivityDefinition, ActivityEntry, FieldDefinition, PartRecord, TemplateRow } from '../domain'
import type { RygResult } from '../engine'
import type { RygStatus } from '../components/RygDot'
import { getPersonaScope } from '../store/personaStore'
import type { PersonaId } from '../store/personaStore'

/** True when a part is visible to the persona (PIC/SectionAdmin: own section, Vendor: own vendor, others: all). */
export function partInScope(part: PartRecord, persona: PersonaId): boolean {
  const scope = getPersonaScope(persona)
  if (scope.section && part.section !== scope.section) return false
  if (scope.vendor && part.vendorName !== scope.vendor) return false
  return true
}

/** True when a template row is visible to the persona (a section-scoped persona sees only its own section's rows). */
export function rowInScope(row: TemplateRow, persona: PersonaId): boolean {
  const scope = getPersonaScope(persona)
  return !scope.section || row.section === scope.section
}

/** Activities still open to new use: everything except those Admin has deleted (retired). Existing work on retired ones continues. */
export function activitiesForNewUse(activities: ActivityDefinition[]): ActivityDefinition[] {
  return activities.filter((a) => !a.retired)
}

/** Maps an engine RYG result to the RygDot status. */
export function toRygStatus(ryg: RygResult): RygStatus {
  return ryg === 'NA' ? 'na' : (ryg.toLowerCase() as Exclude<RygStatus, 'na'>)
}

/** Who may mark a part Not applicable (when the activity allows it). */
export function canMarkNotApplicable(persona: PersonaId): boolean {
  return persona === 'PIC'
}

/** Who may reverse a Not-applicable marker. */
export function canReverseNotApplicable(persona: PersonaId): boolean {
  return persona === 'PIC' || persona === 'SIC' || persona === 'Admin'
}

/** Whether the persona may edit the field on this entry. Used by the part form and the My Work grid so both follow the same rule. */
/** Vendors see only the fields they enter plus fields the Admin enabled for them; every other role sees all fields. */
export function fieldVisibleToPersona(field: FieldDefinition, persona: string): boolean {
  if (persona !== 'Vendor') return true
  return field.enteredBy === 'Vendor' || field.visibleToVendor === true
}

export function canPersonaEdit(
  field: FieldDefinition,
  currentPersona: string,
  entry: ActivityEntry | undefined
): boolean {
  if (field.source === 'calculated' || field.enteredBy === 'System') return false
  if (field.enteredBy !== currentPersona) return false
  if (currentPersona === 'Vendor') {
    const state = entry?.validationState ?? 'Draft'
    return state === 'Draft' || state === 'Sent back'
  }
  return true
}

export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`
}

export function fmtOffset(n: number): string {
  if (n === 0) return 'MRD'
  return n > 0 ? `MRD+${n}` : `MRD${n}`
}

/** e.g. "PP: MRD-23 to MRD-4" */
export function fmtOffsetRange(row: TemplateRow): string {
  return `${row.milestoneId}: ${fmtOffset(row.startOffset)} to ${fmtOffset(row.endOffset)}`
}

/** Baseline "today" for the demo; matches the engine's default so Activities, Workspace, Home and Dashboards agree. */
export const DEMO_TODAY = '2026-10-15'
