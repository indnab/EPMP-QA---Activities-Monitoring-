/**
 * Hand-configured PP activities from "epmp-activity-fields-export.json" (`purposeBuilt`: PP01–PP05, PP10, PP11).
 * The other PP activities come from the JSON catalogue via ./ppCatalogueFields.ts (generated).
 *
 * Mapping from the JSON: control dropdown → dropdown/yesNo, readonly → System-entered (calculated / SAP /
 * ENOVIA), editableBy Vendor|PIC → `by`, visibleWhen → `rules` (hide when the controlling value is not met),
 * repeating groups → `table` fields.
 */
import type { ConditionalRule, DerivedRows, ValidationRule, FieldSource, FieldType, TableColumn, TimelineTemplateEntry } from '../domain'
import type { PersonaId } from '../store/personaStore'

export interface PpFieldSpec {
  k: string
  l: string
  t?: FieldType
  o?: string[]
  cols?: TableColumn[]
  derived?: DerivedRows
  by?: PersonaId | 'System'
  src?: FieldSource
  val?: boolean
  req?: boolean
  dash?: boolean
  list?: boolean
  /** Data-only: system-fed per part for dashboards, never on a form. */
  dataOnly?: boolean
  /** Calculated count of rows of a table of this activity (see FieldDefinition.countRows). */
  countRows?: { tableField: string; column: string; equals: string }
  rules?: ConditionalRule[]
  /** Vendor can see this field (read-only) even though they do not enter it. */
  vendor?: boolean
}

export interface PpActivityConfig {
  /** Replace the activity's whole field list. */
  fields?: PpFieldSpec[]
  /** Sum-matching validation rules. */
  validationRules?: ValidationRule[]
  /** Allow the vendor to give a planned timeline for the activity. */
  vendorTimeline?: boolean
  /** PIC can mark a submission NG; resubmission rounds are tracked. */
  trackNgRounds?: boolean
  /** Show this part's NG / exceptions from other activities. */
  canReferenceOtherActivities?: boolean
  /** Sub-type-based timeline template (dates from the sub-type MRD per technical category). */
  timelineTemplate?: TimelineTemplateEntry[]
}

/** Hide the field unless `key` equals `value` (several of these combine as AND). */
const onlyWhen = (key: string, value: string): ConditionalRule => ({
  dependsOn: key,
  operator: 'notEquals',
  value,
  action: 'hide'
})

// ── PP01 · Parts drawing confirmation in IBOM (PIC edits everything; Vendor read-only) ──────────────
const YES = onlyWhen('drawing_applicability', 'Y')
const PP1: PpFieldSpec[] = [
  { k: 'drawing_applicability', l: 'Drawing applicability', t: 'yesNo', by: 'PIC' },
  { k: 'spec_drawing_availability', l: 'Spec drawing availability', t: 'dropdown', o: ['Available', 'Not Available'], by: 'PIC', src: 'mapping', dash: true, list: true, rules: [YES] },
  { k: 'final_drawing_availability', l: 'Final drawing availability', t: 'dropdown', o: ['Available', 'Not Available'], by: 'PIC', src: 'mapping', rules: [YES] },
  { k: 'part_classification', l: 'Part classification', t: 'dropdown', o: ['MSIL', 'Proprietary'], by: 'PIC', src: 'mapping', dash: true, list: true, rules: [YES] },
  { k: 'monitoring_required_reason', l: 'Monitoring required reason', t: 'dropdown', o: ['New Part', 'ECN Part'], by: 'PIC', src: 'sap', rules: [YES] },
  { k: 'target_date_msil_drawing', l: 'Target date – MSIL drawing', t: 'date', by: 'System', src: 'calculated', rules: [YES, onlyWhen('part_classification', 'MSIL')] },
  { k: 'target_date_proprietary_part', l: 'Target date – Proprietary part', t: 'date', by: 'System', src: 'enovia', rules: [YES, onlyWhen('part_classification', 'Proprietary')] }
]

// ── PP02 · Spec meeting confirmation (Vendor enters planned finish; PIC approves) ───────────────────
const PP2: PpFieldSpec[] = [
  { k: 'tech_meeting_status', l: 'Tech meeting status (TM +PM)', t: 'yesNo', by: 'System', src: 'enovia', dash: true, list: true },
  { k: 'process_meeting', l: 'Process meeting (only PM)', t: 'yesNo', by: 'System', src: 'enovia' },
  { k: 'spec_meeting_not_applicable', l: 'Spec meeting not applicable', t: 'flag', by: 'System', src: 'calculated' },
  { k: 'data_update_pending', l: 'Data update pending', t: 'flag', by: 'System', src: 'calculated' },
  { k: 'sap_spec_meeting_status', l: 'SAP spec meeting status', t: 'dropdown', o: ['Not Initiated', 'Initiated', 'Pending For Approval', 'Approved'], by: 'System', src: 'sap', dash: true, list: true },
  { k: 'enovia_spec_meeting_status', l: 'Enovia spec meeting status', t: 'dropdown', o: ['Initiated', 'Pending', 'Approved'], by: 'System', src: 'enovia' },
  { k: 'planned_start_date', l: 'Planned start date (MSIL PIC provides the target date to the vendor)', t: 'date', by: 'PIC', src: 'enovia' },
  { k: 'planned_finish_date', l: 'Planned finish date', t: 'date', by: 'Vendor', val: true },
  { k: 'actual_start_date', l: 'Actual start date', t: 'date', by: 'System', src: 'sap' },
  { k: 'sap_actual_end_date', l: 'SAP actual end date', t: 'date', by: 'System', src: 'sap' },
  { k: 'enovia_actual_end_date', l: 'Enovia actual end date', t: 'date', by: 'System', src: 'enovia' },
  // Data-only: calculated from SAP for the dashboards; not on the input form.
  { k: 'spec_meeting_timeliness', l: 'Spec meeting timeliness (from SAP)', t: 'dropdown', o: ['On time', 'Delayed'], by: 'System', src: 'sap', dash: true, dataOnly: true }
]

// ── PP03 · SOR sharing (Vendor submits; segregation after approval is PIC-only) ─────────────────────
// Each category's Disagree count generates that many point rows, so every disagreed point is captured separately.
const PP3: PpFieldSpec[] = [
  { k: 'not_applicable', l: 'Not applicable', t: 'number', by: 'Vendor', val: true },
  {
    k: 'sor_categories', l: 'SOR categories', t: 'table', by: 'Vendor', val: true,
    cols: [
      { key: 'sor_category_name', label: 'SOR category', type: 'text' },
      { key: 'total', label: 'Total', type: 'number' },
      { key: 'agree', label: 'Agree', type: 'number' },
      { key: 'disagree', label: 'Disagree', type: 'number' }
    ]
  },
  {
    k: 'disagreed_points', l: 'Disagreed points (one row per disagreed point)', t: 'table', by: 'Vendor', val: true,
    derived: { from: 'count', fieldKey: 'sor_categories', countColumn: 'disagree', labelColumn: 'sor_category_name', targetLabelColumn: 'category' },
    cols: [
      { key: 'category', label: 'SOR category', type: 'text', enteredBy: 'System' },
      { key: 'requirement', label: 'Disagreed point – SOR requirement', type: 'longText' },
      { key: 'reason', label: 'Reason', type: 'longText' }
    ]
  },
  { k: 'agreed_as_is', l: 'Agreed – As is', t: 'number', by: 'PIC', dash: true },
  { k: 'agreed_alternate_control', l: 'Agreed – Alternate control', t: 'number', by: 'PIC' },
  { k: 'not_agreed_not_feasible', l: 'Not agreed – Not feasible', t: 'number', by: 'PIC', dash: true },
  { k: 'not_agreed_denial', l: 'Not agreed – Denial', t: 'number', by: 'PIC' },
  { k: 'not_agreed_cost_up', l: 'Not agreed – Cost up', t: 'number', by: 'PIC' },
  {
    k: 'alternate_control_rows', l: 'Alternate control points', t: 'table', by: 'PIC',
    cols: [
      { key: 'point', label: 'Alternate control point', type: 'text' },
      { key: 'details', label: 'Details', type: 'text' }
    ]
  }
]

// ── PP04 · Tier-2 compilation: one row per Tier-2 supplier, derived from SAP ────────────────────────
const PP4: PpFieldSpec[] = [
  {
    k: 'tier_2_suppliers', l: 'Tier-2 suppliers', t: 'table', by: 'Vendor', src: 'sap', val: true,
    derived: { from: 'sap' },
    cols: [
      { key: 'code', label: 'Tier-2 supplier code', type: 'number', enteredBy: 'System' },
      { key: 'name', label: 'Tier-2 supplier name', type: 'text', enteredBy: 'System' },
      { key: 'rag', label: 'Tier-2 status (RYG; blank = Others)', type: 'dropdown', options: ['Red', 'Yellow', 'Green'], enteredBy: 'System' },
      { key: 'others_status', label: 'Others status (when Tier-2 status is blank)', type: 'dropdown', options: ['New (Unaudited)', 'Tier-1', 'Directed Tier-2', 'Overseas', 'Trader', 'RM', 'Catalogue Part', 'Consumables', 'Others'], enteredBy: 'System' },
      { key: 'special_process_approved', label: 'Special process approved', type: 'dropdown', options: ['Yes', 'No'], enteredBy: 'PIC' },
      { key: 'planned_bom_upload_date', label: 'Planned BOM upload date', type: 'date', enteredBy: 'Vendor' }
    ]
  },
  // Data-only counts for the dashboards: rows of the Tier-2 table by RYG status (blank = Others).
  ...(['Red', 'Yellow', 'Green', ''] as const).map((v): PpFieldSpec => ({
    k: `tier_2_${v ? v.toLowerCase() : 'others'}_count`,
    l: `Tier-2 ${v || 'Others'} count`,
    t: 'number', by: 'System', src: 'calculated', dash: true, dataOnly: true,
    countRows: { tableField: 'tier_2_suppliers', column: 'rag', equals: v }
  }))
]

// ── PP05 · New Tier-2 assessment: the PP04 rows whose Others status is "New (Unaudited)" ────────────
const PP5: PpFieldSpec[] = [
  {
    k: 'new_tier_2_vendors', l: 'New Tier-2 vendors', t: 'table', by: 'PIC',
    derived: { from: 'activity', activityId: 'pp-4', fieldKey: 'tier_2_suppliers', where: { column: 'others_status', equals: 'New (Unaudited)' } },
    cols: [
      { key: 'code', label: 'New Tier-2 vendor code', type: 'number', enteredBy: 'System' },
      { key: 'name', label: 'New Tier-2 vendor name', type: 'text', enteredBy: 'System' },
      { key: 'audit_status', label: 'Audit status', type: 'dropdown', options: ['Done', 'Not done'], enteredBy: 'PIC' }
    ]
  }
]

// ── PP10 · Sheet metal part accuracy (accuracy % = OK ÷ total × 100) ────────────────────────────────
const APPLIC = onlyWhen('sheet_metal_applicability', 'Y')
const PP10: PpFieldSpec[] = [
  { k: 'sheet_metal_applicability', l: 'Sheet metal applicability (only for Weld part)', t: 'yesNo', by: 'System', src: 'sap' },
  { k: 'total_parameters', l: 'Total parameters', t: 'number', by: 'System', src: 'sap', rules: [APPLIC] },
  { k: 'ok_parameters', l: 'OK parameters', t: 'number', by: 'Vendor', val: true, rules: [APPLIC] },
  { k: 'accuracy', l: 'Accuracy %', t: 'percent', by: 'System', src: 'calculated', dash: true, rules: [APPLIC] }
]

// ── PP11 · Part inspection with deviation status ────────────────────────────────────────────────────
const INSP = onlyWhen('inspection_applicability', 'Y')
const NG = onlyWhen('inspection_status', 'NG')
const PP11: PpFieldSpec[] = [
  { k: 'inspection_applicability', l: 'Inspection applicability (on basis of part applicable for PP trial)', t: 'yesNo', by: 'Vendor', val: true },
  { k: 'inspection_target_date', l: 'Inspection target date', t: 'date', by: 'System', src: 'enovia', rules: [INSP] },
  { k: 'inspection_actual_date', l: 'Inspection actual date', t: 'date', by: 'System', src: 'sap', rules: [INSP] },
  { k: 'inspection_completed', l: 'Inspection completed', t: 'yesNo', by: 'System', src: 'enovia', rules: [INSP] },
  { k: 'evidence_attachment', l: 'Evidence attachment', t: 'yesNo', by: 'System', src: 'sap', rules: [INSP] },
  { k: 'inspection_status', l: 'Inspection status', t: 'dropdown', o: ['OK', 'NG'], by: 'System', src: 'enovia', dash: true, list: true, rules: [INSP] },
  { k: 'delay_reason', l: 'Delay reason (when overdue)', t: 'longText', by: 'Vendor', val: true, rules: [INSP] },
  {
    k: 'ng_rows', l: 'NG details', t: 'table', by: 'Vendor', val: true, rules: [NG],
    cols: [
      { key: 'cat', label: 'NG category', type: 'dropdown', options: ['Appearance', 'Dimension', 'Material', 'Performance', 'Regulation'] },
      { key: 'obs', label: 'NG observation', type: 'text' },
      { key: 'date', label: 'Correction timeline', type: 'date' }
    ]
  },
  { k: 'correction_beyond_mrd', l: 'Correction beyond MRD', t: 'flag', by: 'System', src: 'calculated', rules: [NG] },
  { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC', rules: [NG] },
  { k: 'e_doc_number', l: 'E-Doc number', by: 'PIC', rules: [onlyWhen('deviation_raised', 'Y')] },
  { k: 'deviation_approval_status', l: 'Deviation approval status', t: 'dropdown', o: ['Approved', 'Pending', 'Rejected', 'In progress'], by: 'System', src: 'edoc', rules: [onlyWhen('deviation_raised', 'Y')] },
  { k: 'remark', l: 'Remark (PIC)', t: 'longText', by: 'PIC' }
]

/** Mark which of the activity's fields the vendor can see ('all' or a list of keys); vendor-entered fields are always visible. */
const vendorSees = (specs: PpFieldSpec[], keys: string[] | 'all'): PpFieldSpec[] =>
  specs.map((s) => (keys === 'all' || keys.includes(s.k) ? { ...s, vendor: true } : s))

export const PP_FIELD_CONFIG: Record<string, PpActivityConfig> = {
  'pp-1': { fields: vendorSees(PP1, 'all') },
  'pp-2': { fields: vendorSees(PP2, ['planned_start_date', 'actual_start_date']), vendorTimeline: true },
  // Agree + Disagree must equal Total for every SOR category.
  'pp-3': { fields: vendorSees(PP3, []), validationRules: [{ id: 'pp3-sum', scope: { tableField: 'sor_categories' }, left: ['agree', 'disagree'], op: '=', right: ['total'] }] },
  'pp-4': { fields: PP4 },
  'pp-5': { fields: vendorSees(PP5, 'all') },
  // OK parameters cannot exceed the total.
  'pp-10': { fields: vendorSees(PP10, 'all'), validationRules: [{ id: 'pp10-ok', scope: 'fields', left: ['ok_parameters'], op: '<=', right: ['total_parameters'] }] },
  'pp-11': {
    fields: vendorSees(PP11, ['inspection_target_date', 'inspection_actual_date', 'inspection_completed', 'evidence_attachment', 'inspection_status', 'correction_beyond_mrd', 'remark']),
    trackNgRounds: true,
    canReferenceOtherActivities: true,
    // Demo: part inspection is timed off the sub-type MRD — once under PP and again under MPP — so it splits into a
    // PP instance and an MPP instance per part (Weld parts off the Weld MRD, Engine off Engine, others off Assembly).
    timelineTemplate: [
      { category: 'Weld', offsets: [{ milestoneId: 'PP', subType: 'Weld', minusDays: 10, endMinusDays: 0 }, { milestoneId: 'MPP', subType: 'Weld', minusDays: 8, endMinusDays: 0 }] },
      { category: 'Engine', offsets: [{ milestoneId: 'PP', subType: 'Engine', minusDays: 10, endMinusDays: 0 }, { milestoneId: 'MPP', subType: 'Engine', minusDays: 8, endMinusDays: 0 }] },
      { category: 'PlasticAssy', offsets: [{ milestoneId: 'PP', subType: 'Assembly', minusDays: 10, endMinusDays: 0 }, { milestoneId: 'MPP', subType: 'Assembly', minusDays: 8, endMinusDays: 0 }] },
      { category: 'RubberAssy', offsets: [{ milestoneId: 'PP', subType: 'Assembly', minusDays: 10, endMinusDays: 0 }, { milestoneId: 'MPP', subType: 'Assembly', minusDays: 8, endMinusDays: 0 }] },
      { category: 'OtherAssy', offsets: [{ milestoneId: 'PP', subType: 'Assembly', minusDays: 10, endMinusDays: 0 }, { milestoneId: 'MPP', subType: 'Assembly', minusDays: 8, endMinusDays: 0 }] }
    ]
  }
}
