import type { ActivityDefinition, ActivityEntry, FieldDefinition, PartRecord } from '../domain'
import { evaluateCalculatedFields, evaluateConditionalRules } from '../engine'
import { formatValue } from './mywork/gridModel'
import { fieldVisibleToPersona } from './scope'

/** The two part lists an Admin can add activity-field columns to (set per field in the Builder). */
export type ListKind = 'part' | 'drill'

/** File, button and table fields have no single-cell text, so they cannot be list columns. */
export function canBeListColumn(field: FieldDefinition): boolean {
  return field.type !== 'file' && field.type !== 'button' && field.type !== 'table'
}

/** The activity's fields the Admin ticked for the list, in field order. */
export function listColumnFields(activity: ActivityDefinition, kind: ListKind, persona?: string): FieldDefinition[] {
  return activity.fields.filter(
    (f) =>
      canBeListColumn(f) &&
      // Data-only fields exist only for dashboards, so the Workspace part list (built from form entries) skips them.
      !(kind === 'part' && f.dataOnly) &&
      (kind === 'part' ? f.showInPartList === true : f.showInDrillList === true) &&
      // A vendor gets only the columns of fields they may see.
      (!persona || fieldVisibleToPersona(f, persona))
  )
}

/**
 * Display text for each column field of one part, matching the entry grid: calculated values are recomputed, a field
 * hidden by a rule reads "n/a", an empty value reads "—". A part with no entry yet, or marked Not applicable, is "—".
 */
export function listCellTexts(
  activity: ActivityDefinition,
  fields: FieldDefinition[],
  entry: ActivityEntry | undefined,
  part: PartRecord,
  milestoneMrd: string | undefined
): string[] {
  if (!entry || entry.notApplicable) return fields.map(() => '—')
  const local = { ...entry.values }
  const calc = evaluateCalculatedFields(activity, local, part, milestoneMrd)
  const values: Record<string, any> = { ...local }
  for (const f of activity.fields) {
    if (f.source === 'calculated' && calc[f.key] !== undefined) values[f.key] = calc[f.key]
  }
  const cond = evaluateConditionalRules(activity.fields, values)
  return fields.map((f) => (cond[f.key]?.visible === false ? 'n/a' : formatValue(f, values[f.key])))
}
