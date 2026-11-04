import type { ActivityEntry, PartRecord, ActivityDefinition, TemplateRow } from '../../domain'
import { makeEntryId } from '../../domain'

/**
 * Lessons-learnt insight engine. Pure aggregation over the system's own track record
 * (entries, approval history, deviations, inspection/OTOP status fields). No ML — these are
 * explainable, data-derived observations phrased as insights. The same functions power the
 * Lessons Learnt module and the contextual callouts in the Part Workspace.
 */

export type InsightTone = 'risk' | 'watch' | 'good' | 'info'

export interface Insight {
  id: string
  tone: InsightTone
  /** Short headline, e.g. "Minda Industries runs late at OT". */
  title: string
  /** One-line explanation with the numbers behind it. */
  detail: string
  /** Vendor the insight is about, when vendor-specific. */
  vendorName?: string
  /** A rough 0–100 priority so the module can rank. */
  weight: number
}

export interface VendorScore {
  vendorName: string
  parts: number
  activitiesTracked: number
  approved: number
  /** First-time-right: approved with no prior "Sent back" in history. */
  firstTimeRight: number
  sentBacks: number
  /** Inspection NG occurrences across inspection-style activities. */
  ngCount: number
  inspections: number
  /** OTOP vs Non-OTOP from OTOP activities. */
  otop: number
  nonOtop: number
  deviations: number
  deviationsApproved: number
  deviationsRejected: number
  /** Count of entries currently Red (overdue) — forward-looking risk. */
  redNow: number
  /** Most common Non-OTOP / delay reason, if any. */
  topDelayReason?: string
  /** Most common NG category, if any. */
  topNgCategory?: string
}

const INSPECTION_STATUS_KEYS = ['inspection_status', 'bcf_status', 'status', 'audit_status']
const NG_CATEGORY_KEYS = ['ng_dropdown', 'ng_category']
const DELAY_REASON_KEYS = ['non_otop_reason', 'delay_reason']

function topOf(counts: Map<string, number>): string | undefined {
  let best: string | undefined
  let n = -1
  for (const [k, v] of counts) if (v > n) { best = k; n = v }
  return best
}

interface Ctx {
  entries: ActivityEntry[]
  parts: PartRecord[]
  activities: ActivityDefinition[]
  templateRows: TemplateRow[]
}

/** Build a per-vendor score from the whole track record. */
export function buildVendorScores({ entries, parts, templateRows }: Ctx): VendorScore[] {
  const partByNo = new Map(parts.map((p) => [p.partNo, p]))
  const rowById = new Map(templateRows.map((r) => [r.id, r]))
  const scores = new Map<string, VendorScore>()
  const delayReasons = new Map<string, Map<string, number>>()
  const ngCats = new Map<string, Map<string, number>>()

  const ensure = (v: string): VendorScore => {
    let s = scores.get(v)
    if (!s) {
      s = {
        vendorName: v, parts: 0, activitiesTracked: 0, approved: 0, firstTimeRight: 0, sentBacks: 0,
        ngCount: 0, inspections: 0, otop: 0, nonOtop: 0, deviations: 0, deviationsApproved: 0,
        deviationsRejected: 0, redNow: 0
      }
      scores.set(v, s)
      delayReasons.set(v, new Map())
      ngCats.set(v, new Map())
    }
    return s
  }

  // Parts per vendor (in scope of the data present).
  const partsByVendor = new Map<string, Set<string>>()
  for (const p of parts) {
    if (p.supersededBy) continue
    const set = partsByVendor.get(p.vendorName) ?? new Set()
    set.add(p.partNo)
    partsByVendor.set(p.vendorName, set)
  }
  for (const [v, set] of partsByVendor) ensure(v).parts = set.size

  for (const e of entries) {
    const part = partByNo.get(e.partNo)
    const row = rowById.get(e.templateRowId)
    if (!part || !row || part.supersededBy) continue
    const v = part.vendorName
    const s = ensure(v)
    s.activitiesTracked += 1

    // Approval / first-time-right / send-back from history.
    const hadSendBack = e.history.some((h) => h.action === 'Sent back')
    if (hadSendBack) s.sentBacks += 1
    if (e.validationState === 'Approved') {
      s.approved += 1
      if (!hadSendBack) s.firstTimeRight += 1
    }

    // Inspection NG.
    for (const k of INSPECTION_STATUS_KEYS) {
      if (k in e.values) {
        s.inspections += 1
        if (e.values[k] === 'NG') s.ngCount += 1
        break
      }
    }
    // OTOP.
    if ('otop_status' in e.values) {
      if (e.values.otop_status === 'OTOP') s.otop += 1
      else if (e.values.otop_status === 'Non-OTOP') s.nonOtop += 1
    }
    // Deviations on the entry.
    for (const d of e.deviations ?? []) {
      s.deviations += 1
      if (d.status === 'Approved') s.deviationsApproved += 1
      if (d.status === 'Rejected') s.deviationsRejected += 1
    }
    // Delay / NG reasons for the "top reason" insight.
    for (const k of DELAY_REASON_KEYS) {
      const val = e.values[k]
      if (typeof val === 'string' && val.trim()) {
        const m = delayReasons.get(v)!
        m.set(val, (m.get(val) ?? 0) + 1)
      }
    }
    // Table-style NG rows (PP11 "NG details"): one category per row.
    if (Array.isArray(e.values['ng_rows'])) {
      for (const row of e.values['ng_rows']) {
        if (row?.cat) {
          const m = ngCats.get(v)!
          m.set(row.cat, (m.get(row.cat) ?? 0) + 1)
        }
      }
    }
    for (const k of NG_CATEGORY_KEYS) {
      const val = e.values[k]
      const arr = Array.isArray(val) ? val : typeof val === 'string' && val ? [val] : []
      for (const cat of arr) {
        const m = ngCats.get(v)!
        m.set(cat, (m.get(cat) ?? 0) + 1)
      }
    }
  }

  for (const [v, s] of scores) {
    s.topDelayReason = topOf(delayReasons.get(v)!)
    s.topNgCategory = topOf(ngCats.get(v)!)
  }

  return Array.from(scores.values())
    .filter((s) => s.activitiesTracked > 0)
    .sort((a, b) => b.activitiesTracked - a.activitiesTracked)
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100)
}

/** Turn vendor scores into ranked, human-readable lessons-learnt insights. */
export function buildInsights(scores: VendorScore[]): Insight[] {
  const out: Insight[] = []
  for (const s of scores) {
    // First-time-right (quality of submissions).
    if (s.approved + s.sentBacks >= 2) {
      const ftr = pct(s.firstTimeRight, s.approved || 1)
      if (ftr < 60 && s.sentBacks >= 1) {
        out.push({
          id: `ftr-${s.vendorName}`, tone: 'risk', vendorName: s.vendorName,
          title: `${s.vendorName}: low first-time-right`,
          detail: `${s.sentBacks} submission${s.sentBacks === 1 ? '' : 's'} sent back; only ${ftr}% approved on first pass. Plan an extra validation cycle.`,
          weight: 80 - ftr
        })
      } else if (ftr >= 85) {
        out.push({
          id: `ftr-${s.vendorName}`, tone: 'good', vendorName: s.vendorName,
          title: `${s.vendorName}: strong first-time-right`,
          detail: `${ftr}% of submissions approved on the first pass — reliable on documentation.`,
          weight: 20
        })
      }
    }
    // NG / rework.
    if (s.inspections >= 2 && s.ngCount >= 1) {
      const ng = pct(s.ngCount, s.inspections)
      out.push({
        id: `ng-${s.vendorName}`, tone: ng >= 40 ? 'risk' : 'watch', vendorName: s.vendorName,
        title: `${s.vendorName}: inspection NG rate ${ng}%`,
        detail: `${s.ngCount} of ${s.inspections} inspections NG${s.topNgCategory ? ` (most common: ${s.topNgCategory})` : ''}. Budget a re-inspection cycle.`,
        weight: 40 + ng
      })
    }
    // OTOP.
    if (s.otop + s.nonOtop >= 2 && s.nonOtop >= 1) {
      const nonOtopPct = pct(s.nonOtop, s.otop + s.nonOtop)
      out.push({
        id: `otop-${s.vendorName}`, tone: nonOtopPct >= 40 ? 'risk' : 'watch', vendorName: s.vendorName,
        title: `${s.vendorName}: ${nonOtopPct}% Non-OTOP`,
        detail: `${s.nonOtop} of ${s.otop + s.nonOtop} OTOP checks missed${s.topDelayReason ? ` — recurring reason: ${s.topDelayReason}` : ''}.`,
        weight: 45 + nonOtopPct
      })
    }
    // Deviation propensity.
    if (s.deviations >= 2) {
      out.push({
        id: `dev-${s.vendorName}`, tone: 'watch', vendorName: s.vendorName,
        title: `${s.vendorName}: ${s.deviations} deviations raised`,
        detail: `${s.deviationsApproved} approved, ${s.deviationsRejected} rejected. Frequent deviations — review tolerance/spec alignment upfront.`,
        weight: 35 + s.deviations * 3
      })
    }
  }
  return out.sort((a, b) => b.weight - a.weight)
}

/** Insights for one vendor (contextual callout). Falls back to a neutral note when there's little history. */
export function vendorInsights(ctx: Ctx, vendorName: string): Insight[] {
  const score = buildVendorScores(ctx).find((s) => s.vendorName === vendorName)
  if (!score) return []
  return buildInsights([score])
}

export { makeEntryId }

// ── Heat maps ────────────────────────────────────────────────────────────────

export type HeatLevel = 'good' | 'ok' | 'poor' | 'none'

export interface HeatCell {
  level: HeatLevel
  /** Count of tracked entries behind the cell (0 = none, shown blank). */
  n: number
  /** Short tooltip, e.g. "2/3 OK · 1 sent back". */
  note: string
}

export interface HeatMap {
  /** Row keys (vendors, or activity ids in the single-vendor view). */
  rows: string[]
  /** Column keys + labels. */
  cols: { key: string; label: string }[]
  /** cell[rowKey][colKey]. */
  cell: Record<string, Record<string, HeatCell>>
  /** Optional display label per row key (used when rows are activity ids). */
  rowLabels?: Record<string, string>
}

/** Score one bucket of entries into a heat level from NG / send-back / approval signals. */
function scoreEntries(es: { ng: number; inspections: number; sentBack: number; total: number; approved: number }): HeatCell {
  const { ng, inspections, sentBack, total, approved } = es
  if (total === 0) return { level: 'none', n: 0, note: 'No activity' }
  // Poor if any NG or multiple send-backs; good if clean + mostly approved; else ok.
  const parts: string[] = []
  if (inspections > 0) parts.push(`${inspections - ng}/${inspections} OK`)
  if (sentBack > 0) parts.push(`${sentBack} sent back`)
  if (approved > 0) parts.push(`${approved} approved`)
  const note = parts.join(' · ') || `${total} tracked`
  let level: HeatLevel = 'ok'
  if (ng > 0 || sentBack >= 2) level = 'poor'
  else if (sentBack === 0 && (inspections > 0 || approved > 0)) level = 'good'
  return { level, n: total, note }
}

interface HeatRow { ng: number; inspections: number; sentBack: number; total: number; approved: number }
function emptyRow(): HeatRow { return { ng: 0, inspections: 0, sentBack: 0, total: 0, approved: 0 } }

function tally(row: HeatRow, e: ActivityEntry) {
  row.total += 1
  if (e.history.some((h) => h.action === 'Sent back')) row.sentBack += 1
  if (e.validationState === 'Approved') row.approved += 1
  for (const k of INSPECTION_STATUS_KEYS) {
    if (k in e.values) { row.inspections += 1; if (e.values[k] === 'NG') row.ng += 1; break }
  }
}

/** Vendor (rows) × activity (cols) heat map, optionally filtered to one technical category. */
export function buildActivityHeatMap({ entries, parts, activities, templateRows }: Ctx, categoryFilter?: string): HeatMap {
  const partByNo = new Map(parts.map((p) => [p.partNo, p]))
  const rowById = new Map(templateRows.map((r) => [r.id, r]))
  const actById = new Map(activities.map((a) => [a.id, a]))
  const order = ['PP', 'MPP', 'Pilot', 'SOP']

  const buckets = new Map<string, Map<string, HeatRow>>() // vendor -> activityId -> row
  const activityUse = new Map<string, { label: string; ms: string }>()
  const vendors = new Set<string>()

  for (const e of entries) {
    const part = partByNo.get(e.partNo)
    const row = rowById.get(e.templateRowId)
    const act = row ? actById.get(row.activityId) : undefined
    if (!part || !row || !act || part.supersededBy) continue
    if (categoryFilter && categoryFilter !== 'All' && (part.technicalCategory ?? 'OtherAssy') !== categoryFilter) continue
    vendors.add(part.vendorName)
    activityUse.set(act.id, { label: act.name, ms: row.milestoneId })
    const byAct = buckets.get(part.vendorName) ?? new Map()
    const r = byAct.get(act.id) ?? emptyRow()
    tally(r, e)
    byAct.set(act.id, r)
    buckets.set(part.vendorName, byAct)
  }

  const cols = Array.from(activityUse.entries())
    .sort((a, b) => (order.indexOf(a[1].ms) + 1 || 99) - (order.indexOf(b[1].ms) + 1 || 99) || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([key, v]) => ({ key, label: v.label }))
  const rows = Array.from(vendors).sort()
  const cell: Record<string, Record<string, HeatCell>> = {}
  for (const v of rows) {
    cell[v] = {}
    for (const c of cols) cell[v][c.key] = scoreEntries(buckets.get(v)?.get(c.key) ?? emptyRow())
  }
  return { rows, cols, cell }
}

/** Vendor (rows) × technical category (cols) heat map. */
/**
 * Single-vendor heat map with ACTIVITIES as rows and one Performance column, so you see one vendor's
 * performance across each activity it works on. Optional technical-category filter.
 */
export function buildVendorActivityHeatMap(
  { entries, parts, activities, templateRows }: Ctx,
  vendorName: string,
  categoryFilter?: string
): HeatMap {
  const partByNo = new Map(parts.map((p) => [p.partNo, p]))
  const rowById = new Map(templateRows.map((r) => [r.id, r]))
  const actById = new Map(activities.map((a) => [a.id, a]))
  const order = ['PP', 'MPP', 'Pilot', 'SOP']
  const byAct = new Map<string, HeatRow>()
  const actMeta = new Map<string, { label: string; ms: string }>()
  for (const e of entries) {
    const part = partByNo.get(e.partNo)
    const row = rowById.get(e.templateRowId)
    const act = row ? actById.get(row.activityId) : undefined
    if (!part || !row || !act || part.supersededBy) continue
    if (part.vendorName !== vendorName) continue
    if (categoryFilter && categoryFilter !== 'All' && (part.technicalCategory ?? 'OtherAssy') !== categoryFilter) continue
    actMeta.set(act.id, { label: act.name, ms: row.milestoneId })
    const r = byAct.get(act.id) ?? emptyRow()
    tally(r, e)
    byAct.set(act.id, r)
  }
  const rows = Array.from(actMeta.entries())
    .sort((a, b) => (order.indexOf(a[1].ms) + 1 || 99) - (order.indexOf(b[1].ms) + 1 || 99) || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([id]) => id)
  const cols = [{ key: 'perf', label: 'Performance' }]
  const cell: Record<string, Record<string, HeatCell>> = {}
  const rowLabels: Record<string, string> = {}
  for (const id of rows) {
    rowLabels[id] = actMeta.get(id)!.label
    cell[id] = { perf: scoreEntries(byAct.get(id) ?? emptyRow()) }
  }
  return { rows, cols, cell, rowLabels }
}

// ── Rule-based prediction (forecast) ─────────────────────────────────────────

export type RiskLevel = 'High' | 'Medium' | 'Low'
export type Confidence = 'High' | 'Medium' | 'Low'

export interface RiskPrediction {
  partNo: string
  partName: string
  vendorName: string
  activityId: string
  activityName: string
  milestoneId: string
  level: RiskLevel
  /** 0–100 score used for ranking. */
  score: number
  confidence: Confidence
  /** The reasons behind the projection (transparent, rule-based). */
  reasons: string[]
  /** Predicted outcome, e.g. "Likely late at OT" / "Likely NG (re-inspection)". */
  outcome: string
}

/** Narrow a vendor's history to the activities sharing a family (by shared status keys). */
function familyRates(
  entries: ActivityEntry[], partByNo: Map<string, PartRecord>, rowById: Map<string, TemplateRow>,
  vendorName: string, activityId: string
): { total: number; late: number; ng: number; inspections: number; sentBack: number; otopMiss: number; otopTotal: number } {
  let total = 0, late = 0, ng = 0, inspections = 0, sentBack = 0, otopMiss = 0, otopTotal = 0
  for (const e of entries) {
    const part = partByNo.get(e.partNo)
    const row = rowById.get(e.templateRowId)
    if (!part || !row || part.supersededBy || part.vendorName !== vendorName) continue
    if (row.activityId !== activityId) continue // same activity across models = the relevant track record
    total += 1
    if (e.history.some((h) => h.action === 'Sent back')) sentBack += 1
    for (const k of INSPECTION_STATUS_KEYS) {
      if (k in e.values) { inspections += 1; if (e.values[k] === 'NG') ng += 1; break }
    }
    if ('otop_status' in e.values) {
      otopTotal += 1
      if (e.values.otop_status === 'Non-OTOP') otopMiss += 1
    }
    if (e.values.actual_date_beyond_mrd === 'Y' || e.values.correction_beyond_mrd === true) late += 1
  }
  return { total, late, ng, inspections, sentBack, otopMiss, otopTotal }
}

/**
 * Rule-based delay/quality forecast for every OPEN (not Approved, not Not-applicable) activity instance.
 * Combines the vendor's track record on the same activity with how close the planned date is (ryg).
 * Transparent — each prediction lists the rules that fired. Not a trained model.
 */
export function predictRisk(ctx: Ctx, instanceRyg: { partNo: string; activityId: string; templateRowId: string; ryg: string }[]): RiskPrediction[] {
  const { entries, parts, activities, templateRows } = ctx
  const partByNo = new Map(parts.map((p) => [p.partNo, p]))
  const rowById = new Map(templateRows.map((r) => [r.id, r]))
  const actById = new Map(activities.map((a) => [a.id, a]))
  const rygByKey = new Map(instanceRyg.map((i) => [`${i.templateRowId}|${i.partNo}`, i.ryg]))

  const out: RiskPrediction[] = []
  for (const e of entries) {
    if (e.validationState === 'Approved' || e.notApplicable) continue
    const part = partByNo.get(e.partNo)
    const row = rowById.get(e.templateRowId)
    const act = row ? actById.get(row.activityId) : undefined
    if (!part || !row || !act || part.supersededBy) continue

    const r = familyRates(entries, partByNo, rowById, part.vendorName, row.activityId)
    const ryg = rygByKey.get(`${row.id}|${part.partNo}`) ?? 'Green'

    let score = 0
    const reasons: string[] = []
    let outcome = 'On track'

    // Proximity to the planned date.
    if (ryg === 'Red') { score += 45; reasons.push('already past planned date') }
    else if (ryg === 'Yellow') { score += 25; reasons.push('planned date within 7 days') }

    // Vendor late history on this activity.
    const latePct = pct(r.late, r.total)
    if (r.total >= 2 && latePct >= 40) { score += 25; reasons.push(`vendor late on ${r.late}/${r.total} past ${act.name.split(' ').slice(0, 2).join(' ')}`) }

    // NG history → predict rework.
    const ngPct = pct(r.ng, r.inspections || 1)
    if (r.inspections >= 2 && ngPct >= 40) { score += 20; reasons.push(`NG on ${r.ng}/${r.inspections} past inspections`); outcome = 'Likely NG — plan re-inspection' }

    // OTOP miss history.
    if (r.otopTotal >= 2 && r.otopMiss >= 1) { score += 15; reasons.push(`missed OTOP ${r.otopMiss}/${r.otopTotal} times`); if (outcome === 'On track') outcome = 'Likely late at OTOP' }

    // Repeated send-backs.
    if (r.total >= 2 && pct(r.sentBack, r.total) >= 40) { score += 12; reasons.push(`${r.sentBack}/${r.total} submissions sent back before`) }

    if (reasons.length === 0) continue // nothing noteworthy to predict
    if (outcome === 'On track' && score >= 25) outcome = 'Likely to slip'

    const level: RiskLevel = score >= 55 ? 'High' : score >= 30 ? 'Medium' : 'Low'
    const confidence: Confidence = r.total >= 4 ? 'High' : r.total >= 2 ? 'Medium' : 'Low'

    out.push({
      partNo: part.partNo, partName: part.partName, vendorName: part.vendorName,
      activityId: act.id, activityName: act.name, milestoneId: row.milestoneId,
      level, score: Math.min(100, score), confidence, reasons, outcome
    })
  }
  return out.sort((a, b) => b.score - a.score)
}
