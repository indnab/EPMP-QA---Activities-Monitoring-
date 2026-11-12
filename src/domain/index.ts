import type { PersonaId } from '../store/personaStore'

export type Scope = 'NewPart' | 'ECN' | 'Both'

export type FieldType =
  | 'text'
  | 'longText'
  | 'number'
  | 'percent'
  | 'date'
  | 'yesNo'
  | 'dropdown'
  | 'multiSelect'
  | 'file'
  | 'flag'
  | 'button'
  | 'derived'
  | 'table' // a repeating list of structured rows (e.g. SOR not-agreed points)

/**
 * A column of a `table` field. The value of a table field is an array of row objects keyed by column key.
 * `enteredBy` lets a column be owned by a different persona than the field (e.g. the PIC fills
 * "Reason for acceptance" on rows the Vendor added); absent = same as the field's enteredBy.
 */
export interface TableColumn {
  key: string
  label: string
  type: 'text' | 'longText' | 'number' | 'date' | 'dropdown'
  options?: string[] // for dropdown columns
  enteredBy?: PersonaId | 'System'
}

export type FieldSource =
  | 'manual'
  | 'calculated'
  | 'upload'
  | 'dropdown'
  | 'mapping'
  | 'mail'
  | 'enovia'
  | 'sap'
  | 'edoc'
  | 'regapp'

export type KpiRole = 'status' | 'date' | 'count' | 'percentage' | 'category' | null

export interface ConditionalRule {
  dependsOn: string
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains'
  value: any
  action: 'show' | 'hide' | 'makeMandatory' | 'makeOptional'
}

/**
 * Where a `table` field's rows come from when they are derived instead of typed in.
 *  - `sap`: the rows are fetched from SAP (one per record, e.g. Tier-2 suppliers).
 *  - `activity`: the rows are the rows of another activity's table for the same part, filtered by one column value.
 *  - `count`: the number of rows follows a count column of another table in this activity.
 * Derived tables have no Add / Remove row; only the columns owned by the current role can be edited.
 */
export type DerivedRows =
  | { from: 'sap' }
  | { from: 'activity'; activityId: string; fieldKey: string; where: { column: string; equals: string } }
  /**
   * One row per counted item of another table in the SAME activity: a source row whose `countColumn` is 3 yields
   * 3 rows carrying that row's `labelColumn` text. Rows get a nested serial number (row 2 of source → 2.1, 2.2, 2.3)
   * in a hidden `_sl` value that the table shows in its leading # column. Used for "one row per disagreed SOR point".
   */
  | {
      from: 'count'
      /** The table (same activity) whose rows are counted. */
      fieldKey: string
      /** Source column holding the count (e.g. "Disagree"). */
      countColumn: string
      /** Source column whose text labels the generated rows (e.g. "SOR category"). */
      labelColumn: string
      /** Column of THIS table that receives that label (linked, read-only). */
      targetLabelColumn: string
    }

export interface FieldDefinition {
  key: string
  label: string
  type: FieldType
  options?: string[]
  /** For a `table` field: the row columns (what the vendor/PIC fills per row). */
  columns?: TableColumn[]
  /** For a `table` field: rows derived from SAP or from another activity (see DerivedRows). */
  derivedRows?: DerivedRows
  mandatory: boolean
  enteredBy: PersonaId | 'System'
  /**
   * Whether the Vendor can see this field (read-only). Vendors always see the fields they enter; for any other field
   * they see it only when this is true. PIC and other roles see every field.
   */
  visibleToVendor?: boolean
  /**
   * Data-only field: fed by the system (SAP / ENOVIA / calculated) per part and kept for the activity's dashboards and
   * lists. It is never shown on an input form, is never mandatory, and does not affect the part's status.
   */
  dataOnly?: boolean
  /**
   * For a calculated `number` field: the number of rows of a table field (same activity) whose `column` equals `equals`
   * (blank `equals` counts rows where the column is blank). E.g. Tier-2 suppliers whose status is Red.
   */
  countRows?: { tableField: string; column: string; equals: string }
  source: FieldSource
  validatedBy: PersonaId | null
  showOnDashboard: boolean
  kpiRole?: KpiRole
  /** Admin choice: also show this field as a column in the Workspace part list. Absent = off. */
  showInPartList?: boolean
  /** Admin choice: also show this field as a column in the dashboard drill-down "View parts" list. Absent = off. */
  showInDrillList?: boolean
  conditionalRules?: ConditionalRule[]
}

export type ValidationState = 'Draft' | 'Submitted' | 'Sent back' | 'Approved'

export interface ApprovalStep {
  stepIndex: number
  role: PersonaId
  label: string
  allowedOutcomes: ('Approve' | 'Edit' | 'Send back' | 'Submit')[]
}

export interface ApprovalFlow {
  steps: ApprovalStep[]
}

/**
 * A validation rule configured in the Builder: the sum of some numbers must equal / not exceed / reach the sum of others.
 *  - scope 'fields': operands are number field keys, or `tableKey.columnKey` meaning "total of that column over all rows".
 *  - scope { tableField }: operands are column keys of that table, checked separately for every row.
 * Blank operands count as 0; a rule is skipped while every operand is still blank.
 */
export interface ValidationRule {
  id: string
  scope: 'fields' | { tableField: string }
  left: string[]
  op: '=' | '<=' | '>='
  right: string[]
  /** Optional custom message; otherwise one is generated from the labels and values. */
  message?: string
}

export interface ActivityDefinition {
  id: string // e.g. 'pp-1'
  name: string
  scope: Scope // Applicability scope: NewPart, ECN, Both
  fields: FieldDefinition[]
  /** Sum-matching rules checked on Save / Submit (see ValidationRule). */
  validationRules?: ValidationRule[]
  flow: ApprovalFlow
  ownerPersona: PersonaId
  description?: string
  /** When false, this definition is a draft and should not affect Workspace/Dashboards */
  published?: boolean
  /**
   * Admin-set. When true, a PIC may mark this activity Not applicable for an individual part
   * (a section template applies it to every part in the section by default). Default: false.
   */
  allowNotApplicable?: boolean
  /**
   * Admin-set. When true, the vendor may enter their own planned start/end for a part on this activity.
   * Once set, tracking (planned dates, RYG, overdue) follows the vendor timeline instead of the
   * template's MRD-offset dates. The vendor can update it; prior values are kept for the strikethrough view.
   */
  allowVendorPlannedTimeline?: boolean
  /**
   * Ordered chain of approver roles a deviation on this activity must pass through. Prebuilt activities
   * default to ['PIC','SIC','DPM']. Set in the Builder. Absent = use the default chain.
   */
  deviationFlow?: PersonaId[]
  /**
   * Admin-set. When true, the PIC can mark a vendor submission NG (no-go), which sends it back and counts a new
   * resubmission round. Each round's reason, result and timing is kept on the entry (see ActivityEntry.ngRounds).
   */
  trackNgRounds?: boolean
  /**
   * Admin-set. When true, this activity's form shows a "References" tab listing the same part's NG rounds, deviations
   * and open actions from OTHER activities, so the PIC has that context while working this one.
   */
  canReferenceOtherActivities?: boolean
  /**
   * Super-Admin-designed timeline template: which technical categories the activity applies to, and for each the
   * applicable "MRD − X" day offsets per milestone sub-type. Display/config only — does not drive date tracking yet.
   */
  timelineTemplate?: TimelineTemplateEntry[]
  /**
   * Set when Admin deletes the activity. A retired activity is hidden from the Activity library and cannot be used
   * for anything new (template rows, builder), but existing template rows, entries and dashboards keep working.
   * There is no restore.
   */
  retired?: boolean
  /** ID of the draft copy in the builder store while editing */
  draftId?: string
  /** Governance: the project archetype whose WBS template this activity comes from. */
  archetypeId?: string
  /** Governance: the WBS object (QA type) this activity configures. */
  wbsObjectId?: string
  /** Trial set on the WBS object; used to create the activity's template rows when it is first published. */
  defaultMilestoneId?: string
}

/** Technical category a timeline template applies to (Admin picks these when designing an activity). */
export type TechnicalCategory = 'Engine' | 'Weld' | 'RubberAssy' | 'PlasticAssy' | 'OtherAssy'

/** An MRD sub-type under a milestone (PP/MPP/Pilot). Some only apply to the Weld category. */
export type MrdSubType = 'Kani' | 'Jig' | 'Weld' | 'Engine' | 'Transmission' | 'Assembly' | 'ActualQVDate'

/** One "MRD − X" offset the Admin set for a (milestone, sub-type) pair within a technical category. */
export interface TimelineOffset {
  milestoneId: string // 'PP' | 'MPP' | 'Pilot'
  subType: MrdSubType
  /** Days before the sub-type's MRD the activity should START (positive X in "MRD − X"). Start date = subTypeMRD − minusDays. */
  minusDays: number
  /**
   * Days before the sub-type's MRD the activity should END (positive X in "MRD − X"). End date = subTypeMRD − endMinusDays.
   * Omitted/undefined = 0, i.e. the activity ends on the sub-type MRD.
   */
  endMinusDays?: number
}

/** A technical category this activity applies to, with its MRD − X offsets. */
export interface TimelineTemplateEntry {
  category: TechnicalCategory
  offsets: TimelineOffset[]
}

/** The four standard precedence relationships between two activities. */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

/**
 * One activity-to-activity dependency within a technical category: activity `fromId` must relate to
 * `toId` by `type` (Finish-to-Start etc.) with an optional lag in days. Defined by the Admin /
 * Project Manager in the Activity Dependencies module.
 */
export interface ActivityDependency {
  id: string
  category: TechnicalCategory
  /** The dependent (successor) activity id. */
  fromId: string
  /** The predecessor activity id it depends on. */
  toId: string
  type: DependencyType
  /** Lag in days (can be 0). */
  lagDays: number
}

// ── Governance: project archetypes and their WBS templates ────────────────────

/** Kind of WBS object. Only QA objects become activities in the Activity Builder; the rest stay WBS-only. */
export type WbsObjectType = 'General' | 'QA' | 'VCF' | 'RiskSphere' | 'ImportJira' | 'EAReview'

/** One QA checklist item on a QA WBS object. Each becomes a Yes/No field on the object's activity. */
export interface WbsChecklistItem {
  id: string
  label: string
  mandatory: boolean
}

/** A WBS object's dependency on another object of the same archetype (the predecessor). */
export interface WbsDependency {
  /** The predecessor WBS object id. */
  onObjectId: string
  type: DependencyType
  lagDays: number
}

/** One row of an archetype's WBS template. */
export interface WbsObject {
  id: string
  name: string
  type: WbsObjectType
  /** Trial (milestone id, e.g. 'PP') — set for QA objects; becomes the activity's default milestone. */
  trial?: string
  dependency?: WbsDependency
  /** QA objects: checklist items (Mandatory / Non-mandatory). */
  checklist?: WbsChecklistItem[]
  /** QA objects: "QA ownership to be with Release Manager". */
  qaOwnershipReleaseManager?: boolean
  /** The ActivityDefinition this QA object is configured as (set when the archetype is saved). */
  activityId?: string
}

/** Admin-defined project archetype: a reusable WBS template. Models (projects) are associated to one. */
export interface ProjectArchetype {
  id: string // e.g. 'ARC-001'
  name: string
  description: string
  active: boolean
  wbs: WbsObject[]
}

/**
 * A builder draft: mirrors ActivityDefinition but is stored separately
 * and only promoted to the main activities store on publish.
 */
export interface BuilderDraft extends ActivityDefinition {
  /** The id of the published activity this draft is editing, or null for new */
  sourceId: string | null
}

/** Mock attribute catalogue entry for fetched fields */
export interface AttributeCatalogueEntry {
  system: FieldSource
  key: string
  label: string
  type: FieldType
  /** Pick-list values for a `dropdown` attribute. */
  options?: string[]
}

/** A milestone whose MRD date is entered per model (e.g. PP, MPP, Pilot, SOP, Jig...). */
export interface MilestoneDef {
  id: string // e.g. 'PP'
  label: string
  /** Mandatory milestones must have an MRD on every model and cannot be removed. */
  mandatory: boolean
}

/** A QA section that owns parts and a template (e.g. NP1..NP6). */
export interface Section {
  id: string // e.g. 'NP1'
  label: string
}

/** A vehicle model with its milestone MRD dates. */
export interface ModelRecord {
  name: string // unique; matches PartRecord.model
  /** Governance: the project archetype this model (project) follows. */
  archetypeId?: string
  /**
   * MRD dates keyed by milestone or milestone sub-type -> YYYY-MM-DD. A missing key = blank ("Awaiting MRD").
   * Top-level milestone dates use the plain milestone id (e.g. 'PP'). Sub-type MRD dates (Model Coordinator
   * screen) use the composite key '<milestoneId>:<subType>', e.g. 'PP:Weld', 'MPP:Engine', 'Pilot:ActualQVDate'.
   */
  mrds: Record<string, string>
}

/**
 * Section Admin template row: apply an Admin-defined activity to a section
 * under a milestone, with start/end as calendar-day offsets from the model's MRD.
 * Resolved start = MRD + startOffset, end = MRD + endOffset (negative = before MRD).
 */
export interface TemplateRow {
  /** See makeTemplateRowId / makeTimelineRowId, e.g. 'tpl-NP1-pp-1-PP' or 'tpl-NP1-pp-11-PP-Weld' */
  id: string
  section: string // Section.id
  activityId: string // ActivityDefinition.id
  milestoneId: string // MilestoneDef.id
  /**
   * For activities with a timeline template, the milestone sub-type this row tracks (e.g. 'Weld'). The row's planned
   * dates then come from the model's '<milestoneId>:<subType>' MRD. Absent for ordinary (non-sub-type) rows.
   */
  subType?: MrdSubType
  startOffset: number
  endOffset: number
}

/** Result of resolving a template row for a part's model. */
export type ResolvedDates =
  | { status: 'resolved'; start: string; end: string; source?: TimelineSource } // YYYY-MM-DD
  | { status: 'awaitingMrd'; milestoneId: string }

/** Where a resolved planned timeline came from: the section template (MRD + offsets) or a vendor override. */
export type TimelineSource = 'template' | 'vendor'

/** One version of a vendor-set planned timeline. Kept in history so updates can show as a strikethrough. */
export interface VendorTimelineVersion {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  /** Named person who set it (the vendor), else the role. */
  setBy: string
  setByRole: PersonaId
  at: string // ISO date-time
  comment?: string
}

/**
 * A vendor-supplied planned timeline for one activity entry. When present and the activity allows it,
 * tracking (planned dates, RYG, overdue) uses `current` instead of the template (MRD-offset) dates.
 * `history` holds every superseded version, newest last, each with its own metadata, so the UI can
 * show the old dates struck through with who/when.
 */
export interface VendorTimeline {
  current: VendorTimelineVersion
  history: VendorTimelineVersion[]
}

/** Build the canonical template row id: `tpl-<section>-<activityId>-<milestoneId>`. */
export const makeTemplateRowId = (section: string, activityId: string, milestoneId: string): string =>
  `tpl-${section}-${activityId}-${milestoneId}`

/** Build a sub-type-qualified template row id: `tpl-<section>-<activityId>-<milestoneId>-<subType>`. */
export const makeTimelineRowId = (section: string, activityId: string, milestoneId: string, subType: MrdSubType): string =>
  `tpl-${section}-${activityId}-${milestoneId}-${subType}`

/** Build the canonical entry id: `entry-<templateRowId>-<partNo>`. */
export const makeEntryId = (templateRowId: string, partNo: string): string =>
  `entry-${templateRowId}-${partNo}`

export interface PartRecord {
  partNo: string
  partName: string
  model: string // ModelRecord.name
  vendorCode: string
  vendorName: string
  department: string
  /** Technical category (Engine / Weld / Rubber Assy / Plastic Assy / Other Assy). Used by Lessons Learnt heat maps. */
  technicalCategory?: TechnicalCategory
  section: string // Section.id
  /** PIC name as ingested from SAP. Empty string = SAP has no PIC for this part (see PicAssignment). */
  pic: string
  type: 'NewPart' | 'ECN' // New Part vs ECN case
  /**
   * Where the part number came from. 'SAP' = ingested from the simulated SAP/ENOVIA master (default).
   * 'Manual' = a dummy/placeholder part added by the Department Co-ordinator, a PIC or Admin because SAP had no number yet.
   */
  origin?: 'SAP' | 'ENOVIA' | 'Manual'
  /**
   * Set after an ECN transfer: this (old) part has been superseded by the part number named here.
   * A superseded part is read-only and dropped from all tracking views; only the new part is tracked.
   */
  supersededBy?: string
  /** Set on the new part after an ECN transfer: the old part number whose history it inherited. */
  supersedes?: string
  /**
   * Further intake attributes (Model Variant, Fuel Type, Plant, Color…), keyed as in mock/partIntakeFields.ts.
   * The core fields above (part no, name, model, vendor, department, section, PIC) are not repeated here.
   */
  attrs?: Record<string, string>
  /** Role that created a manual/placeholder part. */
  createdBy?: PersonaId
  /** ISO date-time a manual/placeholder part was created. */
  createdAt?: string
}

/**
 * A PIC's decision to release a part to the vendor. Until a part has a release record, the vendor does
 * not see any of its activities in their queue; the PIC can still review and do their own work on it.
 * Append-only: the latest record for a part wins, so a part can be released and (later) recalled.
 */
export interface PartRelease {
  id: string
  partNo: string
  /** true = released to vendor, false = recalled (hidden from the vendor again). */
  released: boolean
  by: string // named person (the PIC) or role
  byRole: PersonaId
  at: string // ISO date-time
  comment?: string
}

/** The vendor's response to a released part. */
export type VendorAckStatus = 'Acknowledged' | 'Returned'
/**
 * The vendor's acknowledgement (or return) of a part the PIC released. Append-only like PartRelease: a response
 * only counts if it is newer than the latest release record, so a fresh release re-opens the question.
 * A Returned part goes back to the PIC (with the vendor's reason) and is not worked on until released again.
 */
export interface PartAck {
  id: string
  partNo: string
  status: VendorAckStatus
  by: string // vendor name or role
  byRole: PersonaId
  at: string // ISO date-time
  /** Required when status is 'Returned'. */
  reason?: string
}
/**
 * Where a part is in the release handshake.
 * Pending = not released (or recalled); Released = with the vendor, awaiting acknowledgement;
 * Acknowledged = vendor accepted it and can work; Returned = vendor sent it back to the PIC.
 */
export type ReleaseState = 'Pending' | 'Released' | 'Acknowledged' | 'Returned'
/** Standard reasons a vendor can give when an activity is late. Shared by the pop-up and the PIC review. */
export const DELAY_REASON_CATEGORIES = [
  'Drawing or design change (ECN)',
  'MSIL input pending (approval, drawing, go-ahead)',
  'Tool or process not ready',
  'Material or sub-supplier (Tier-2) delay',
  'Capacity or manpower constraint',
  'Testing or lab delay',
  'Vendor internal delay',
  'Others'
] as const
/** The category that needs a written remark. */
export const DELAY_REASON_OTHERS = 'Others'
export type DelayReasonStatus = 'Submitted' | 'Accepted' | 'SentBack'
/**
 * The vendor’s reason for a delay on one activity of one part. Submitted by the vendor, then accepted by the PIC or
 * sent back with a comment. A send-back means the vendor must give a new reason (a new record); the latest record for
 * an entry decides where it stands.
 */
export interface DelayReason {
  id: string
  /** Entry id: `entry-<templateRowId>-<partNo>`. */
  entryId: string
  rowId: string
  partNo: string
  activityId: string
  category: string
  remark?: string
  /** The date the vendor now expects to finish. */
  revisedDate?: string
  by: string
  byRole: PersonaId
  at: string // ISO date-time
  /** Planned end date the activity was late against when the reason was given. */
  plannedEnd: string
  status: DelayReasonStatus
  decidedBy?: string
  decidedAt?: string
  decisionComment?: string
}
/**
 * Audit trail for a part-number event (manual creation or ECN transfer), surfaced in the Audit report.
 * Entry-level work history still lives on each ActivityEntry.history; this records part-identity changes.
 */
export interface PartEvent {
  id: string
  /** 'Created' = a dummy/placeholder part was added; 'Transferred' = history moved from an old part to a new one. */
  kind: 'Created' | 'Transferred'
  partNo: string // the subject part (new part for a transfer, the created part for a creation)
  fromPartNo?: string // old part number, for a transfer
  /** Number of activity entries carried over, for a transfer. */
  entriesMoved?: number
  by: string // named person (PIC) or role
  byRole: PersonaId
  at: string // ISO date-time
  reason?: string
}

export interface FieldValue {
  value: any
  status: 'Approve' | 'Edit' | 'Send back' | 'Pending'
  comment?: string
  lastFetched?: string // ISO date-time
}

/**
 * A PIC assigned to a part by SIC/Admin, overriding the SAP value from `effectiveFrom` onwards.
 * The latest assignment in force on a date wins, so a later one replaces an earlier one from its own date forward.
 */
export interface PicAssignment {
  id: string
  partNo: string
  pic: string // person name
  effectiveFrom: string // YYYY-MM-DD
  reason?: string
  assignedBy: PersonaId
  assignedAt: string // ISO date-time
}

export interface HistoryLog {
  timestamp: string // ISO date-time
  persona: PersonaId | 'System'
  /** Named person behind a PIC action, stamped when it happened (the part's PIC on that date). */
  actorName?: string
  action: string // e.g., 'Submitted', 'Sent back', 'Approved', 'Edited field X'
  comment?: string
}

/** A vendor's location, used by manpower planning to group vendors a PIC can cover in one trip. */
export interface VendorInfo {
  vendorName: string
  /** City / industrial area the vendor sits in (e.g. "Manesar", "Pune"). */
  location: string
}

/** A planned or logged PIC visit to a vendor, used for manpower planning and opportunistic coverage. */
export interface VendorVisit {
  id: string
  pic: string // the visiting PIC (person name)
  vendorName: string
  date: string // YYYY-MM-DD
  purpose?: string
  status: 'Planned' | 'Done' | 'Cancelled'
  createdBy: PersonaId
  createdAt: string // ISO date-time
}

/** Status of an action / recommendation raised on an activity for a part. */
export type ActionStatus = 'Open' | 'In progress' | 'Done'

/** One version of an action's target date, kept so a changed timeline can be shown struck through. */
export interface ActionTargetVersion {
  targetDate: string // YYYY-MM-DD
  setBy: string
  setByRole: PersonaId
  at: string // ISO date-time
}

/** A log line in an action's own trail (raised, reassigned, status change, date change, comment). */
export interface ActionLog {
  at: string // ISO date-time
  by: string // named person or role
  byRole: PersonaId
  action: string
  comment?: string
}

/**
 * An action / recommendation on one activity entry (a part x activity). Typically raised by the PIC and
 * assigned to the vendor to carry out. Its `targetDate` is the monitored timeline; `targetHistory` keeps
 * superseded target dates for a strikethrough view. Lives on the ActivityEntry so it travels with transfers.
 */
export interface Action {
  id: string
  title: string
  description?: string
  /** Role the action is assigned to (usually 'Vendor'). */
  assignedTo: PersonaId
  /** Named assignee (e.g. the vendor name), if known. */
  assignedToName?: string
  /** Monitored due date. Absent = no timeline (shown grey). */
  targetDate?: string // YYYY-MM-DD
  targetHistory?: ActionTargetVersion[]
  status: ActionStatus
  createdBy: string
  createdByRole: PersonaId
  createdAt: string // ISO date-time
  completedAt?: string // ISO date-time, set when status becomes Done
  history: ActionLog[]
}

/** Status of a deviation as it moves through its approval chain. */
export type DeviationStatus = 'In progress' | 'Approved' | 'Rejected' | 'Sent back'

/** One step action in a deviation's approval trail. */
export interface DeviationLog {
  at: string // ISO date-time
  by: string // named person or role
  byRole: PersonaId
  action: string // e.g. 'Raised', 'Approved at PIC', 'Rejected at SIC', 'Sent back'
  comment?: string
}

/**
 * A deviation raised against one activity entry (a part x activity). It moves through an ordered chain of
 * approver roles (the activity's deviationFlow; prebuilt activities default to PIC → SIC → DPM). Each role in
 * turn approves (advances), rejects (ends), or sends back (returns to the first step). Lives on the
 * ActivityEntry so it travels with ECN transfers.
 */
export interface Deviation {
  id: string
  title: string
  description?: string
  /** Optional E-Doc reference and a target date for closure. */
  edocNumber?: string
  targetDate?: string // YYYY-MM-DD
  /** Snapshot of the approver role chain at raise time (e.g. ['PIC','SIC','DPM']). */
  flow: PersonaId[]
  /** Index into `flow` of the role whose decision is pending (while In progress). */
  currentStep: number
  status: DeviationStatus
  raisedBy: string
  raisedByRole: PersonaId
  raisedAt: string // ISO date-time
  decidedAt?: string // ISO date-time, set when Approved or Rejected
  history: DeviationLog[]
}

/** Marker on an entry: the PIC declared the activity not applicable to this part. */
export interface NotApplicableMark {
  reason?: string
  /** Named person who marked it (the part's PIC on that date), else the role. */
  by: string
  byRole: PersonaId
  at: string // ISO date-time
}

/**
 * One NG (no-go) round on an entry: the PIC marked a vendor submission as failed and (optionally) gave a target date
 * for the next submission. `round` is 1 for the first NG. `resolvedAt` is set once a later submission is approved.
 */
export interface NgRound {
  round: number
  reason: string
  by: PersonaId
  byName: string
  at: string // ISO date-time the submission was marked NG
  /** PIC's target date for the next (corrected) submission, if given. */
  targetDate?: string
  /** Set when a submission after this NG is approved — i.e. the round was cleared. */
  resolvedAt?: string
}

export interface ActivityEntry {
  id: string // makeEntryId(templateRowId, partNo), e.g. 'entry-tpl-NP1-pp-1-PP-31100-M74LD0'
  templateRowId: string // TemplateRow.id (an activity can repeat under several milestones)
  activityId: string // denormalised: always equals the template row's activityId
  partNo: string
  values: Record<string, any>
  fieldMeta?: Record<string, FieldValue>
  validationState: ValidationState
  /** Present while the part is Not applicable for this template row. Reversing removes it (history keeps the trail). */
  notApplicable?: NotApplicableMark
  /**
   * Vendor-supplied planned timeline (only for activities with allowVendorPlannedTimeline). When set,
   * it overrides the template dates for tracking. `history` keeps superseded versions for the strikethrough view.
   */
  vendorTimeline?: VendorTimeline
  /** Actions / recommendations raised on this activity for the part (often assigned to the vendor). */
  actions?: Action[]
  /** Deviations raised on this activity for the part, each moving through the activity's deviation flow. */
  deviations?: Deviation[]
  /**
   * NG (no-go) resubmission rounds, oldest first (only for activities with trackNgRounds). The PIC adds one when a
   * submission fails; the vendor then resubmits. The count of rounds is how many times the part was marked NG here.
   */
  ngRounds?: NgRound[]
  history: HistoryLog[]
  currentStepIndex: number
  updatedAt: string // ISO string
  updatedBy: PersonaId | 'System'
  /** Dashboard-only shell carrying fed (data-only) values; the part has no real form entry. Never stored. */
  feedOnly?: boolean
}

// Dashboards & Widgets
export type WidgetType =
  | 'kpi'
  | 'donut'
  | 'stackedBar'
  | 'barCategory'
  | 'trend'
  | 'table'
  | 'heatMap'
  | 'gauge'
  | 'chart' // general Admin-configured chart, see ChartProps

export interface Widget {
  id: string
  type: WidgetType
  title: string
  grid: {
    x: number
    y: number
    w: number
    h: number
  }
  props: Record<string, any>
}

/** How a general chart measures each group. 'average' / 'sum' need `measureField` (a number or percent field). */
export type MeasureId = 'count' | 'completionRate' | 'overdue' | 'awaitingValidation' | 'average' | 'sum'

/** How a general chart is drawn. Only the drawing changes; the data is the same. */
export type ChartDisplay = 'bar' | 'stackedBar' | 'donut' | 'table' | 'kpi'

/**
 * Props of a `chart` widget (the Admin's choices). `groupBy` / `splitBy` are dimension ids from the engine's
 * catalogue: a built-in ('status', 'ryg', 'model', 'department', 'vendor', 'section', 'milestone', 'type',
 * 'activity') or `field:<fieldKey>` of the dashboard's activity.
 */
export interface ChartProps {
  measure: MeasureId
  measureField?: string
  groupBy: string
  /** Splits each group into stacked parts; only for count-like measures. */
  splitBy?: string
  display: ChartDisplay
}

export interface DashboardConfig {
  id: string
  activityId: string | 'overview'
  widgets: Widget[]
}

/** What a cross-activity widget plots for each compared activity (each activity×milestone is a series point). */
export type CrossPlot =
  | { kind: 'measure'; measure: 'completionRate' | 'count' | 'overdue' | 'awaitingValidation' | 'approved' }
  | { kind: 'status' } // stacked validation-state breakdown
  | { kind: 'ryg' } // stacked RYG breakdown
  | { kind: 'field'; fieldKey: string } // a shared activity field: categorical → stacked; numeric/percent → average

/** How a cross-activity widget is drawn. */
export type CrossDisplay = 'groupedBar' | 'stackedBar' | 'line' | 'table'

/** One comparison chart on a cross-activity dashboard. */
export interface CrossWidget {
  id: string
  title: string
  plot: CrossPlot
  display: CrossDisplay
}

/**
 * A user-built dashboard that compares several activities for ONE model or ONE part. It behaves like a
 * TEMPLATE: it fixes which activities to compare, whether the scope is a model or a part, and the charts;
 * the specific model/part is picked live from a dropdown on the dashboard and the charts re-populate.
 * Each compared activity (repeated per milestone it appears under) is a series. Persisted in the store.
 */
export interface CrossActivityDashboard {
  id: string
  name: string
  commonality: 'model' | 'part'
  /** Optional default model/part selected when the dashboard opens; the user can change it live. */
  defaultValue?: string
  activityIds: string[]
  widgets: CrossWidget[]
  createdBy: PersonaId
  createdAt: string // ISO date-time
}

export interface GlobalFilters {
  milestone: 'All' | string // MilestoneDef.id
  section: 'All' | string // Section.id
  model: 'All' | string
  vendor: 'All' | string
  type: 'All' | 'NewPart' | 'ECN'
  /**
   * The filters below are optional and set by a dashboard drill-down. Absent or 'All' = no filter.
   * `status`: 'NotStarted' | ValidationState | 'NA' (Not applicable). `ryg`: 'Green' | 'Yellow' | 'Red' | 'Grey' | 'NA'.
   */
  status?: 'All' | string
  ryg?: 'All' | string
  department?: 'All' | string
  activityId?: 'All' | string
  /**
   * Activity fields at one value each (all must match), as the engine's field dimension reads them: the option
   * (`Available`), `Y`/`N`, a month (`2026-10`), a percent band (`<90%`), or `__none__` for empty.
   */
  fields?: { key: string; value: string }[]
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
}

/**
 * A document attached to one part's entry of an activity. Only the details live in the store; the file itself is
 * kept in the browser's IndexedDB (see store/docBlobs.ts), so uploads survive a reload without filling localStorage.
 */
export interface ActivityDocument {
  id: string
  /** makeEntryId(templateRowId, partNo) of the entry it belongs to. */
  entryId: string
  templateRowId: string
  activityId: string
  partNo: string
  name: string
  sizeBytes: number
  mimeType: string
  uploadedBy: PersonaId
  /** Named person: the vendor company for a Vendor, the part's PIC otherwise. */
  uploadedByName: string
  uploadedAt: string // ISO date-time
}

/**
 * A History Transfer request awaiting the SIC's decision. A PIC/Admin raises it; the SIC approves (the transfer then
 * runs) or rejects it. An SIC's own request is applied immediately and never appears here.
 */
export interface HistoryTransferRequest {
  id: string
  fromPartNo: string
  toPartNos: string[]
  /** Template row ids of the activities to transfer (empty = all of the source's). */
  templateRowIds: string[]
  keepSourceActive: boolean
  reason?: string
  requestedBy: PersonaId
  requestedByName: string
  requestedAt: string // ISO date-time
  status: 'Pending' | 'Approved' | 'Rejected'
  decidedBy?: string
  decidedAt?: string
  decisionComment?: string
}

/** One line of the audit log: who did what, when, on which part / activity. Append-only. */
export interface AuditEntry {
  id: string
  at: string // ISO date-time
  persona: PersonaId
  actorName: string
  /** e.g. 'Document uploaded', 'Document deleted', 'Document downloaded', 'Excel template downloaded', 'Excel upload staged' */
  action: string
  partNo?: string
  activityId?: string
  templateRowId?: string
  detail: string
}
