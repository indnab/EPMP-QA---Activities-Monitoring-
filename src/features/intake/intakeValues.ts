import type { ModelRecord, PartRecord, PicAssignment } from '../../domain'
import { getPicOn } from '../../engine'
import { INTAKE_FIELDS, trialStatusFor } from '../../mock/partIntakeFields'
import type { IntakeField } from '../../mock/partIntakeFields'
import { DEMO_TODAY } from '../scope'

export const SOURCE_LABEL: Record<NonNullable<PartRecord['origin']>, string> = { SAP: 'SAP', ENOVIA: 'ENOVIA', Manual: 'Manual (dummy)' }

/** What a part shows for one intake field, as text. Empty string when nothing is known. */
export function intakeValue(f: IntakeField, part: PartRecord, models: ModelRecord[], picAssignments: PicAssignment[]): string {
  const a = part.attrs ?? {}
  switch (f.key) {
    case 'trial_status':
      return trialStatusFor(models.find((m) => m.name === part.model)?.mrds, DEMO_TODAY)
    case 'qa_pic_name': {
      const name = getPicOn(part, picAssignments, DEMO_TODAY).name
      return name && a.qa_pic_staff_id ? `${a.qa_pic_staff_id} - ${name}` : name
    }
    case 'created_by':
      return a.created_by || part.createdBy || ''
    case 'created_on':
      return a.created_on || part.createdAt?.slice(0, 10) || ''
    case 'created_at':
      return a.created_at || part.createdAt?.slice(11, 16) || ''
  }
  if (f.core) return String(part[f.core] ?? '')
  return a[f.key] ?? ''
}

export const DISPLAY_FIELDS: IntakeField[] = (() => {
  // Part Number and Part Name lead the table; the rest follow the order of the client sheet.
  const first = ['part_number', 'part_name']
  const shown = INTAKE_FIELDS.filter((f) => f.display)
  return [...first.map((k) => shown.find((f) => f.key === k)!), ...shown.filter((f) => !first.includes(f.key))]
})()
