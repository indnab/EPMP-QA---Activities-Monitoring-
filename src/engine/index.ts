import { makeEntryId } from '../domain'
import { subTypeMrdKey, deriveTechnicalCategory } from '../domain/timelineCatalog'
import type {
  PicAssignment,
  PartRelease,
  PartAck,
  ReleaseState,
  VendorInfo,
  Action,
  ActionStatus,
  CrossPlot,
  CrossDisplay,
  ActivityDefinition,
  ActivityEntry,
  PartRecord,
  ValidationState,
  ValidationRule,
  DashboardConfig,
  Widget,
  FieldDefinition,
  GlobalFilters,
  ChartProps,
  MeasureId,
  ModelRecord,
  ResolvedDates,
  TemplateRow
} from '../domain'

/**
 * Parses a YYYY-MM-DD date string safely.
 */
export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number)
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2])
  }
  return new Date(dateStr)
}

/**
 * Formats a Date object to YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Adds or subtracts days from a YYYY-MM-DD string, returning YYYY-MM-DD.
 */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr)
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

/**
 * RYG result. 'Grey' means the instance is awaiting its milestone MRD (no RYG).
 * 'NA' means the PIC marked the activity Not applicable for the part (set by getFilteredData, not calculateRYG).
 */
export type RygResult = 'Green' | 'Yellow' | 'Red' | 'Grey' | 'NA'

/**
 * Returns the MRD date (YYYY-MM-DD) of a milestone for a model, or undefined when the
 * model is unknown or the MRD is blank.
 */
export function getMilestoneMrd(model: ModelRecord | undefined, milestoneId: string): string | undefined {
  const mrd = model?.mrds[milestoneId]
  return mrd ? mrd : undefined
}

/**
 * When the activity carries a timeline template (Admin set MRD−X offsets per technical category and sub-type),
 * the part's technical category selects the entry, and the row's milestone picks a sub-type offset. Planned dates
 * then come from that SUB-TYPE's MRD on the model (e.g. 'PP:Weld'), not the plain milestone MRD.
 *
 * Returns null when the activity has no timeline template, no matching category/milestone offset, or the picked
 * sub-type has no MRD on the model — in which case the caller falls back to the plain milestone MRD + row offsets.
 */
function resolveFromTimelineTemplate(
  row: TemplateRow,
  model: ModelRecord | undefined,
  activity: ActivityDefinition | undefined,
  part: PartRecord | undefined
): ResolvedDates | null {
  const template = activity?.timelineTemplate
  if (!template || template.length === 0 || !part) return null
  const category = part.technicalCategory ?? deriveTechnicalCategory(part)
  const entry = template.find((t) => t.category === category)
  if (!entry) return null
  // The row carries its sub-type (one row per milestone × sub-type). Match that exact offset; fall back to the
  // first offset for the milestone for legacy rows that have no sub-type.
  const offset = row.subType
    ? entry.offsets.find((o) => o.milestoneId === row.milestoneId && o.subType === row.subType)
    : entry.offsets.find((o) => o.milestoneId === row.milestoneId)
  if (!offset) return null
  const mrd = getMilestoneMrd(model, subTypeMrdKey(offset.milestoneId, offset.subType))
  if (!mrd) return { status: 'awaitingMrd', milestoneId: `${offset.milestoneId}:${offset.subType}` }
  const endMinus = offset.endMinusDays ?? 0
  return {
    status: 'resolved',
    start: addDays(mrd, -offset.minusDays),
    end: addDays(mrd, -endMinus),
    source: 'template'
  }
}

/**
 * Resolves a template row's planned start/end for a part's model.
 *  - If the activity has a timeline template (per technical category + milestone sub-type), dates come from the
 *    matching SUB-TYPE's MRD (MRD − startX / MRD − endX). Pass `activity` and `part` to use it.
 *  - Otherwise start = milestone MRD + startOffset, end = milestone MRD + endOffset.
 * A blank/missing MRD yields `awaitingMrd`.
 */
export function resolveInstanceDates(
  row: TemplateRow,
  model: ModelRecord | undefined,
  activity?: ActivityDefinition,
  part?: PartRecord
): ResolvedDates {
  const fromTemplate = resolveFromTimelineTemplate(row, model, activity, part)
  if (fromTemplate) return fromTemplate
  const mrd = getMilestoneMrd(model, row.milestoneId)
  if (!mrd) {
    return { status: 'awaitingMrd', milestoneId: row.milestoneId }
  }
  return {
    status: 'resolved',
    start: addDays(mrd, row.startOffset),
    end: addDays(mrd, row.endOffset),
    source: 'template'
  }
}

/**
 * The planned timeline used for tracking. When the entry carries a vendor timeline (and, by construction,
 * the activity allows it) that overrides the template dates; otherwise the template (MRD-offset) dates apply.
 * The returned `source` tells the UI which one is in force.
 */
export function resolveTrackedDates(
  row: TemplateRow,
  model: ModelRecord | undefined,
  entry: ActivityEntry | undefined,
  activity?: ActivityDefinition,
  part?: PartRecord
): ResolvedDates {
  const vt = entry?.vendorTimeline?.current
  if (vt && vt.start && vt.end) {
    return { status: 'resolved', start: vt.start, end: vt.end, source: 'vendor' }
  }
  return resolveInstanceDates(row, model, activity, part)
}

/**
 * Calculates the RYG (Red-Yellow-Green) status for an activity instance.
 * - If the dates are awaiting an MRD, return 'Grey' (takes precedence over everything).
 * - If validationState is 'Approved', return 'Green'.
 * - If current date is after the resolved end, return 'Red'.
 * - If current date is within 7 days before the resolved end, return 'Yellow'.
 * - Otherwise, return 'Green'.
 *
 * @param dates The instance's resolved dates (see resolveInstanceDates)
 * @param validationState The current entry validation state
 * @param currentDate Optional custom date for testing/evaluation (defaults to current system date)
 */
export function calculateRYG(
  dates: ResolvedDates,
  validationState: ValidationState,
  currentDate?: string
): Exclude<RygResult, 'NA'> {
  if (dates.status === 'awaitingMrd') {
    return 'Grey'
  }

  if (validationState === 'Approved') {
    return 'Green'
  }

  const end = parseDate(dates.end)
  const now = currentDate ? parseDate(currentDate) : new Date()

  // Strip hours for pure date comparison
  const endPure = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const nowPure = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const diffTime = endPure.getTime() - nowPure.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return 'Red'
  } else if (diffDays <= 7) {
    return 'Yellow'
  } else {
    return 'Green'
  }
}

/**
 * Rows of a derived table: take the incoming (derived) rows and keep whatever the people filling the form have
 * already entered in the other columns of the same row (matched on `keyColumn`). Rows that are no longer derived drop out.
 */
export function mergeDerivedRows(
  existing: Record<string, any>[] | undefined,
  incoming: Record<string, any>[],
  keyColumn: string | string[] = 'code'
): Record<string, any>[] {
  const old = Array.isArray(existing) ? existing : []
  const keys = Array.isArray(keyColumn) ? keyColumn : [keyColumn]
  const same = (a: Record<string, any>, b: Record<string, any>) => keys.every((k) => String(a?.[k] ?? '') === String(b?.[k] ?? ''))
  return incoming.map((row) => {
    const prev = old.find((o) => same(o, row))
    return { ...(prev ?? {}), ...row }
  })
}
/**
 * Rows for a `count`-derived table: each source row contributes `countColumn` rows numbered 1..n, labelled with its
 * `labelColumn` text, written to `targetLabelColumn`, plus a nested serial `_sl` (source row 2, point 3 → "2.3"). Counts are capped at 50 to keep a typo from flooding the form.
 */
export function rowsFromCount(
  sourceRows: unknown,
  d: { countColumn: string; labelColumn: string; targetLabelColumn: string }
): Record<string, any>[] {
  const rows: Record<string, any>[] = Array.isArray(sourceRows) ? sourceRows : []
  const out: Record<string, any>[] = []
  rows.forEach((r, ri) => {
    const n = Math.min(50, Math.max(0, Math.floor(Number(r?.[d.countColumn]) || 0)))
    const label = String(r?.[d.labelColumn] ?? '').trim() || `Category ${ri + 1}`
    for (let p = 1; p <= n; p++) out.push({ [d.targetLabelColumn]: label, _sl: `${ri + 1}.${p}` })
  })
  return out
}
/** The rows an `activity`-derived table should show, taken from the source activity's table values. */
export function rowsFromActivityTable(
  sourceRows: unknown,
  where: { column: string; equals: string },
  columnKeys: string[]
): Record<string, any>[] {
  const rows: Record<string, any>[] = Array.isArray(sourceRows) ? sourceRows : []
  return rows
    .filter((r) => r?.[where.column] === where.equals)
    .map((r) => Object.fromEntries(columnKeys.filter((k) => k in r).map((k) => [k, r[k]])))
}
/** One broken validation rule (for a table-row rule, `rowLabel` is the row's Sl. number). */
export interface RuleViolation {
  ruleId: string
  message: string
  rowLabel?: string
}
const isBlank = (v: unknown) => v === undefined || v === null || v === ''
const num = (v: unknown) => (isBlank(v) ? 0 : Number(v) || 0)
const OP_TEXT: Record<ValidationRule['op'], string> = { '=': 'must equal', '<=': 'must not be more than', '>=': 'must be at least' }
const fmtNum = (n: number) => String(Math.round(n * 1e6) / 1e6)
function holds(op: ValidationRule['op'], l: number, r: number): boolean {
  const eps = 1e-9
  return op === '=' ? Math.abs(l - r) < eps : op === '<=' ? l <= r + eps : l >= r - eps
}
/**
 * Checks the activity's sum-matching validation rules against the entered values. Rules that reference a hidden
 * field are skipped, as are rules (or table rows) whose operands are all still blank.
 */
export function evaluateValidationRules(
  def: Pick<ActivityDefinition, 'fields' | 'validationRules'>,
  values: Record<string, any>,
  visibility?: Record<string, { visible: boolean }>
): RuleViolation[] {
  const out: RuleViolation[] = []
  const labelOf = (key: string): string => {
    const [fk, col] = key.split('.')
    const f = def.fields.find((x) => x.key === fk)
    if (!col) return f?.label ?? fk
    return `${f?.columns?.find((c) => c.key === col)?.label ?? col}`
  }
  for (const rule of def.validationRules ?? []) {
    if (rule.left.length === 0 || rule.right.length === 0) continue
    const sentence = (lv: number, rv: number, cols?: (k: string) => string) =>
      rule.message ||
      `${rule.left.map(cols ?? labelOf).join(' + ')} (${fmtNum(lv)}) ${OP_TEXT[rule.op]} ${rule.right.map(cols ?? labelOf).join(' + ')} (${fmtNum(rv)})`
    if (rule.scope === 'fields') {
      const keys = [...rule.left, ...rule.right]
      if (keys.some((k) => visibility?.[k.split('.')[0]]?.visible === false)) continue
      const raw = (k: string): { v: number; blank: boolean } => {
        const [fk, col] = k.split('.')
        if (!col) return { v: num(values[fk]), blank: isBlank(values[fk]) }
        const rows: Record<string, any>[] = Array.isArray(values[fk]) ? values[fk] : []
        return { v: rows.reduce((t, r) => t + num(r?.[col]), 0), blank: rows.every((r) => isBlank(r?.[col])) }
      }
      const l = rule.left.map(raw)
      const r = rule.right.map(raw)
      if ([...l, ...r].every((x) => x.blank)) continue
      const lv = l.reduce((t, x) => t + x.v, 0)
      const rv = r.reduce((t, x) => t + x.v, 0)
      if (!holds(rule.op, lv, rv)) out.push({ ruleId: rule.id, message: sentence(lv, rv) })
    } else {
      const tableKey = rule.scope.tableField
      if (visibility?.[tableKey]?.visible === false) continue
      const table = def.fields.find((f) => f.key === tableKey)
      const colLabel = (k: string) => table?.columns?.find((c) => c.key === k)?.label ?? k
      const rows: Record<string, any>[] = Array.isArray(values[tableKey]) ? values[tableKey] : []
      rows.forEach((row, i) => {
        const keys = [...rule.left, ...rule.right]
        if (keys.every((k) => isBlank(row?.[k]))) return
        const lv = rule.left.reduce((t, k) => t + num(row?.[k]), 0)
        const rv = rule.right.reduce((t, k) => t + num(row?.[k]), 0)
        if (!holds(rule.op, lv, rv)) {
          out.push({ ruleId: rule.id, rowLabel: String(row?._sl ?? i + 1), message: sentence(lv, rv, colLabel) })
        }
      })
    }
  }
  return out
}
/**
 * Evaluates conditional mandatory and visibility rules for fields based on current entry values.
 */
export function evaluateConditionalRules(
  fields: FieldDefinition[],
  values: Record<string, any>
): Record<string, { visible: boolean; mandatory: boolean }> {
  const result: Record<string, { visible: boolean; mandatory: boolean }> = {}

  // Initialize with field defaults
  for (const field of fields) {
    result[field.key] = {
      visible: true,
      mandatory: field.mandatory,
    }
  }

  // Process conditional rules
  for (const field of fields) {
    if (!field.conditionalRules || field.conditionalRules.length === 0) {
      continue
    }

    for (const rule of field.conditionalRules) {
      const depVal = values[rule.dependsOn]
      let isMatch = false

      // Safely check if value is empty/undefined
      const depValStr = depVal === undefined || depVal === null ? '' : String(depVal)

      switch (rule.operator) {
        case 'equals':
          isMatch = depValStr === String(rule.value)
          break
        case 'notEquals':
          isMatch = depValStr !== String(rule.value)
          break
        case 'greaterThan':
          isMatch = Number(depVal) > Number(rule.value)
          break
        case 'lessThan':
          isMatch = Number(depVal) < Number(rule.value)
          break
        case 'contains':
          if (Array.isArray(depVal)) {
            isMatch = depVal.includes(rule.value)
          } else {
            isMatch = depValStr.includes(String(rule.value))
          }
          break
      }

      if (isMatch) {
        if (rule.action === 'show') {
          result[field.key].visible = true
        } else if (rule.action === 'hide') {
          result[field.key].visible = false
        } else if (rule.action === 'makeMandatory') {
          result[field.key].mandatory = true
        } else if (rule.action === 'makeOptional') {
          result[field.key].mandatory = false
        }
      } else {
        // If the matching condition is not met, revert behavior or use default
        if (rule.action === 'show') {
          result[field.key].visible = false
        } else if (rule.action === 'makeMandatory') {
          result[field.key].mandatory = field.mandatory
        }
      }
    }
  }

  // SOP Readiness (#12) specific rule: any "Pending" or "NG" fields make remarks and target date mandatory.
  const isSopReadinessPendingOrNg =
    values['ppvt'] === 'Pending' ||
    values['tool_readiness'] === 'N' ||
    values['line_readiness'] === 'Pending' ||
    values['tier2_parts'] === 'NG' ||
    values['tier2_capacity'] === 'NG' ||
    values['tier2_ifm'] === 'NG' ||
    values['ecn_implementation'] === 'Pending' ||
    values['pre_ecn_disposal'] === 'Pending' ||
    values['packing'] === 'N' ||
    values['ifm_station'] === 'N' ||
    values['spare_kit'] === 'N' ||
    values['set_part_drawing'] === 'N'

  if (isSopReadinessPendingOrNg) {
    if (result['remarks']) {
      result['remarks'].mandatory = true
      result['remarks'].visible = true
    }
    if (result['target_date']) {
      result['target_date'].mandatory = true
      result['target_date'].visible = true
    }
  }

  return result
}

/**
 * Evaluates pure calculated/derived fields.
 *
 * @param milestoneMrd The MRD (YYYY-MM-DD) of the instance's milestone for the part's model,
 *   or undefined when blank. MRD-derived fields (target_date_msil, planned_start_system,
 *   planned_finish_system, otop_target_date, actual_date_beyond_mrd) are cleared while the
 *   MRD is blank; otop_delay_cases is then calculated from the actual date only.
 */
export function evaluateCalculatedFields(
  def: ActivityDefinition,
  values: Record<string, any>,
  part: PartRecord,
  milestoneMrd: string | undefined,
  _currentDate?: string
): Record<string, any> {
  const updatedValues = { ...values }

  /** Sets key to MRD + offset days, or removes it while the MRD is blank. */
  const setFromMrd = (key: string, offset: number) => {
    if (milestoneMrd) {
      updatedValues[key] = addDays(milestoneMrd, offset)
    } else {
      delete updatedValues[key]
    }
  }

  for (const field of def.fields) {
    if (field.source !== 'calculated') continue

    const key = field.key
    // Count of table rows matching a value. Data-only counts are fed per part (see overlayFeed), not recomputed here.
    if (field.countRows && !field.dataOnly) {
      const c = field.countRows
      const rows: Record<string, any>[] = Array.isArray(updatedValues[c.tableField]) ? updatedValues[c.tableField] : []
      updatedValues[key] = rows.filter((r) => String(r?.[c.column] ?? '') === c.equals).length
      continue
    }

    // PP #1: Target date – MSIL drawing (Date as per MRD)
    if (def.id === 'pp-1' && key === 'target_date_msil_drawing') {
      setFromMrd(key, 0)
    }

    // PP #2: "Spec meeting not applicable" when Tech and Process meeting status are both N;
    // "Data update pending" when both are blank.
    if (def.id === 'pp-2' && (key === 'spec_meeting_not_applicable' || key === 'data_update_pending')) {
      const tech = updatedValues['tech_meeting_status'] ?? ''
      const proc = updatedValues['process_meeting'] ?? ''
      updatedValues[key] = key === 'spec_meeting_not_applicable' ? tech === 'N' && proc === 'N' : tech === '' && proc === ''
    }
    // PP #10: Accuracy % = OK parameters ÷ total parameters × 100, one decimal.
    if (def.id === 'pp-10' && key === 'accuracy') {
      const total = Number(updatedValues['total_parameters'])
      const ok = Number(updatedValues['ok_parameters'])
      if (total > 0 && Number.isFinite(ok) && updatedValues['ok_parameters'] !== '' && updatedValues['ok_parameters'] != null) {
        updatedValues[key] = Math.round((ok / total) * 1000) / 10
      } else {
        delete updatedValues[key]
      }
    }
    // PP #11: a correction timeline later than the MRD is flagged.
    if (def.id === 'pp-11' && key === 'correction_beyond_mrd') {
      const rows: any[] = Array.isArray(updatedValues['ng_rows']) ? updatedValues['ng_rows'] : []
      updatedValues[key] = !!milestoneMrd && rows.some((r) => r?.date && r.date > milestoneMrd)
    }
    // MPP #1: OTOP status (OTOP once the vendor has an actual end date) and actual-date-beyond-MRD flag.
    // Planned/actual dates are vendor-entered in the client spreadsheet, so only the derived fields compute here.
    if (def.id === 'mpp-1') {
      const actual = updatedValues['otop_actual_end_date']
      if (key === 'otop_status') {
        updatedValues[key] = actual ? 'OTOP' : 'Non-OTOP'
      } else if (key === 'actual_date_beyond_mrd') {
        updatedValues[key] = actual && milestoneMrd && actual > milestoneMrd ? 'Y' : 'N'
      }
    }

    // PP OT status: Tool Trial Status is "Done" once the Tool Trial Actual Date is filled, otherwise "Pending".
    if (def.id === 'pp-9' && key === 'tool_trial_status') {
      updatedValues[key] = updatedValues['tool_trial_actual_date'] ? 'Done' : 'Pending'
    }
    // Pilot/SOP #15: Applicability – A / AR / A/AR / F
    if (def.id === 'pilot-15' && key === 'applicability_a_ar_a_ar_f') {
      const isApplicableCat = ['A', 'AR', 'A/AR', 'F'].includes(part.department || '')
      updatedValues[key] = isApplicableCat ? 'Y' : 'N'
    }
  }

  return updatedValues
}

/**
 * RYG for an action's monitored timeline: Green when Done; Grey when no target date; Red when the target
 * is past and it isn't Done; Yellow when due within 7 days; otherwise Green. Mirrors calculateRYG's bands.
 */
export function actionRyg(
  action: { status: ActionStatus; targetDate?: string },
  currentDate: string = '2026-10-15'
): RygResult {
  if (action.status === 'Done') return 'Green'
  if (!action.targetDate) return 'Grey'
  const end = parseDate(action.targetDate)
  const now = parseDate(currentDate)
  const endPure = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const nowPure = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.ceil((endPure.getTime() - nowPure.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Red'
  if (diffDays <= 7) return 'Yellow'
  return 'Green'
}

/** Rollup of an entry's actions for badges: totals, open/done counts and how many are overdue. */
export function summarizeActions(
  actions: Action[] | undefined,
  currentDate: string = '2026-10-15'
): { total: number; open: number; done: number; overdue: number } {
  const list = actions ?? []
  let open = 0
  let done = 0
  let overdue = 0
  for (const a of list) {
    if (a.status === 'Done') done++
    else open++
    if (actionRyg(a, currentDate) === 'Red') overdue++
  }
  return { total: list.length, open, done, overdue }
}

/**
 * Whether a part has been released to the vendor. A part with no release record is unreleased.
 * The latest record for the part wins, so a release can be recalled later.
 */
export function isReleasedToVendor(partNo: string, releases: PartRelease[]): boolean {
  let best: PartRelease | undefined
  for (const r of releases) {
    if (r.partNo !== partNo) continue
    if (!best || r.at > best.at) best = r
  }
  return best ? best.released : false
}

/**
 * Release handshake state of a part. The latest release record decides whether the part is with the vendor; a
 * vendor response (acknowledge / return) counts only if it is newer than that release.
 */
export function getReleaseState(partNo: string, releases: PartRelease[], acks: PartAck[]): ReleaseState {
  let rel: PartRelease | undefined
  for (const r of releases) {
    if (r.partNo !== partNo) continue
    if (!rel || r.at > rel.at) rel = r
  }
  if (!rel || !rel.released) return 'Pending'
  let ack: PartAck | undefined
  for (const a of acks) {
    if (a.partNo !== partNo || a.at <= rel.at) continue
    if (!ack || a.at > ack.at) ack = a
  }
  return ack ? ack.status : 'Released'
}
/** The vendor can work on a part only after acknowledging it. */
export function isWorkableByVendor(partNo: string, releases: PartRelease[], acks: PartAck[]): boolean {
  return getReleaseState(partNo, releases, acks) === 'Acknowledged'
}
/** The latest return (reason + when) for a part that is currently in the Returned state. */
export function latestReturn(partNo: string, acks: PartAck[]): PartAck | undefined {
  let best: PartAck | undefined
  for (const a of acks) if (a.partNo === partNo && a.status === 'Returned' && (!best || a.at > best.at)) best = a
  return best
}
/** The PIC in force for a part on a date. `name` is empty when nobody is assigned. */
export interface EffectivePic {
  name: string
  source: 'SAP' | 'Assigned'
  assignment?: PicAssignment
}

/**
 * Returns the PIC in force for a part on `date` (YYYY-MM-DD): the latest assignment with
 * effectiveFrom <= date (ties broken by assignedAt), otherwise the SAP PIC on the part.
 */
export function getPicOn(part: PartRecord, assignments: PicAssignment[], date: string): EffectivePic {
  let best: PicAssignment | undefined
  for (const a of assignments) {
    if (a.partNo !== part.partNo || a.effectiveFrom > date) continue
    if (
      !best ||
      a.effectiveFrom > best.effectiveFrom ||
      (a.effectiveFrom === best.effectiveFrom && a.assignedAt > best.assignedAt)
    ) {
      best = a
    }
  }
  return best ? { name: best.pic, source: 'Assigned', assignment: best } : { name: part.pic, source: 'SAP' }
}

/** One line of the "who did what" report: a history log resolved to a named person. */
export interface ActivityLogLine {
  timestamp: string
  partNo: string
  partName: string
  section: string
  /** Vendor the part belongs to (from the part master). */
  vendorName: string
  vendorCode: string
  templateRowId: string
  activityName: string
  milestoneId: string
  action: string
  comment?: string
  /** Role that acted (Vendor, PIC, ...) */
  role: string
  /** Named person: the stamped actorName, else for PIC actions the part's PIC on that date, else the role. */
  person: string
}

/**
 * Flattens every entry's history into report lines. PIC actions without a stamped name
 * (e.g. seeded history) are credited to the part's PIC in force on the action's date.
 */
export function buildActivityLog(
  entries: ActivityEntry[],
  parts: PartRecord[],
  templateRows: TemplateRow[],
  activities: ActivityDefinition[],
  assignments: PicAssignment[]
): ActivityLogLine[] {
  const lines: ActivityLogLine[] = []
  for (const entry of entries) {
    const part = parts.find((p) => p.partNo === entry.partNo)
    const row = templateRows.find((r) => r.id === entry.templateRowId)
    const activity = row ? activities.find((a) => a.id === row.activityId) : undefined
    if (!part || !row || !activity) continue
    for (const log of entry.history) {
      let person: string = log.persona
      if (log.actorName) {
        person = log.actorName
      } else if (log.persona === 'PIC') {
        person = getPicOn(part, assignments, log.timestamp.slice(0, 10)).name || 'Unassigned'
      }
      lines.push({
        timestamp: log.timestamp,
        partNo: part.partNo,
        partName: part.partName,
        section: part.section,
        vendorName: part.vendorName,
        vendorCode: part.vendorCode,
        templateRowId: row.id,
        activityName: activity.name,
        milestoneId: row.milestoneId,
        action: log.action,
        comment: log.comment,
        role: log.persona,
        person
      })
    }
  }
  return lines.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/**
 * Transitions validation flow and updates audit history.
 * `actorName` is the named person behind a PIC action (see getPicOn); it is stored on the history log.
 */
export function transitionEntry(
  def: ActivityDefinition,
  entry: ActivityEntry,
  action: 'Submit' | 'Approve' | 'Send back' | 'Edit',
  comment?: string,
  currentPersona?: string,
  actorName?: string
): ActivityEntry {
  const updatedEntry = { ...entry, history: [...entry.history] }
  const now = new Date().toISOString()
  const actor = currentPersona || 'System'

  const currentStep = def.flow.steps[entry.currentStepIndex]

  if (!currentStep) {
    throw new Error('Invalid current step index')
  }

  if (action === 'Submit') {
    if (entry.validationState === 'Draft' || entry.validationState === 'Sent back') {
      updatedEntry.validationState = 'Submitted'
      if (entry.currentStepIndex < def.flow.steps.length - 1) {
        updatedEntry.currentStepIndex += 1
      }
      updatedEntry.history.push({
        timestamp: now,
        persona: actor as any,
        actorName,
        action: 'Submitted',
        comment,
      })
    }
  } else if (action === 'Approve') {
    if (entry.validationState === 'Submitted') {
      if (entry.currentStepIndex === def.flow.steps.length - 1) {
        updatedEntry.validationState = 'Approved'
      } else {
        updatedEntry.currentStepIndex += 1
      }
      updatedEntry.history.push({
        timestamp: now,
        persona: actor as any,
        actorName,
        action: 'Approved',
        comment,
      })
    }
  } else if (action === 'Send back') {
    if (entry.validationState === 'Submitted') {
      updatedEntry.validationState = 'Sent back'
      updatedEntry.currentStepIndex = 0
      updatedEntry.history.push({
        timestamp: now,
        persona: actor as any,
        actorName,
        action: 'Sent back',
        comment,
      })
    }
  } else if (action === 'Edit') {
    updatedEntry.history.push({
      timestamp: now,
      persona: actor as any,
      actorName,
      action: `Edited by ${actor}`,
      comment,
    })
  }

  updatedEntry.updatedAt = now
  updatedEntry.updatedBy = actor as any

  return updatedEntry
}

/**
 * Automatically generates a default dashboard layout configuration from an ActivityDefinition's field KPI roles.
 */
export function generateDashboardConfig(def: ActivityDefinition): DashboardConfig {
  const widgets: Widget[] = []

  // Default metric KPIs
  widgets.push({
    id: `widget-kpi-completion-${def.id}`,
    type: 'kpi',
    title: 'Completion Rate',
    grid: { x: 0, y: 0, w: 3, h: 2 },
    props: { metric: 'completionRate', subtext: 'Target vs Actual' }
  })

  widgets.push({
    id: `widget-kpi-overdue-${def.id}`,
    type: 'kpi',
    title: 'Overdue Entries',
    grid: { x: 3, y: 0, w: 3, h: 2 },
    props: { metric: 'overdueCount', subtext: 'Based on RYG Red' }
  })

  widgets.push({
    id: `widget-kpi-pending-${def.id}`,
    type: 'kpi',
    title: 'Awaiting Validation',
    grid: { x: 6, y: 0, w: 3, h: 2 },
    props: { metric: 'pendingValidationCount', subtext: 'Submitted state' }
  })

  widgets.push({
    id: `widget-kpi-total-${def.id}`,
    type: 'kpi',
    title: 'Total Parts',
    grid: { x: 9, y: 0, w: 3, h: 2 },
    props: { metric: 'totalParts', subtext: 'Applicable instances in scope' }
  })

  // RYG distribution
  widgets.push({
    id: `widget-ryg-${def.id}`,
    type: 'donut',
    title: 'RYG Status Distribution',
    grid: { x: 0, y: 2, w: 4, h: 4 },
    props: { field: 'ryg', chartType: 'donut' }
  })

  // Status breakdown grouped by vendor
  widgets.push({
    id: `widget-status-${def.id}`,
    type: 'stackedBar',
    title: 'Approval Status by Vendor',
    grid: { x: 4, y: 2, w: 8, h: 4 },
    props: { field: 'validationState', groupBy: 'vendorName' }
  })

  // New Part vs ECN split (donut)
  widgets.push({
    id: `widget-new-part-ecn-${def.id}`,
    type: 'donut',
    title: 'New Part vs ECN Split',
    grid: { x: 0, y: 6, w: 4, h: 4 },
    props: { field: 'type', chartType: 'donut' }
  })

  // Planned vs Actual Timeline (trend)
  widgets.push({
    id: `widget-timeline-${def.id}`,
    type: 'trend',
    title: 'Planned vs Actual Timeline',
    grid: { x: 4, y: 6, w: 8, h: 4 },
    props: { metric: 'timeline' }
  })

  // Instances grouped by milestone and by section
  widgets.push({
    id: `widget-milestone-${def.id}`,
    type: 'stackedBar',
    title: 'Approval Status by Milestone',
    grid: { x: 0, y: 10, w: 6, h: 4 },
    props: { field: 'validationState', groupBy: 'milestone' }
  })

  widgets.push({
    id: `widget-section-${def.id}`,
    type: 'stackedBar',
    title: 'Approval Status by Section',
    grid: { x: 6, y: 10, w: 6, h: 4 },
    props: { field: 'validationState', groupBy: 'section' }
  })

  // Completion compared across Models and across Departments (clicking a bar filters the dashboard)
  widgets.push({
    id: `widget-completion-model-${def.id}`,
    type: 'chart',
    title: 'Completion rate by Model',
    grid: { x: 0, y: 14, w: 6, h: 4 },
    props: { measure: 'completionRate', groupBy: 'model', display: 'bar' }
  })

  widgets.push({
    id: `widget-completion-department-${def.id}`,
    type: 'chart',
    title: 'Completion rate by Department',
    grid: { x: 6, y: 14, w: 6, h: 4 },
    props: { measure: 'completionRate', groupBy: 'department', display: 'bar' }
  })

  // Check for percentage fields to bind gauge charts
  let yOffset = 18
  for (const field of def.fields) {
    if (field.showOnDashboard && field.kpiRole === 'percentage') {
      widgets.push({
        id: `widget-field-${field.key}-${def.id}`,
        type: 'gauge',
        title: `${field.label} - Accuracy Bands`,
        grid: { x: 0, y: yOffset, w: 6, h: 4 },
        props: {
          field: field.key,
          thresholds: [
            { label: '<90%', max: 89, color: '#ef4444' },
            { label: '90%~99%', min: 90, max: 99, color: '#f59e0b' },
            { label: '100%', min: 100, max: 100, color: '#10b981' }
          ]
        }
      })
      yOffset += 4
    }
  }

  // Each dropdown / Yes-No field shown on the dashboard gets a stacked bar: Models on the X axis, parts per field value stacked
  // (for example Available vs Not available). Clicking a segment filters the dashboard to that Model's parts with that value.
  const valueFields = def.fields.filter((f) => f.showOnDashboard && (f.type === 'dropdown' || f.type === 'yesNo'))
  // Each number field shown on the dashboard (e.g. Tier-2 Red count) gets a total-by-model bar chart.
  const numberFields = def.fields.filter((f) => f.showOnDashboard && f.type === 'number')
  numberFields.forEach((field, i) => {
    widgets.push({
      id: `widget-total-${field.key}-${def.id}`,
      type: 'chart',
      title: `Total ${field.label} by Model`,
      grid: { x: (i % 2) * 6, y: yOffset + 100 + Math.floor(i / 2) * 4, w: 6, h: 4 },
      props: { measure: 'sum', measureField: field.key, groupBy: 'model', display: 'bar' }
    })
  })
  valueFields.forEach((field, i) => {
    widgets.push({
      id: `widget-values-${field.key}-${def.id}`,
      type: 'chart',
      title: `Parts by Model and ${field.label}`,
      grid: { x: (i % 2) * 6, y: yOffset + Math.floor(i / 2) * 4, w: 6, h: 4 },
      props: { measure: 'count', groupBy: 'model', splitBy: `field:${field.key}`, display: 'stackedBar' }
    })
  })

  return {
    id: def.id,
    activityId: def.id,
    widgets
  }
}

/**
 * Generates the default cross-activity overview dashboard configuration.
 */
export function generateOverviewDashboardConfig(): DashboardConfig {
  return {
    id: 'overview',
    activityId: 'overview',
    widgets: [
      {
        id: 'overview-kpi-total',
        type: 'kpi',
        title: 'Total Parts',
        grid: { x: 0, y: 0, w: 3, h: 2 },
        props: { metric: 'totalParts', subtext: 'All activity instances' }
      },
      {
        id: 'overview-kpi-completion',
        type: 'kpi',
        title: 'Completion Rate',
        grid: { x: 3, y: 0, w: 3, h: 2 },
        props: { metric: 'completionRate', subtext: 'All activities approved' }
      },
      {
        id: 'overview-kpi-overdue',
        type: 'kpi',
        title: 'Overdue Entries',
        grid: { x: 6, y: 0, w: 3, h: 2 },
        props: { metric: 'overdueCount', subtext: 'Past due date' }
      },
      {
        id: 'overview-kpi-pending',
        type: 'kpi',
        title: 'Awaiting Validation',
        grid: { x: 9, y: 0, w: 3, h: 2 },
        props: { metric: 'pendingValidationCount', subtext: 'Submitted state' }
      },
      {
        id: 'overview-ryg-donut',
        type: 'donut',
        title: 'RYG Distribution (All Activities)',
        grid: { x: 0, y: 2, w: 4, h: 4 },
        props: { field: 'ryg' }
      },
      {
        id: 'overview-milestone-stacked',
        type: 'stackedBar',
        title: 'Validation Status by Milestone',
        grid: { x: 4, y: 2, w: 8, h: 4 },
        props: { field: 'validationState', groupBy: 'milestone' }
      },
      {
        id: 'overview-vendor-stacked',
        type: 'stackedBar',
        title: 'Validation Status by Vendor',
        grid: { x: 0, y: 6, w: 6, h: 4 },
        props: { field: 'validationState', groupBy: 'vendorName' }
      },
      {
        id: 'overview-heat-map',
        type: 'heatMap',
        title: 'Activity RYG Status Heat-map',
        grid: { x: 6, y: 6, w: 6, h: 4 },
        props: {}
      },
      {
        id: 'overview-completion-model',
        type: 'chart',
        title: 'Completion rate by Model',
        grid: { x: 0, y: 10, w: 6, h: 4 },
        props: { measure: 'completionRate', groupBy: 'model', display: 'bar' }
      },
      {
        id: 'overview-completion-department',
        type: 'chart',
        title: 'Completion rate by Department',
        grid: { x: 6, y: 10, w: 6, h: 4 },
        props: { measure: 'completionRate', groupBy: 'department', display: 'bar' }
      }
    ]
  }
}

/** Entry status of an instance; 'NotStarted' when no entry exists yet. */
export type InstanceStatus = 'NotStarted' | ValidationState

/** One activity instance = part x template row, with resolved dates, RYG and entry state. */
export interface FilteredInstance {
  row: TemplateRow
  part: PartRecord
  activity: ActivityDefinition
  model: ModelRecord | undefined
  entry: ActivityEntry | undefined
  dates: ResolvedDates
  ryg: RygResult
  status: InstanceStatus
  /** True when the PIC marked this activity Not applicable for the part. */
  notApplicable: boolean
}

/** True when the entry carries a Not-applicable marker. */
export function isNotApplicable(entry: ActivityEntry | undefined): boolean {
  return !!entry?.notApplicable
}

/**
 * Completion % of a set of instances: approved / (total - Not applicable).
 * Not-applicable instances stay in the total count elsewhere but not in this denominator.
 */
export function completionPct(instances: { status: InstanceStatus; notApplicable: boolean }[]): number {
  const active = instances.filter((i) => !i.notApplicable)
  if (active.length === 0) return 0
  return Math.round((active.filter((i) => i.status === 'Approved').length / active.length) * 100)
}

/**
 * Builds and filters activity instances (part x template row) in one pure function.
 *
 * - A template row applies to parts of its own section (part.section === row.section),
 *   whose type matches the activity scope. Rows for unpublished or unknown activities are skipped.
 * - `filters.section` / `filters.milestone` match the row's section / milestone.
 * - `filters.startDate` / `filters.endDate` compare against the resolved END date of the instance;
 *   instances awaiting an MRD have no date and are excluded whenever either bound is set.
 * - Entry lookup uses makeEntryId(row.id, part.partNo).
 */
export function getFilteredData(
  entries: ActivityEntry[],
  activities: ActivityDefinition[],
  parts: PartRecord[],
  templateRows: TemplateRow[],
  models: ModelRecord[],
  filters: GlobalFilters,
  targetActivityId: string | 'overview',
  currentDate: string = '2026-10-15'
): FilteredInstance[] {
  const result: FilteredInstance[] = []

  for (const row of templateRows) {
    const act = activities.find((a) => a.id === row.activityId)
    if (!act || act.published === false) continue // Unknown or draft activity
    if (filters.activityId && filters.activityId !== 'All' && act.id !== filters.activityId) continue
    if (targetActivityId !== 'overview' && act.id !== targetActivityId) continue
    if (filters.section !== 'All' && row.section !== filters.section) continue
    if (filters.milestone !== 'All' && row.milestoneId !== filters.milestone) continue

    for (const p of parts) {
      if (p.supersededBy) continue // Superseded by an ECN transfer — track only the new part
      if (p.section !== row.section) continue
      if (act.scope === 'NewPart' && p.type !== 'NewPart') continue
      if (act.scope === 'ECN' && p.type !== 'ECN') continue

      // Apply global filters
      if (filters.model !== 'All' && p.model !== filters.model) continue
      if (filters.vendor !== 'All' && p.vendorName !== filters.vendor) continue
      if (filters.type !== 'All' && p.type !== filters.type) continue
      if (filters.department && filters.department !== 'All' && (p.department || 'Other') !== filters.department) continue

      const model = models.find((m) => m.name === p.model)
      if (row.subType) {
        // The part's technical category must target this sub-type in the activity's timeline template…
        const cat = p.technicalCategory ?? deriveTechnicalCategory(p)
        const entryForCat = act.timelineTemplate?.find((t) => t.category === cat)
        const targeted = entryForCat?.offsets.some((o) => o.milestoneId === row.milestoneId && o.subType === row.subType)
        if (!targeted) continue
        // …and the model must have that sub-type's MRD (per the Admin's rule).
        if (!getMilestoneMrd(model, subTypeMrdKey(row.milestoneId, row.subType))) continue
      }
      const entryId = makeEntryId(row.id, p.partNo)
      const entry = entries.find((e) => e.id === entryId)
      // Tracked dates follow a vendor-set timeline when present, else the activity's sub-type timeline template, else the row offsets.
      const dates = resolveTrackedDates(row, model, entry, act, p)

      // Date range filter (resolved end date); awaiting-MRD instances have no date
      if (filters.startDate || filters.endDate) {
        if (dates.status === 'awaitingMrd') continue
        if (filters.startDate && dates.end < filters.startDate) continue
        if (filters.endDate && dates.end > filters.endDate) continue
      }

      const notApplicable = isNotApplicable(entry)

      const inst: FilteredInstance = {
        row,
        part: p,
        activity: act,
        model,
        entry,
        dates,
        // Not applicable takes precedence over Awaiting MRD and over the date-based RYG
        ryg: notApplicable ? 'NA' : calculateRYG(dates, entry && !entry.feedOnly ? entry.validationState : 'Draft', currentDate),
        status: entry && !entry.feedOnly ? entry.validationState : 'NotStarted',
        notApplicable
      }
      if (!matchesInstanceFilters(inst, filters)) continue
      result.push(inst)
    }
  }

  return result
}

/**
 * Pure function to aggregate filtered entries/parts for any widget.
 */
export function aggregateWidgetData(
  widget: Widget,
  entries: ActivityEntry[],
  activities: ActivityDefinition[],
  parts: PartRecord[],
  templateRows: TemplateRow[],
  models: ModelRecord[],
  filters: GlobalFilters,
  targetActivityId: string | 'overview',
  currentDate: string = '2026-10-15'
): any {
  const filteredData = getFilteredData(
    entries,
    activities,
    parts,
    templateRows,
    models,
    filters,
    targetActivityId,
    currentDate
  )
  const totalCount = filteredData.length

  if (widget.type === 'kpi') {
    const metric = widget.props.metric
    if (metric === 'totalParts') {
      return totalCount
    }
    if (metric === 'completionRate') {
      return completionPct(filteredData)
    }
    if (metric === 'notApplicableCount') {
      return filteredData.filter((d) => d.notApplicable).length
    }
    if (metric === 'overdueCount') {
      return filteredData.filter((d) => d.ryg === 'Red').length
    }
    if (metric === 'pendingValidationCount') {
      return filteredData.filter((d) => d.status === 'Submitted' && !d.notApplicable).length
    }
    if (metric === 'awaitingMrdCount') {
      return filteredData.filter((d) => d.dates.status === 'awaitingMrd').length
    }
    return 0
  }

  if (widget.type === 'donut') {
    const field = widget.props.field || 'ryg'
    if (field === 'ryg') {
      const g = filteredData.filter((d) => d.ryg === 'Green').length
      const y = filteredData.filter((d) => d.ryg === 'Yellow').length
      const r = filteredData.filter((d) => d.ryg === 'Red').length
      const awaiting = filteredData.filter((d) => d.ryg === 'Grey').length
      const na = filteredData.filter((d) => d.ryg === 'NA').length
      return [
        { name: 'Green', value: g, color: '#10b981' },
        { name: 'Yellow', value: y, color: '#f59e0b' },
        { name: 'Red', value: r, color: '#ef4444' },
        { name: 'Awaiting MRD', value: awaiting, color: '#c6cdd9' },
        { name: 'Not applicable', value: na, color: '#94a3b8' }
      ]
    }
    if (field === 'type') {
      const np = filteredData.filter((d) => d.part.type === 'NewPart').length
      const ecn = filteredData.filter((d) => d.part.type === 'ECN').length
      return [
        { name: 'New Part', value: np, color: '#3b82f6' },
        { name: 'ECN', value: ecn, color: '#ec4899' }
      ]
    }
    if (field === 'validationState' || field === 'status') {
      // A Not-applicable instance is its own slice, not counted under its (possibly Draft) state
      const live = filteredData.filter((d) => !d.notApplicable)
      const draft = live.filter((d) => d.status === 'Draft').length
      const submitted = live.filter((d) => d.status === 'Submitted').length
      const sentBack = live.filter((d) => d.status === 'Sent back').length
      const approved = live.filter((d) => d.status === 'Approved').length
      const notStarted = live.filter((d) => d.status === 'NotStarted').length
      const na = filteredData.length - live.length
      return [
        { name: 'Not Started', value: notStarted, color: '#9ca3af' },
        { name: 'Draft', value: draft, color: '#a78bfa' },
        { name: 'Submitted', value: submitted, color: '#fb923c' },
        { name: 'Sent Back', value: sentBack, color: '#f87171' },
        { name: 'Approved', value: approved, color: '#4ade80' },
        { name: 'Not applicable', value: na, color: '#94a3b8' }
      ]
    }

    // Dynamic field binding
    const counts: Record<string, number> = {}
    let missingCount = 0

    // Initialize with field options if available
    let options: string[] = []
    if (targetActivityId !== 'overview') {
      const act = activities.find((a) => a.id === targetActivityId)
      const fDef = act?.fields.find((f) => f.key === field)
      if (fDef?.options) {
        options = fDef.options
        options.forEach(o => { counts[o] = 0 })
      }
    }

    for (const d of filteredData) {
      const val = d.entry?.values?.[field]
      if (val !== undefined && val !== null && val !== '') {
        counts[String(val)] = (counts[String(val)] || 0) + 1
      } else {
        missingCount++
      }
    }

    const result = Object.entries(counts).map(([name, value]) => ({
      name,
      value
    }))

    if (missingCount > 0) {
      result.push({ name: 'Not Started / NA', value: missingCount })
    }

    return result
  }

  if (widget.type === 'stackedBar') {
    const field = widget.props.field || 'validationState'
    const groupBy = widget.props.groupBy || 'vendorName'

    const groups: Record<string, Record<string, number>> = {}

    for (const d of filteredData) {
      let gKey = 'Unknown'
      if (groupBy === 'vendorName') {
        gKey = d.part.vendorName
      } else if (groupBy === 'model') {
        gKey = d.part.model
      } else if (groupBy === 'milestone') {
        gKey = d.row.milestoneId
      } else if (groupBy === 'section') {
        gKey = d.row.section
      } else if (groupBy === 'department') {
        gKey = d.part.department || 'Other'
      }

      if (!groups[gKey]) {
        groups[gKey] = {
          Draft: 0,
          Submitted: 0,
          'Sent back': 0,
          Approved: 0,
          NotStarted: 0,
          Green: 0,
          Yellow: 0,
          Red: 0,
          Grey: 0,
          NA: 0
        }
      }

      if (field === 'validationState') {
        // A Not-applicable instance is its own bucket, not counted under its (possibly Draft) state
        const key = d.notApplicable ? 'NA' : d.status
        groups[gKey][key] = (groups[gKey][key] || 0) + 1
      } else if (field === 'ryg') {
        groups[gKey][d.ryg] = (groups[gKey][d.ryg] || 0) + 1
      }
    }

    return Object.entries(groups).map(([name, counts]) => ({
      name,
      ...counts
    }))
  }

  if (widget.type === 'barCategory') {
    const field = widget.props.field
    const counts: Record<string, number> = {}
    for (const d of filteredData) {
      const val = d.entry?.values?.[field] || 'Not Started / NA'
      counts[String(val)] = (counts[String(val)] || 0) + 1
    }
    return Object.entries(counts).map(([category, count]) => ({
      category,
      count
    }))
  }

  if (widget.type === 'trend') {
    const monthlyGroups: Record<string, { label: string; Planned: number; Actual: number }> = {}

    for (const d of filteredData) {
      if (d.dates.status === 'awaitingMrd' || d.notApplicable) continue // No date, or not applicable: not on the timeline
      const endDate = d.dates.end
      const monthLabel = endDate.substring(0, 7) // YYYY-MM
      if (!monthlyGroups[monthLabel]) {
        const dateObj = parseDate(endDate)
        const formattedLabel = isNaN(dateObj.getTime())
          ? monthLabel
          : dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

        monthlyGroups[monthLabel] = {
          label: formattedLabel,
          Planned: 0,
          Actual: 0
        }
      }
      monthlyGroups[monthLabel].Planned++
      if (d.status === 'Approved') {
        monthlyGroups[monthLabel].Actual++
      }
    }

    return Object.keys(monthlyGroups)
      .sort()
      .map((key) => monthlyGroups[key])
  }

  if (widget.type === 'gauge') {
    const field = widget.props.field
    const counts = { '<90%': 0, '90-99%': 0, '100%': 0 }
    let naCount = 0

    for (const d of filteredData) {
      const band = percentBand(d.entry?.values?.[field])
      if (band) counts[band]++
      else naCount++
    }

    const result = [
      { name: '<90%', value: counts['<90%'], color: '#ef4444' },
      { name: '90-99%', value: counts['90-99%'], color: '#f59e0b' },
      { name: '100%', value: counts['100%'], color: '#10b981' }
    ]

    if (naCount > 0) {
      result.push({ name: 'N/A', value: naCount, color: '#9ca3af' })
    }

    return result
  }

  if (widget.type === 'chart') {
    const chartProps = readChartProps(widget.props)
    const activity = targetActivityId === 'overview' ? undefined : activities.find((a) => a.id === targetActivityId)
    return chartProps ? computeChart(filteredData, chartProps, activity) : null
  }

  if (widget.type === 'heatMap') {
    const activeActivities = activities.filter(a => a.published !== false)
    return activeActivities.map((act) => {
      const actData = filteredData.filter((d) => d.activity.id === act.id)
      return {
        activityId: act.id,
        activityName: act.name,
        Green: actData.filter((d) => d.ryg === 'Green').length,
        Yellow: actData.filter((d) => d.ryg === 'Yellow').length,
        Red: actData.filter((d) => d.ryg === 'Red').length,
        Grey: actData.filter((d) => d.ryg === 'Grey').length,
        NA: actData.filter((d) => d.ryg === 'NA').length
      }
    })
  }

  return []
}

// ---------------------------------------------------------------------------------------------------------------
// General chart: dimension + measure catalogue and one aggregation (measure x groupBy [x splitBy]).
// A `chart` widget stores the Admin's choices in `ChartProps`; everything below is pure and UI-free.
// ---------------------------------------------------------------------------------------------------------------

/** Group key used for an empty field value (also for parts with no entry and for Not-applicable parts). */
export const NOT_ENTERED = '__none__'

export const STATUS_LABELS: Record<string, string> = {
  NotStarted: 'Not started',
  Draft: 'Draft',
  Submitted: 'Submitted',
  'Sent back': 'Sent back',
  Approved: 'Approved',
  NA: 'Not applicable'
}
const STATUS_COLORS: Record<string, string> = {
  NotStarted: '#9ca3af',
  Draft: '#a78bfa',
  Submitted: '#fb923c',
  'Sent back': '#f87171',
  Approved: '#4ade80',
  NA: '#94a3b8'
}
export const RYG_LABELS: Record<string, string> = {
  Green: 'Green',
  Yellow: 'Yellow',
  Red: 'Red',
  Grey: 'Awaiting MRD',
  NA: 'Not applicable'
}
const RYG_COLORS: Record<string, string> = {
  Green: '#10b981',
  Yellow: '#f59e0b',
  Red: '#ef4444',
  Grey: '#c6cdd9',
  NA: '#94a3b8'
}

/** Field types an Admin can group by: a small set of distinct values (date fields group by month). */
const GROUPABLE_FIELD_TYPES = ['dropdown', 'yesNo', 'date']
/** Field types an Admin can average or sum. */
const MEASURABLE_FIELD_TYPES = ['number', 'percent']

export interface ChartDimension {
  /** Built-in id or `field:<fieldKey>`. */
  id: string
  label: string
}

export interface ChartMeasure {
  id: MeasureId
  label: string
  /** True for average / sum: the Admin must also pick a number or percent field. */
  needsField: boolean
  /** True when each group can be split into stacked parts (the measure counts instances). */
  splittable: boolean
}

export const CHART_MEASURES: ChartMeasure[] = [
  { id: 'count', label: 'Count of parts', needsField: false, splittable: true },
  { id: 'completionRate', label: 'Completion rate (%)', needsField: false, splittable: false },
  { id: 'overdue', label: 'Overdue (Red)', needsField: false, splittable: true },
  { id: 'awaitingValidation', label: 'Awaiting validation', needsField: false, splittable: true },
  { id: 'average', label: 'Average of a field', needsField: true, splittable: false },
  { id: 'sum', label: 'Sum of a field', needsField: true, splittable: false }
]

const BUILTIN_DIMENSIONS: ChartDimension[] = [
  { id: 'status', label: 'Status' },
  { id: 'ryg', label: 'RYG' },
  { id: 'model', label: 'Model' },
  { id: 'department', label: 'Department' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'section', label: 'Section' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'type', label: 'New Part / ECN' },
  { id: 'activity', label: 'Activity' }
]

/**
 * The dimensions an Admin can group or split by. Built-ins always; an activity's categorical fields only on that
 * activity's dashboard (`activity` given), since fields differ per activity. 'Activity' is only useful on the Overview.
 */
export function chartDimensions(activity?: ActivityDefinition): ChartDimension[] {
  const builtins = BUILTIN_DIMENSIONS.filter((d) => (activity ? d.id !== 'activity' : true))
  const fields = (activity?.fields ?? [])
    .filter((f) => GROUPABLE_FIELD_TYPES.includes(f.type))
    .map((f) => ({ id: `field:${f.key}`, label: f.label }))
  return [...builtins, ...fields]
}

/** The number and percent fields of an activity that average / sum can use. */
export function chartMeasureFields(activity?: ActivityDefinition): FieldDefinition[] {
  return (activity?.fields ?? []).filter((f) => MEASURABLE_FIELD_TYPES.includes(f.type))
}

/** The field values an instance shows: calculated fields recomputed; empty for no entry or Not applicable. */
function instanceValues(inst: FilteredInstance): Record<string, any> {
  if (!inst.entry || inst.notApplicable) return {}
  return evaluateCalculatedFields(
    inst.activity,
    { ...inst.entry.values },
    inst.part,
    getMilestoneMrd(inst.model, inst.row.milestoneId)
  )
}

/** The engine's group key for a status: 'NA' for Not applicable, else the entry state ('NotStarted' if no entry). */
function statusKey(inst: FilteredInstance): string {
  return inst.notApplicable ? 'NA' : inst.status
}

/** Percent bands shared by the accuracy gauge and the field filter, so a clicked band selects exactly its parts. */
export const PERCENT_BANDS = ['<90%', '90-99%', '100%'] as const

/** The band of a percent / number value; undefined when it is empty or not a number. */
export function percentBand(value: unknown): (typeof PERCENT_BANDS)[number] | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = parseFloat(String(value).replace('%', ''))
  if (Number.isNaN(n)) return undefined
  return n < 90 ? '<90%' : n < 100 ? '90-99%' : '100%'
}

/** Group key and label of one field value (dates group by month, 'YYYY-MM'; percent and number fields by band). */
function fieldGroup(field: FieldDefinition, value: unknown): { key: string; name: string } {
  if (value === undefined || value === null || value === '') return { key: NOT_ENTERED, name: 'Not entered' }
  if (field.type === 'date') {
    const s = String(value)
    if (!/^\d{4}-\d{2}/.test(s)) return { key: s, name: s }
    const key = s.substring(0, 7)
    const d = parseDate(`${key}-01`)
    return { key, name: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }
  }
  if (field.type === 'yesNo') {
    return { key: String(value), name: value === 'Y' ? 'Yes' : value === 'N' ? 'No' : String(value) }
  }
  if (field.type === 'percent' || field.type === 'number') {
    const band = percentBand(value)
    return band ? { key: band, name: band } : { key: NOT_ENTERED, name: 'Not entered' }
  }
  return { key: String(value), name: String(value) }
}

/** Display label of a field filter's value key (for example `2026-10` is "Oct 2026", `Y` is "Yes"). */
export function fieldValueLabel(field: FieldDefinition, key: string): string {
  if (key === NOT_ENTERED) return 'Not entered'
  if (field.type === 'percent' || field.type === 'number') return key
  return fieldGroup(field, key).name
}

/** The group (key + label) an instance belongs to for a dimension id. */
export function dimensionGroup(dimId: string, inst: FilteredInstance): { key: string; name: string } {
  switch (dimId) {
    case 'status': {
      const key = statusKey(inst)
      return { key, name: STATUS_LABELS[key] ?? key }
    }
    case 'ryg':
      return { key: inst.ryg, name: RYG_LABELS[inst.ryg] ?? inst.ryg }
    case 'model':
      return { key: inst.part.model, name: inst.part.model }
    case 'department': {
      const d = inst.part.department || 'Other'
      return { key: d, name: d }
    }
    case 'vendor':
      return { key: inst.part.vendorName, name: inst.part.vendorName }
    case 'section':
      return { key: inst.row.section, name: inst.row.section }
    case 'milestone':
      return { key: inst.row.milestoneId, name: inst.row.milestoneId }
    case 'type':
      return { key: inst.part.type, name: inst.part.type === 'NewPart' ? 'New Part' : 'ECN' }
    case 'activity':
      return { key: inst.activity.id, name: inst.activity.name }
  }
  if (dimId.startsWith('field:')) {
    const field = inst.activity.fields.find((f) => f.key === dimId.slice(6))
    if (!field) return { key: NOT_ENTERED, name: 'Not entered' }
    return fieldGroup(field, instanceValues(inst)[field.key])
  }
  return { key: NOT_ENTERED, name: 'Not entered' }
}

/**
 * The dashboard filter that selects one group of a dimension: what a chart click applies. Built-ins that
 * `getFilteredData` already filters map straight across; status, RYG and fields use the instance-level filters.
 */
export function drillFilterFor(dimId: string, key: string): Partial<GlobalFilters> {
  switch (dimId) {
    case 'status': return { status: key }
    case 'ryg': return { ryg: key }
    case 'model': return { model: key }
    case 'department': return { department: key }
    case 'vendor': return { vendor: key }
    case 'section': return { section: key }
    case 'milestone': return { milestone: key }
    case 'type': return key === 'NewPart' || key === 'ECN' ? { type: key } : {}
    case 'activity': return { activityId: key }
  }
  return dimId.startsWith('field:') ? { fields: [{ key: dimId.slice(6), value: key }] } : {}
}

/** Filters that need the built instance (status, RYG, one field value). The rest are applied earlier. */
function matchesInstanceFilters(inst: FilteredInstance, filters: GlobalFilters): boolean {
  if (filters.status && filters.status !== 'All' && statusKey(inst) !== filters.status) return false
  if (filters.ryg && filters.ryg !== 'All' && inst.ryg !== filters.ryg) return false
  for (const { key, value } of filters.fields ?? []) {
    if (dimensionGroup(`field:${key}`, inst).key !== value) return false
  }
  return true
}

/** One bar / slice / row of a chart. */
export interface ChartGroup {
  /** Group key to drill into (see `drillFilterFor`). */
  key: string
  name: string
  /** The measure for this group. */
  value: number
  /** True for an average / sum group where no instance has a number: show "—", not 0. */
  empty?: boolean
  /** Instances in the group (the denominator context, shown in tables and tooltips). */
  total: number
  color?: string
  /** Present when the chart is split: the measure per split key. */
  parts?: { key: string; name: string; value: number; color?: string }[]
}

export interface ChartResult {
  measure: MeasureId
  /** '%' for completion rate and percent averages; '' otherwise. */
  unit: string
  /** The measure over all instances, for the KPI tile. */
  overall: number
  groups: ChartGroup[]
  /** Split legend, in order; empty when not split. */
  splitKeys: { key: string; name: string; color?: string }[]
}

/** Reads and checks a widget's props; null when they do not describe a chart (the widget shows nothing). */
export function readChartProps(props: Record<string, any>): ChartProps | null {
  const measure = CHART_MEASURES.find((m) => m.id === props?.measure)
  if (!measure || typeof props.groupBy !== 'string' || !props.groupBy) return null
  if (measure.needsField && typeof props.measureField !== 'string') return null
  return {
    measure: measure.id,
    measureField: measure.needsField ? props.measureField : undefined,
    groupBy: props.groupBy,
    splitBy: measure.splittable && typeof props.splitBy === 'string' && props.splitBy !== props.groupBy ? props.splitBy : undefined,
    display: props.display ?? 'bar'
  }
}

function numberOf(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = parseFloat(String(value).replace('%', ''))
  return Number.isNaN(n) ? undefined : n
}

function isFieldMeasure(props: ChartProps): boolean {
  return props.measure === 'average' || props.measure === 'sum'
}

function fieldNumbers(insts: FilteredInstance[], props: ChartProps): number[] {
  return insts
    .map((d) => numberOf(instanceValues(d)[props.measureField ?? '']))
    .filter((n): n is number => n !== undefined)
}

function countNumbers(insts: FilteredInstance[], props: ChartProps): number {
  return fieldNumbers(insts, props).length
}

/** The measure over one set of instances. Average / sum skip instances with no number (Not applicable included). */
function measureValue(insts: FilteredInstance[], props: ChartProps): number {
  switch (props.measure) {
    case 'count': return insts.length
    case 'completionRate': return completionPct(insts)
    case 'overdue': return insts.filter((d) => d.ryg === 'Red').length
    case 'awaitingValidation': return insts.filter((d) => d.status === 'Submitted' && !d.notApplicable).length
    case 'average':
    case 'sum': {
      const nums = fieldNumbers(insts, props)
      if (nums.length === 0) return 0
      const sum = nums.reduce((a, b) => a + b, 0)
      return props.measure === 'sum' ? Math.round(sum * 10) / 10 : Math.round((sum / nums.length) * 10) / 10
    }
  }
}

/** Sort groups: fixed order for status and RYG, otherwise by key; "Not entered" last. */
function sortGroups<T extends { key: string }>(dimId: string, groups: T[]): T[] {
  const fixed = dimId === 'status' ? Object.keys(STATUS_LABELS) : dimId === 'ryg' ? Object.keys(RYG_LABELS) : undefined
  const rank = (k: string) => (k === NOT_ENTERED ? Infinity : fixed ? fixed.indexOf(k) : 0)
  return [...groups].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key, undefined, { numeric: true }))
}

function colorOf(dimId: string, key: string): string | undefined {
  return dimId === 'status' ? STATUS_COLORS[key] : dimId === 'ryg' ? RYG_COLORS[key] : undefined
}

/**
 * Generic aggregation: one row per group of `groupBy` (only groups that have instances), each with the measure,
 * its instance count, and optionally the measure per `splitBy` key. A single group equals the matching KPI tile
 * with that filter, because the measures reuse the tile rules (`completionPct`, Red, Submitted).
 */
export function computeChart(
  instances: FilteredInstance[],
  props: ChartProps,
  // The activity is only used to label the measure unit.
  activity?: ActivityDefinition
): ChartResult {
  const byGroup = new Map<string, { name: string; insts: FilteredInstance[] }>()
  for (const inst of instances) {
    const g = dimensionGroup(props.groupBy, inst)
    const bucket = byGroup.get(g.key)
    if (bucket) bucket.insts.push(inst)
    else byGroup.set(g.key, { name: g.name, insts: [inst] })
  }

  const splitNames = new Map<string, string>()
  const groups: ChartGroup[] = [...byGroup.entries()].map(([key, { name, insts }]) => {
    const group: ChartGroup = {
      key,
      name,
      value: measureValue(insts, props),
      total: insts.length,
      color: colorOf(props.groupBy, key)
    }
    if (isFieldMeasure(props) && countNumbers(insts, props) === 0) group.empty = true
    if (props.splitBy) {
      const sub = new Map<string, { name: string; insts: FilteredInstance[] }>()
      for (const inst of insts) {
        const s = dimensionGroup(props.splitBy, inst)
        splitNames.set(s.key, s.name)
        const b = sub.get(s.key)
        if (b) b.insts.push(inst)
        else sub.set(s.key, { name: s.name, insts: [inst] })
      }
      group.parts = [...sub.entries()].map(([k, v]) => ({
        key: k,
        name: v.name,
        value: measureValue(v.insts, props),
        color: colorOf(props.splitBy!, k)
      }))
    }
    return group
  })

  const measureField = props.measureField ? activity?.fields.find((f) => f.key === props.measureField) : undefined
  const unit = props.measure === 'completionRate' || (props.measure === 'average' && measureField?.type === 'percent') ? '%' : ''

  const splitKeys = sortGroups(
    props.splitBy ?? '',
    [...splitNames.entries()].map(([key, name]) => ({ key, name, color: props.splitBy ? colorOf(props.splitBy, key) : undefined }))
  )
  // Every group lists its parts in the legend's order
  for (const g of groups) g.parts?.sort((a, b) => splitKeys.findIndex((k) => k.key === a.key) - splitKeys.findIndex((k) => k.key === b.key))

  return {
    measure: props.measure,
    unit,
    overall: measureValue(instances, props),
    groups: sortGroups(props.groupBy, groups),
    splitKeys
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cross-activity comparison: compare several activities for ONE model or ONE part.
// Each compared activity, repeated per milestone it appears under, is one point on the X axis.
// ---------------------------------------------------------------------------------------------------------------

/** One X-axis point in a cross-activity chart: a specific activity under a specific milestone. */
export interface CrossPoint {
  /** Stable key `${activityId}|${milestoneId}`. */
  key: string
  /** Chart label, e.g. "Spec meeting · PP". */
  name: string
  activityId: string
  activityName: string
  milestoneId: string
  /** The instances (one per matching part) behind this point. */
  instances: FilteredInstance[]
}

/**
 * The instances for a cross-activity dashboard: every selected activity's instances, limited to the one
 * model or part, grouped into points (activity × milestone). Uses getFilteredData so scope/RYG are consistent.
 */
export function crossActivityPoints(
  entries: ActivityEntry[],
  activities: ActivityDefinition[],
  parts: PartRecord[],
  templateRows: TemplateRow[],
  models: ModelRecord[],
  activityIds: string[],
  commonality: 'model' | 'part',
  commonalityValue: string,
  currentDate: string = '2026-10-15'
): CrossPoint[] {
  const all = getFilteredData(
    entries,
    activities,
    parts,
    templateRows,
    models,
    { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
    'overview',
    currentDate
  ).filter(
    (i) =>
      activityIds.includes(i.activity.id) &&
      (commonality === 'model' ? i.part.model === commonalityValue : i.part.partNo === commonalityValue)
  )

  const byKey = new Map<string, CrossPoint>()
  for (const inst of all) {
    const key = `${inst.activity.id}|${inst.row.milestoneId}`
    let p = byKey.get(key)
    if (!p) {
      p = {
        key,
        name: `${inst.activity.name} · ${inst.row.milestoneId}`,
        activityId: inst.activity.id,
        activityName: inst.activity.name,
        milestoneId: inst.row.milestoneId,
        instances: []
      }
      byKey.set(key, p)
    }
    p.instances.push(inst)
  }
  // Keep the selected-activity order, then milestone order within each.
  return Array.from(byKey.values()).sort(
    (a, b) =>
      activityIds.indexOf(a.activityId) - activityIds.indexOf(b.activityId) ||
      a.milestoneId.localeCompare(b.milestoneId)
  )
}

/** One row of cross-activity chart data: a point plus either a single `value` or stacked `segments`. */
export interface CrossRow {
  key: string
  name: string
  activityName: string
  milestoneId: string
  value?: number
  segments?: Record<string, number>
}

export interface CrossResult {
  rows: CrossRow[]
  /** For stacked plots: the segment keys + display labels + colors, in draw order. */
  segmentKeys: { key: string; name: string; color: string }[]
  /** '%' for rate/percent-average plots, else ''. */
  unit: string
  /** 'single' = one bar/line value per point; 'stacked' = segmented. */
  shape: 'single' | 'stacked'
}

/** Measure of a single point's instances (mirrors the chart measures, part-count based). */
function crossMeasure(insts: FilteredInstance[], measure: string): number {
  const active = insts.filter((i) => !i.notApplicable)
  if (measure === 'completionRate') {
    if (active.length === 0) return 0
    return Math.round((active.filter((i) => i.status === 'Approved').length / active.length) * 100)
  }
  if (measure === 'approved') return active.filter((i) => i.status === 'Approved').length
  if (measure === 'overdue') return insts.filter((i) => i.ryg === 'Red').length
  if (measure === 'awaitingValidation') return insts.filter((i) => i.status === 'Submitted').length
  return insts.length // count
}

/** Compute the chart data for one cross-activity widget plot across the given points. */
export function computeCrossWidget(
  points: CrossPoint[],
  plot: CrossPlot,
  activities: ActivityDefinition[]
): CrossResult {
  // Measure → one value per point.
  if (plot.kind === 'measure') {
    const unit = plot.measure === 'completionRate' ? '%' : ''
    return {
      rows: points.map((p) => ({
        key: p.key,
        name: p.name,
        activityName: p.activityName,
        milestoneId: p.milestoneId,
        value: crossMeasure(p.instances, plot.measure)
      })),
      segmentKeys: [],
      unit,
      shape: 'single'
    }
  }

  // Status / RYG → stacked segments per point.
  if (plot.kind === 'status' || plot.kind === 'ryg') {
    const isRyg = plot.kind === 'ryg'
    const order = isRyg
      ? ['Green', 'Yellow', 'Red', 'Grey', 'NA']
      : ['NotStarted', 'Draft', 'Submitted', 'Sent back', 'Approved', 'NA']
    const colorsMap = isRyg ? RYG_COLORS : STATUS_COLORS
    const labels = isRyg ? RYG_LABELS : STATUS_LABELS
    const rows: CrossRow[] = points.map((p) => {
      const segments: Record<string, number> = {}
      for (const key of order) segments[key] = 0
      for (const inst of p.instances) {
        const k = isRyg ? inst.ryg : inst.notApplicable ? 'NA' : inst.status
        segments[k] = (segments[k] ?? 0) + 1
      }
      return { key: p.key, name: p.name, activityName: p.activityName, milestoneId: p.milestoneId, segments }
    })
    return {
      rows,
      segmentKeys: order.map((k) => ({ key: k, name: labels[k] ?? k, color: colorsMap[k] ?? '#9ca3af' })),
      unit: '',
      shape: 'stacked'
    }
  }

  // Shared field: categorical → stacked by value; numeric/percent → average per point.
  const fieldDef = activities
    .flatMap((a) => a.fields)
    .find((f) => f.key === plot.fieldKey)
  const numeric = fieldDef && (fieldDef.type === 'number' || fieldDef.type === 'percent')

  if (numeric) {
    return {
      rows: points.map((p) => {
        const nums = p.instances
          .map((i) => parseFloat(String(instanceValues(i)[plot.fieldKey] ?? '').replace('%', '')))
          .filter((n) => !Number.isNaN(n))
        const value = nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0
        return { key: p.key, name: p.name, activityName: p.activityName, milestoneId: p.milestoneId, value }
      }),
      segmentKeys: [],
      unit: fieldDef?.type === 'percent' ? '%' : '',
      shape: 'single'
    }
  }

  // Categorical field → stacked by distinct value.
  const valueKeys = new Set<string>()
  const perPoint = points.map((p) => {
    const segments: Record<string, number> = {}
    for (const inst of p.instances) {
      const g = fieldDef ? fieldGroup(fieldDef, instanceValues(inst)[plot.fieldKey]) : { key: NOT_ENTERED, name: 'Not entered' }
      segments[g.key] = (segments[g.key] ?? 0) + 1
      valueKeys.add(g.key)
    }
    return { p, segments }
  })
  const palette = ['#2153f5', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#14b8a6', '#6366f1', '#94a3b8']
  const keys = Array.from(valueKeys)
  return {
    rows: perPoint.map(({ p, segments }) => ({
      key: p.key,
      name: p.name,
      activityName: p.activityName,
      milestoneId: p.milestoneId,
      segments
    })),
    segmentKeys: keys.map((k, i) => ({
      key: k,
      name: fieldDef ? fieldValueLabel(fieldDef, k) : k,
      color: palette[i % palette.length]
    })),
    unit: '',
    shape: 'stacked'
  }
}

/**
 * Suggest chart types for a chosen plot, best first, so the builder can prompt the user.
 * Measures compare one value per activity → grouped bar or line (or a table); status/RYG/categorical
 * fields are breakdowns → stacked bar (or table). The first entry is a sensible default.
 */
export function recommendCrossDisplays(plot: CrossPlot, activities: ActivityDefinition[]): CrossDisplay[] {
  if (plot.kind === 'status' || plot.kind === 'ryg') return ['stackedBar', 'table']
  if (plot.kind === 'measure') {
    // A rate reads well as bars across activities; trends across milestones also read as a line.
    return ['groupedBar', 'line', 'table']
  }
  // field
  const fieldDef = activities.flatMap((a) => a.fields).find((f) => f.key === plot.fieldKey)
  if (fieldDef && (fieldDef.type === 'number' || fieldDef.type === 'percent')) return ['groupedBar', 'line', 'table']
  return ['stackedBar', 'table']
}

/** Fields shared (same key) by every selected activity — the safe set to plot across all of them. */
export function sharedFields(activityIds: string[], activities: ActivityDefinition[]): FieldDefinition[] {
  const selected = activities.filter((a) => activityIds.includes(a.id))
  if (selected.length === 0) return []
  const [first, ...rest] = selected
  return first.fields.filter(
    (f) => f.type !== 'file' && f.type !== 'button' && rest.every((a) => a.fields.some((g) => g.key === f.key))
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Manpower planning: PIC load assessment + vendor-visit opportunistic coverage.
// ---------------------------------------------------------------------------------------------------------------

/** How loaded one PIC is, derived from the activity instances whose effective PIC is this person. */
export interface PicLoad {
  pic: string
  /** Distinct parts this PIC owns. */
  parts: number
  /** Distinct vendors across those parts. */
  vendors: number
  /** Total activity instances (part × template row) in scope for this PIC. */
  instances: number
  /** Instances not yet Approved and not Not-applicable. */
  open: number
  /** Instances overdue (RYG Red). */
  overdue: number
  /** Instances awaiting this PIC's validation (Submitted). */
  toValidate: number
}

/**
 * Builds a load row per PIC from the activity instances. The effective PIC of each part (SAP value or a
 * PIC assignment in force today) decides who owns it. Unassigned parts are grouped under "Unassigned".
 */
export function buildPicLoads(
  entries: ActivityEntry[],
  activities: ActivityDefinition[],
  parts: PartRecord[],
  templateRows: TemplateRow[],
  models: ModelRecord[],
  assignments: PicAssignment[],
  currentDate: string = '2026-10-15'
): PicLoad[] {
  const all = getFilteredData(
    entries,
    activities,
    parts,
    templateRows,
    models,
    { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
    'overview',
    currentDate
  )
  const map = new Map<string, { parts: Set<string>; vendors: Set<string>; instances: number; open: number; overdue: number; toValidate: number }>()
  for (const inst of all) {
    const pic = getPicOn(inst.part, assignments, currentDate).name || 'Unassigned'
    let e = map.get(pic)
    if (!e) {
      e = { parts: new Set(), vendors: new Set(), instances: 0, open: 0, overdue: 0, toValidate: 0 }
      map.set(pic, e)
    }
    e.parts.add(inst.part.partNo)
    e.vendors.add(inst.part.vendorName)
    e.instances += 1
    if (!inst.notApplicable && inst.status !== 'Approved') e.open += 1
    if (inst.ryg === 'Red') e.overdue += 1
    if (inst.status === 'Submitted') e.toValidate += 1
  }
  return Array.from(map.entries())
    .map(([pic, v]) => ({ pic, parts: v.parts.size, vendors: v.vendors.size, instances: v.instances, open: v.open, overdue: v.overdue, toValidate: v.toValidate }))
    .sort((a, b) => b.open - a.open || b.instances - a.instances)
}

/** The location of a vendor (from the vendor master), or 'Unknown'. */
export function vendorLocation(vendorName: string, vendorInfo: VendorInfo[]): string {
  return vendorInfo.find((v) => v.vendorName === vendorName)?.location ?? 'Unknown'
}

/**
 * Opportunistic coverage for a PIC visiting `vendorName`:
 * - `sameVendorOtherParts`: parts at that vendor NOT owned by the visiting PIC (they can be picked up on site).
 * - `sameLocationOtherVendors`: other vendors in the same location, each with its part count (a nearby detour).
 * "Owned" uses the effective PIC today.
 */
export function visitCoverage(
  visitingPic: string,
  vendorName: string,
  parts: PartRecord[],
  assignments: PicAssignment[],
  vendorInfo: VendorInfo[],
  currentDate: string = '2026-10-15'
): {
  location: string
  sameVendorOtherParts: { part: PartRecord; owner: string }[]
  sameLocationOtherVendors: { vendorName: string; parts: number }[]
} {
  const live = parts.filter((p) => !p.supersededBy)
  const owner = (p: PartRecord) => getPicOn(p, assignments, currentDate).name || 'Unassigned'

  const sameVendorOtherParts = live
    .filter((p) => p.vendorName === vendorName && owner(p) !== visitingPic)
    .map((p) => ({ part: p, owner: owner(p) }))

  const location = vendorLocation(vendorName, vendorInfo)
  const otherVendorsHere = new Map<string, number>()
  if (location !== 'Unknown') {
    for (const p of live) {
      if (p.vendorName === vendorName) continue
      if (vendorLocation(p.vendorName, vendorInfo) !== location) continue
      otherVendorsHere.set(p.vendorName, (otherVendorsHere.get(p.vendorName) ?? 0) + 1)
    }
  }
  const sameLocationOtherVendors = Array.from(otherVendorsHere.entries())
    .map(([v, n]) => ({ vendorName: v, parts: n }))
    .sort((a, b) => b.parts - a.parts)

  return { location, sameVendorOtherParts, sameLocationOtherVendors }
}

// ---------------------------------------------------------------------------------------------------------------
// My Work "Workspace": classify each instance into the client's four buckets and roll up by a dimension.
// Upcoming (to-do, on time) · Completed (approved) · Delayed (overdue, not approved) · NG (sent back).
// ---------------------------------------------------------------------------------------------------------------

export type WorkBucket = 'Upcoming' | 'Completed' | 'Delayed' | 'NG'

export const WORK_BUCKETS: WorkBucket[] = ['Upcoming', 'Completed', 'Delayed', 'NG']

export const WORK_BUCKET_COLORS: Record<WorkBucket, string> = {
  Upcoming: '#2153f5', // blue  — still to do, on time
  Completed: '#10b981', // green — approved
  Delayed: '#f59e0b', // amber — overdue, not done
  NG: '#ef4444' // red   — sent back / not good, needs rework
}

export const WORK_BUCKET_DESC: Record<WorkBucket, string> = {
  Upcoming: 'On track and still to do',
  Completed: 'Approved',
  Delayed: 'Past due date, not yet approved',
  NG: 'Sent back — needs rework'
}

/**
 * The client's workspace bucket for an instance:
 * - NG: the entry was sent back (explicit rework).
 * - Completed: approved.
 * - Delayed: overdue (RYG Red) and not approved.
 * - Upcoming: everything else still open (not started / draft / submitted, on time). Awaiting-MRD counts as Upcoming.
 * Not-applicable instances return null (excluded from the workspace).
 */
export function workBucket(inst: FilteredInstance): WorkBucket | null {
  if (inst.notApplicable) return null
  if (inst.status === 'Sent back') return 'NG'
  if (inst.status === 'Approved') return 'Completed'
  if (inst.ryg === 'Red') return 'Delayed'
  return 'Upcoming'
}

/** Totals per bucket across a set of instances. */
export function bucketTotals(instances: FilteredInstance[]): Record<WorkBucket, number> {
  const t: Record<WorkBucket, number> = { Upcoming: 0, Completed: 0, Delayed: 0, NG: 0 }
  for (const i of instances) {
    const b = workBucket(i)
    if (b) t[b] += 1
  }
  return t
}

/** One grouped row for the workspace chart: a group key with a count per bucket. */
export interface WorkspaceGroupRow {
  key: string
  Upcoming: number
  Completed: number
  Delayed: number
  NG: number
  total: number
}

/** Group instances by a dimension (model / vendor / department / milestone / section) into per-bucket counts. */
export function workspaceGroups(
  instances: FilteredInstance[],
  groupBy: 'model' | 'vendor' | 'department' | 'milestone' | 'section'
): WorkspaceGroupRow[] {
  const keyOf = (i: FilteredInstance): string =>
    groupBy === 'model' ? i.part.model
    : groupBy === 'vendor' ? i.part.vendorName
    : groupBy === 'department' ? (i.part.department || 'Other')
    : groupBy === 'milestone' ? i.row.milestoneId
    : i.row.section
  const map = new Map<string, WorkspaceGroupRow>()
  for (const i of instances) {
    const b = workBucket(i)
    if (!b) continue
    const k = keyOf(i)
    let r = map.get(k)
    if (!r) { r = { key: k, Upcoming: 0, Completed: 0, Delayed: 0, NG: 0, total: 0 }; map.set(k, r) }
    r[b] += 1
    r.total += 1
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}
