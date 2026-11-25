/**
 * The "More Filters" set (Part, Vendor, People & Departments) shared by My Work, My Parts, My Approvals and My Screen.
 * Values come from the part's intake fields (Part Intake): any field can be filtered by ticking values. Part Number,
 * Vendor No, PIC and Activity use the page's existing filters (they are shown in the same window).
 */
import type { ModelRecord, PartRecord, PicAssignment } from '../../domain'
import { INTAKE_FIELDS } from '../../mock/partIntakeFields'
import { intakeValue } from '../intake/intakeValues'

/** Ticked values per intake field key; a missing / empty list = no filter. */
export type ExtraSel = Record<string, string[]>
export const EMPTY_EXTRA: ExtraSel = {}

/** Fields the page already filters on (bound to the page's own state, not to ExtraSel). */
export const BOUND_KEYS = ['part_number', 'vendor_no', 'qa_pic_name', 'activity'] as const
export type BoundKey = (typeof BOUND_KEYS)[number]

export interface ExtraGroup { title: string; keys: string[] }
export const EXTRA_GROUPS: ExtraGroup[] = [
  { title: 'Part', keys: ['part_number', 'part_name', 'plant', 'technology_category', 'common_type', 'fitment_location', 'color', 'monitoring_reason', 'status'] },
  { title: 'Vendor', keys: ['vendor_no', 'vendor_name', 'vendor_criteria'] },
  { title: 'People & departments', keys: ['qa_pic_staff_id', 'qa_pic_name', 'section_name', 'section_manager', 'dpm_id', 'dpm_name', 'engineering_dept', 'supply_chain_dept'] },
  { title: 'Activity', keys: ['activity'] },
]
/** Keys stored in ExtraSel. */
export const EXTRA_KEYS = EXTRA_GROUPS.flatMap((g) => g.keys).filter((k) => !(BOUND_KEYS as readonly string[]).includes(k))
export const LABELS: Record<string, string> = {
  ...Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, f.label])),
  qa_pic_name: 'QA PIC', activity: 'Activity',
}

export const extraCount = (s: ExtraSel) => EXTRA_KEYS.filter((k) => (s[k]?.length ?? 0) > 0).length
export const hasExtra = (s: ExtraSel) => extraCount(s) > 0

/** What the part holds for one intake field. */
export function partValue(key: string, part: PartRecord, models: ModelRecord[], picAssignments: PicAssignment[]): string {
  const f = INTAKE_FIELDS.find((x) => x.key === key)
  return f ? intakeValue(f, part, models, picAssignments) : ''
}

/** Does the part pass every ticked extra filter? */
export function matchExtra(part: PartRecord, sel: ExtraSel, models: ModelRecord[], picAssignments: PicAssignment[]): boolean {
  for (const k of EXTRA_KEYS) {
    const want = sel[k]
    if (!want?.length) continue
    if (!want.includes(partValue(k, part, models, picAssignments))) return false
  }
  return true
}

/** Distinct values per extra key over these parts (for the pickers). */
export function extraOptions(parts: PartRecord[], models: ModelRecord[], picAssignments: PicAssignment[]): Record<string, { value: string }[]> {
  const out: Record<string, { value: string }[]> = {}
  for (const k of EXTRA_KEYS) {
    const vals = new Set<string>()
    for (const p of parts) { const v = partValue(k, p, models, picAssignments); if (v) vals.add(v) }
    out[k] = [...vals].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value }))
  }
  return out
}
