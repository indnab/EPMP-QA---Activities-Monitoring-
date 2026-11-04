/**
 * The activity list, generated from "Copy of EPMP Fields.xlsx" (./epmpFields.ts, by tools/gen_epmp_fields.cjs):
 *  - PP trial: pp-1 … pp-18, tracked under the PP milestone
 *  - MPP trial: mpp-1 …, tracked under the MPP milestone
 *  - Pilot/SOP trial: sop-1 …, tracked under the SOP milestone
 * PP01–PP05, PP10 and PP11 keep their hand-built configuration (./ppFieldConfig.ts) for derived tables, validation
 * rules, NG rounds and timeline templates; every other activity takes its fields straight from the sheet.
 */
import type { ActivityDefinition, ApprovalFlow, FieldDefinition } from '../domain'
import { PP_FIELD_CONFIG } from './ppFieldConfig'
import type { PpFieldSpec } from './ppFieldConfig'
import { PP_CATALOGUE_META } from './ppCatalogueFields'
import { EPMP_ACTIVITIES } from './epmpFields'

function toField(s: PpFieldSpec): FieldDefinition {
  return {
    key: s.k,
    label: s.l,
    type: s.t ?? 'text',
    options: s.o,
    columns: s.cols,
    derivedRows: s.derived,
    mandatory: s.req ?? false,
    enteredBy: s.by ?? 'PIC',
    visibleToVendor: s.vendor || undefined,
    dataOnly: s.dataOnly || undefined,
    countRows: s.countRows,
    source: s.src ?? 'manual',
    validatedBy: s.val ? 'PIC' : null,
    showOnDashboard: s.dash ?? false,
    showInPartList: s.list || undefined,
    conditionalRules: s.rules
  }
}

const FLOW_VENDOR_PIC: ApprovalFlow = {
  steps: [
    { stepIndex: 0, role: 'Vendor', label: 'Vendor Entry', allowedOutcomes: ['Submit'] },
    { stepIndex: 1, role: 'PIC', label: 'PIC Validation', allowedOutcomes: ['Approve', 'Edit', 'Send back'] }
  ]
}
const FLOW_PIC: ApprovalFlow = {
  steps: [{ stepIndex: 0, role: 'PIC', label: 'PIC Confirmation', allowedOutcomes: ['Approve', 'Edit'] }]
}

export const PP_ACTIVITIES: ActivityDefinition[] = EPMP_ACTIVITIES.map((spec) => {
  const id = spec.id
  const cfg = PP_FIELD_CONFIG[id]
  const fields = (cfg?.fields ?? spec.fields).map(toField)
  const anyVendor = fields.some((x) => x.enteredBy === 'Vendor' || x.validatedBy === 'PIC')
  const legacy = id.startsWith('pp-') ? PP_CATALOGUE_META[`PP${id.slice(3).padStart(2, '0')}`] : undefined
  return {
    id,
    name: spec.name,
    scope: spec.scope,
    ownerPersona: 'PIC',
    description: legacy?.desc ?? `${spec.name}. Tracked under ${spec.milestone}; fields come from the EPMP field specification.`,
    allowNotApplicable: true,
    allowVendorPlannedTimeline: (cfg?.vendorTimeline ?? false) || undefined,
    deviationFlow: ['PIC', 'SIC', 'DPM'],
    trackNgRounds: cfg?.trackNgRounds || undefined,
    timelineTemplate: cfg?.timelineTemplate,
    canReferenceOtherActivities: cfg?.canReferenceOtherActivities || undefined,
    published: true,
    fields,
    validationRules: cfg?.validationRules,
    flow: anyVendor ? FLOW_VENDOR_PIC : FLOW_PIC
  }
})

/** The milestone each activity is tracked under (PP, MPP or SOP). */
export const ACTIVITY_MILESTONE: Record<string, string> = Object.fromEntries(EPMP_ACTIVITIES.map((a) => [a.id, a.milestone]))

export const ALL_BLUEPRINTS = PP_ACTIVITIES
