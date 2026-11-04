import type { ActivityDefinition, FieldDefinition } from '../../domain'
import { makeEntryId } from '../../domain'
import type { PersonaId } from '../../store/personaStore'
import { evaluateCalculatedFields, evaluateConditionalRules, getMilestoneMrd } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { canPersonaEdit } from '../scope'
import { validatingRole } from './workQueue'

/** Same emptiness test as the part form (plus NaN, which an emptied number input can leave behind). */
export function isEmptyValue(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'number' && Number.isNaN(v)) ||
    (Array.isArray(v) && v.length === 0)
  )
}

/** 'enter' = the role fills its own fields; 'validate' = the PIC reviews Vendor submissions and fills its own fields. */
export type GridMode = 'enter' | 'validate'

/** Fields the role types into in the grid (calculated, system, button and derived fields are not entered). */
export function entryColumns(activity: ActivityDefinition, role: PersonaId): FieldDefinition[] {
  return activity.fields.filter(
    (f) => !f.dataOnly && f.enteredBy === role && f.source !== 'calculated' && f.type !== 'button' && f.type !== 'derived'
  )
}

/** Validate mode shows every entered or fetched field: other roles' values read-only, the role's own editable. */
export function validateColumns(activity: ActivityDefinition): FieldDefinition[] {
  return activity.fields.filter((f) => !f.dataOnly && f.source !== 'calculated' && f.type !== 'button' && f.type !== 'derived')
}

/** Calculated fields, shown read-only so the role sees the effect of what is typed. */
export function calculatedColumns(activity: ActivityDefinition): FieldDefinition[] {
  return activity.fields.filter((f) => !f.dataOnly && f.source === 'calculated')
}

/** One grid row after applying the staged edits and the activity's rules. */
export interface RowModel {
  inst: FilteredInstance
  /** Entry id of the part under this template row. */
  id: string
  /** Saved values + staged edits + calculated values. */
  values: Record<string, any>
  cond: Record<string, { visible: boolean; mandatory: boolean }>
  /** Per field key: true when the role can type in this cell right now. */
  editable: Record<string, boolean>
  /** Why the row is read-only (Submitted, Approved, Not applicable); undefined when the row is open. */
  lock: string | undefined
  /** Visible, mandatory, role-editable fields that are still empty. */
  missing: FieldDefinition[]
  /** At least one field the role can edit has a value. */
  hasValue: boolean
  /** Staged edits not yet saved. */
  dirty: boolean
  /** Comments from "Send back", keyed by field. */
  sentBackNotes: Record<string, string>
  /** Open, complete and not empty: can be submitted. */
  ready: boolean
}

function lockReason(inst: FilteredInstance, role: PersonaId, mode: GridMode): string | undefined {
  if (inst.notApplicable) return 'Not applicable'
  if (inst.status === 'Submitted') {
    const step = inst.activity.flow.steps[inst.entry?.currentStepIndex ?? 0]
    // In validate mode a Submitted row waiting for this role is the thing being worked on
    if (mode === 'validate' && step?.role === validatingRole(role)) return undefined
    return step ? `Submitted · waiting for ${step.label}` : 'Submitted'
  }
  if (inst.status === 'Approved') return 'Approved'
  return undefined
}

/**
 * Applies the engine rules to one row exactly as the part form does: calculated fields first, then conditional
 * visibility and mandatory, then the shared edit-rights rule. In validate mode `ready` means "can be approved":
 * no visible mandatory field of the role's own is empty (a value is not required, unlike submitting).
 */
export function buildRowModel(
  inst: FilteredInstance,
  role: PersonaId,
  edits: Record<string, any>,
  mode: GridMode = 'enter'
): RowModel {
  const activity = inst.activity
  const local = { ...(inst.entry?.values ?? {}), ...edits }
  const calc = evaluateCalculatedFields(activity, local, inst.part, getMilestoneMrd(inst.model, inst.row.milestoneId))
  const values: Record<string, any> = { ...local }
  for (const f of activity.fields) {
    if (f.source === 'calculated' && calc[f.key] !== undefined) values[f.key] = calc[f.key]
  }

  const cond = evaluateConditionalRules(activity.fields, values)
  const lock = lockReason(inst, role, mode)

  const editable: Record<string, boolean> = {}
  const missing: FieldDefinition[] = []
  let hasValue = false
  // Validate mode checks the fields of the role being validated for, so a SIC or DPM cannot approve a row whose
  // required PIC fields are empty even though they cannot fill them in.
  const owner = mode === 'validate' ? validatingRole(role) : role
  for (const f of activity.fields) {
    const state = cond[f.key]
    const mayEdit = canPersonaEdit(f, role, inst.entry)
    editable[f.key] = !lock && state?.visible !== false && mayEdit
    const counts = mode === 'validate' ? f.enteredBy === owner && f.source !== 'calculated' : mayEdit
    if (!lock && counts && state?.visible) {
      const empty = isEmptyValue(values[f.key])
      if (state.mandatory && empty) missing.push(f)
      if (!empty) hasValue = true
    }
  }

  const sentBackNotes: Record<string, string> = {}
  if (inst.status === 'Sent back' && inst.entry?.fieldMeta) {
    for (const [k, v] of Object.entries(inst.entry.fieldMeta)) {
      if (v.status === 'Send back' && v.comment) sentBackNotes[k] = v.comment
    }
  }

  return {
    inst,
    id: makeEntryId(inst.row.id, inst.part.partNo),
    values,
    cond,
    editable,
    lock,
    missing,
    hasValue,
    dirty: Object.keys(edits).length > 0,
    sentBackNotes,
    ready: !lock && missing.length === 0 && (mode === 'validate' || hasValue)
  }
}

/** Read-only text for a value, matching the part form's previews. */
export function formatValue(field: FieldDefinition, value: unknown): string {
  if (field.type === 'table') {
    const n = Array.isArray(value) ? value.length : 0
    return n === 0 ? '—' : `${n} row${n === 1 ? '' : 's'}`
  }
  if (value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value))) return '—'
  if (field.type === 'yesNo') return value === 'Y' ? 'Yes' : value === 'N' ? 'No' : String(value)
  if (field.type === 'percent') return `${value}%`
  if (field.type === 'flag') return value ? 'Flagged' : 'Clear'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  return String(value)
}

/**
 * Validate mode: splits rows into those that can be approved now and those that cannot (a visible mandatory field
 * of the role's own is empty). Locked rows are ignored. The confirmation dialog and the approve action both use this
 * so the preview always matches what happens.
 */
export function splitApprovable(rows: RowModel[]): { ready: RowModel[]; skipped: RowModel[] } {
  const open = rows.filter((m) => !m.lock)
  return { ready: open.filter((m) => m.ready), skipped: open.filter((m) => !m.ready) }
}
