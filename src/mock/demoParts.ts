/**
 * TEMPORARY authoring aid: builds sample parts + sample entries from the CURRENT activity definitions, so the
 * owner can keep editing activity fields and re-populate parts that show the updated fields.
 * Used by the "Load sample parts" button (AppLayout). Remove together with that button.
 */
import { makeEntryId } from '../domain'
import { deriveTechnicalCategory } from '../domain/timelineCatalog'
import type {
  Action,
  ActivityDefinition,
  ActivityEntry,
  DelayReason,
  Deviation,
  FieldDefinition,
  HistoryLog,
  ModelRecord,
  NgRound,
  PartAck,
  PartRecord,
  PartRelease,
  TemplateRow
} from '../domain'
import { addDays, getFilteredData, evaluateCalculatedFields, evaluateConditionalRules, getMilestoneMrd, rowsFromActivityTable, rowsFromCount } from '../engine'
import { subTypeMrdKey } from '../domain/timelineCatalog'
import { sapTier2Rows } from './index'
import { sampleIntakeAttrs } from './partIntakeFields'

const NOW = '2026-10-15T09:00:00Z'

interface DemoPartSeed {
  partNo: string
  partName: string
  model: string
  vendorName: string
  vendorCode: string
  department: string
  pic: string
  type: 'NewPart' | 'ECN'
  /** 'ack' = released + acknowledged, 'wait' = released, awaiting acknowledgement, 'none' = not released. */
  release: 'ack' | 'wait' | 'none'
}

const DEMO_PARTS: DemoPartSeed[] = [
  { partNo: '31100-M74LD0', partName: 'Headlamp Assy LH', model: 'Swift', vendorName: 'Minda Industries', vendorCode: 'V1001', department: 'Lighting', pic: 'Rahul Verma', type: 'NewPart', release: 'ack' },
  { partNo: '31100-M74LD1', partName: 'Headlamp Assy RH', model: 'Swift', vendorName: 'Minda Industries', vendorCode: 'V1001', department: 'Lighting', pic: 'Rahul Verma', type: 'ECN', release: 'ack' },
  { partNo: '71811-M82P00', partName: 'Front Bumper Panel', model: 'Brezza', vendorName: 'Subros Limited', vendorCode: 'V1004', department: 'Body', pic: 'Anita Desai', type: 'NewPart', release: 'ack' },
  { partNo: '71811-M82P01', partName: 'Rear Bumper Panel', model: 'Brezza', vendorName: 'Subros Limited', vendorCode: 'V1004', department: 'Body', pic: 'Anita Desai', type: 'NewPart', release: 'wait' },
  { partNo: '35520-M68P00', partName: 'Door Wiring Harness', model: 'Baleno', vendorName: 'Minda Industries', vendorCode: 'V1001', department: 'Electrical', pic: 'Suresh Nair', type: 'NewPart', release: 'ack' },
  { partNo: '84701-M55R10', partName: 'Piston Pin', model: 'Dzire', vendorName: 'Bosch India', vendorCode: 'V1003', department: 'Engine', pic: 'Suresh Nair', type: 'NewPart', release: 'ack' },
  { partNo: '95100-M82P10', partName: 'Instrument Cluster Trim', model: 'Fronx', vendorName: 'Denso India', vendorCode: 'V1002', department: 'Interior', pic: 'Anita Desai', type: 'ECN', release: 'ack' },
  { partNo: '39100-M74F00', partName: 'Door Weatherstrip', model: 'Grand Vitara', vendorName: 'Sanden Vikas', vendorCode: 'V1005', department: 'Body', pic: 'Rahul Verma', type: 'NewPart', release: 'none' }
]

/** A plausible value for one field. `n` varies the pick between parts/fields so the lists look mixed. */
function sampleValue(field: FieldDefinition, n: number, mrd: string, partNo: string): any {
  const opts = field.options ?? []
  switch (field.type) {
    case 'yesNo':
      return n % 7 === 3 ? 'N' : 'Y'
    case 'dropdown':
      return opts.length ? opts[n % opts.length] : ''
    case 'multiSelect':
      return opts.length ? [opts[n % opts.length]] : []
    case 'number':
      return 5 + (n % 20)
    case 'percent':
      return 80 + (n % 21)
    case 'date':
      return addDays(mrd, -12 + (n % 15))
    case 'longText':
      return `Sample note for ${partNo}`
    case 'file':
      return `evidence_${partNo}.pdf`
    case 'flag':
      return n % 5 === 0
    case 'table': {
      const cols = field.columns ?? []
      return [0, 1].map((r) =>
        Object.fromEntries(
          cols.map((c, ci) => {
            const k = n + r + ci
            const o = c.options ?? []
            const v =
              c.type === 'dropdown' ? (o.length ? o[k % o.length] : '')
              : c.type === 'number' ? 2 + (k % 8)
              : c.type === 'date' ? addDays(mrd, -8 + (k % 10))
              : `${c.label} ${r + 1}`
            return [c.key, v]
          })
        )
      )
    }
    default:
      return `${field.label} – sample ${1 + (n % 3)}`
  }
}

export interface DemoData {
  parts: PartRecord[]
  entries: ActivityEntry[]
  partReleases: PartRelease[]
  partAcks: PartAck[]
  delayReasons: DelayReason[]
  /** Models with sample-adjusted dates (so some activities are late). Replace the store's models on load. */
  models: ModelRecord[]
}

export function buildDemoData(
  activities: ActivityDefinition[],
  templateRows: TemplateRow[],
  baseModels: ModelRecord[]
): DemoData {
  // Swift is already well into PP in the sample, so its PP sub-type dates have passed and its activities run late.
  const models: ModelRecord[] = baseModels.map((m) =>
    m.name === 'Swift' && (m.mrds.PP ?? '') >= '2026-10-20' // only once: skip if already shifted by an earlier load
      ? { ...m, mrds: Object.fromEntries(Object.entries(m.mrds).map(([k, v]) => [k, k === 'PP' || k.startsWith('PP:') ? addDays(v, -14) : v])) }
      : m
  )
  const parts: PartRecord[] = DEMO_PARTS.map((p, idx) => {
    const rec: PartRecord = {
      partNo: p.partNo,
      partName: p.partName,
      model: p.model,
      vendorCode: p.vendorCode,
      vendorName: p.vendorName,
      department: p.department,
      section: 'NP1',
      pic: p.pic,
      type: p.type,
      // Part numbers come from ENOVIA; some arrive through the SAP feed, so the sample mixes both.
      origin: idx % 3 === 0 ? 'SAP' : 'ENOVIA',
      attrs: sampleIntakeAttrs(p.partNo, idx)
    }
    return { ...rec, technicalCategory: deriveTechnicalCategory(rec) }
  })
  const partReleases: PartRelease[] = []
  const partAcks: PartAck[] = []
  DEMO_PARTS.forEach((p) => {
    if (p.release === 'none') return
    partReleases.push({ id: `rel-${p.partNo}`, partNo: p.partNo, released: true, by: p.pic, byRole: 'PIC', at: '2026-10-04T10:00:00Z' })
    if (p.release === 'ack') {
      partAcks.push({ id: `ack-${p.partNo}`, partNo: p.partNo, status: 'Acknowledged', by: p.vendorName, byRole: 'Vendor', at: '2026-10-05T09:00:00Z' })
    }
  })

  const entries: ActivityEntry[] = []
  const actById = new Map(activities.map((a) => [a.id, a]))
  parts.forEach((part, pi) => {
    const model = models.find((m) => m.name === part.model)
    templateRows
      .filter((r) => r.section === part.section)
      .forEach((row, ri) => {
        const def = actById.get(row.activityId)
        if (!def) return
        // Scenario cycles so every part shows a mix of states.
        const scenario = (pi + ri) % 5 // 0 approved, 1 submitted, 2 sent back, 3 draft, 4 untouched
        if (scenario === 4) return
        const mrd = getMilestoneMrd(model, row.subType ? subTypeMrdKey(row.milestoneId, row.subType) : row.milestoneId) ?? '2026-10-24'
        const vendorFlow = def.flow.steps.length > 1
        let values: Record<string, any> = {}
        def.fields.forEach((f, fi) => {
          if (f.dataOnly) return // fed by the system, not entered
          if (scenario === 3 && fi % 2 === 1) return // draft = half filled
          values[f.key] = sampleValue(f, pi * 3 + ri + fi, mrd, part.partNo)
        })
        // Derived tables: SAP rows, or rows taken from the earlier activity's table (PP04 is built before PP05).
        for (const f of def.fields) {
          const d = f.derivedRows
          if (!d || !(f.key in values)) continue
          // Derived columns replace the generated sample cells; the other columns keep their sample values.
          const sample: Record<string, any>[] = Array.isArray(values[f.key]) ? values[f.key] : []
          let incoming: Record<string, any>[]
          if (d.from === 'sap') {
            incoming = sapTier2Rows(part.partNo)
          } else if (d.from === 'count') {
            // Keep the sample counts small and consistent: agree + disagree = total, 1–2 disagreed points per category.
            const srcRows: Record<string, any>[] = Array.isArray(values[d.fieldKey]) ? values[d.fieldKey] : []
            srcRows.forEach((r, i) => {
              r.total = 5
              r.disagree = (i % 2) + 1
              r.agree = 5 - r.disagree
            })
            incoming = rowsFromCount(srcRows, d)
          } else {
            const src = entries.find((e) => e.activityId === d.activityId && e.partNo === part.partNo)?.values[d.fieldKey]
            incoming = rowsFromActivityTable(src, d.where, ['code', 'name'])
          }
          values[f.key] = incoming.map((r, i) => ({ ...(sample[i % Math.max(sample.length, 1)] ?? {}), ...r }))
        }
        // Make the random sample numbers satisfy the activity's sum rules so sample parts open without warnings.
        for (const rule of def.validationRules ?? []) {
          if (rule.scope === 'fields') {
            if (rule.op === '<=' && rule.left.length === 1 && rule.right.length === 1 && !rule.left[0].includes('.') && !rule.right[0].includes('.')) {
              const cap = Number(values[rule.right[0]])
              if (Number.isFinite(cap) && Number(values[rule.left[0]]) > cap) values[rule.left[0]] = cap
            }
          } else {
            const rows: Record<string, any>[] = Array.isArray(values[rule.scope.tableField]) ? values[rule.scope.tableField] : []
            if (rule.op === '=' && rule.right.length === 1 && rule.left.length >= 1) {
              for (const r of rows) {
                const last = rule.left[rule.left.length - 1]
                const others = rule.left.slice(0, -1).reduce((t, k) => t + (Number(r[k]) || 0), 0)
                r[last] = Math.max(0, (Number(r[rule.right[0]]) || 0) - others)
              }
            }
          }
        }
        values = evaluateCalculatedFields(def, values, part, mrd)
        // Drop values of hidden fields; repeat because hiding one field can hide fields that depend on it.
        for (let pass = 0; pass < 4; pass++) {
          const cond = evaluateConditionalRules(def.fields, values)
          const hidden = def.fields.filter((f) => cond[f.key] && !cond[f.key].visible && f.key in values)
          if (hidden.length === 0) break
          for (const f of hidden) delete values[f.key]
        }

        const history: HistoryLog[] = []
        let validationState: ActivityEntry['validationState'] = 'Draft'
        let step = 0
        if (scenario === 0) {
          validationState = 'Approved'
          step = def.flow.steps.length - 1
          if (vendorFlow) history.push({ timestamp: '2026-10-08T10:00:00Z', persona: 'Vendor', action: 'Submitted' })
          history.push({ timestamp: '2026-10-09T10:00:00Z', persona: 'PIC', actorName: part.pic, action: 'Approved' })
        } else if (scenario === 1 && vendorFlow) {
          validationState = 'Submitted'
          step = 1
          history.push({ timestamp: '2026-10-13T10:00:00Z', persona: 'Vendor', action: 'Submitted' })
        } else if (scenario === 2 && vendorFlow) {
          validationState = 'Sent back'
          history.push({ timestamp: '2026-10-12T10:00:00Z', persona: 'Vendor', action: 'Submitted' })
          history.push({ timestamp: '2026-10-13T10:00:00Z', persona: 'PIC', actorName: part.pic, action: 'Sent back', comment: 'Please re-check the values and resubmit.' })
        } else if (scenario === 1 || scenario === 2) {
          // PIC-only activity: show it as approved so the list stays varied
          validationState = 'Approved'
          step = 0
          history.push({ timestamp: '2026-10-09T10:00:00Z', persona: 'PIC', actorName: part.pic, action: 'Approved' })
        }
        entries.push({
          id: makeEntryId(row.id, part.partNo),
          templateRowId: row.id,
          activityId: row.activityId,
          partNo: part.partNo,
          values,
          validationState,
          history,
          currentStepIndex: step,
          updatedAt: NOW,
          updatedBy: validationState === 'Submitted' || validationState === 'Draft' ? (vendorFlow ? 'Vendor' : 'PIC') : 'PIC'
        })
      })
  })

  const delayReasons = seedExceptions(entries, parts)
  delayReasons.push(...seedVendorDelays(entries, parts, activities, templateRows, models, partReleases, partAcks, delayReasons))
  return { parts, entries, partReleases, partAcks, delayReasons, models }
}

const SAMPLE_TODAY = '2026-10-15'

/**
 * Create 10 late activities that wait on the vendor for a delay reason. Picks activities whose planned end has
 * passed, on acknowledged parts, where the vendor enters first. Their entry goes back to Draft (or is dropped), so
 * the vendor owes a reason. Two of them already had a reason sent back by the PIC. Spread across parts.
 */
function seedVendorDelays(
  entries: ActivityEntry[],
  parts: PartRecord[],
  activities: ActivityDefinition[],
  templateRows: TemplateRow[],
  models: ModelRecord[],
  releases: PartRelease[],
  acks: PartAck[],
  existing: DelayReason[]
): DelayReason[] {
  const taken = new Set(existing.map((r) => r.entryId))
  const acked = new Set(acks.filter((a) => a.status === 'Acknowledged').map((a) => a.partNo))
  const released = new Set(releases.filter((r) => r.released).map((r) => r.partNo))
  const insts = getFilteredData(
    entries, activities, parts, templateRows, models,
    { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' }, 'overview', SAMPLE_TODAY
  ).filter((i) => {
    const a = i.activity
    return (
      acked.has(i.part.partNo) && released.has(i.part.partNo) && !i.notApplicable &&
      i.dates.status === 'resolved' && i.dates.end < SAMPLE_TODAY &&
      a.flow.steps[0]?.role === 'Vendor' && a.fields.some((f) => f.enteredBy === 'Vendor' && f.source !== 'calculated') &&
      !taken.has(makeEntryId(i.row.id, i.part.partNo))
    )
  })
  // Only the 10 chosen below should wait on the vendor. Any other late item the vendor holds is shown as already submitted.
  const settle = (i: (typeof insts)[number]) => {
    const id = makeEntryId(i.row.id, i.part.partNo)
    const e = entries.find((x) => x.id === id)
    if (e) {
      if (e.validationState === 'Draft' || e.validationState === 'Sent back') {
        e.validationState = 'Submitted'
        e.currentStepIndex = 1
        e.history = [{ timestamp: '2026-10-13T10:00:00Z', persona: 'Vendor', action: 'Submitted' }]
      }
    } else {
      entries.push({
        id, templateRowId: i.row.id, activityId: i.activity.id, partNo: i.part.partNo, values: {}, validationState: 'Submitted',
        history: [{ timestamp: '2026-10-13T10:00:00Z', persona: 'Vendor', action: 'Submitted' }], currentStepIndex: 1,
        updatedAt: NOW, updatedBy: 'Vendor'
      })
    }
  }
  // Round-robin across parts so the delays are not all on one part.
  const byPart = new Map<string, typeof insts>()
  // The vendor persona is Minda Industries, so the delays to respond to are on Minda's parts.
  for (const i of insts.filter((x) => x.part.vendorName === 'Minda Industries')) byPart.set(i.part.partNo, [...(byPart.get(i.part.partNo) ?? []), i])
  const picked: typeof insts = []
  for (let round = 0; picked.length < 10; round++) {
    let added = false
    for (const list of byPart.values()) {
      if (list[round] && picked.length < 10) { picked.push(list[round]); added = true }
    }
    if (!added) break
  }
  for (const i of insts) if (!picked.includes(i)) settle(i)
  const out: DelayReason[] = []
  picked.forEach((i, n) => {
    const id = makeEntryId(i.row.id, i.part.partNo)
    const e = entries.find((x) => x.id === id)
    if (e) {
      e.validationState = n % 3 === 2 ? 'Sent back' : 'Draft'
      e.currentStepIndex = 0
      e.history = e.validationState === 'Sent back'
        ? [{ timestamp: '2026-10-10T10:00:00Z', persona: 'PIC', actorName: i.part.pic, action: 'Sent back', comment: 'Incomplete, please redo.' }]
        : []
    }
    // Two reasons the PIC already sent back: the vendor must give a new one.
    if (n === 4 || n === 7) {
      out.push({
        id: `delay-sample-sb-${n}`, entryId: id, rowId: i.row.id, partNo: i.part.partNo, activityId: i.activity.id,
        category: 'Others', remark: 'Will complete soon.', revisedDate: undefined, by: i.part.vendorName, byRole: 'Vendor',
        at: '2026-10-12T08:00:00Z', plannedEnd: i.dates.status === 'resolved' ? i.dates.end : SAMPLE_TODAY, status: 'SentBack',
        decidedBy: i.part.pic, decidedAt: '2026-10-13T09:00:00Z', decisionComment: 'Give a firm revised date and the root cause.'
      })
    }
  })
  return out
}

const DEV_FLOW = ['PIC', 'SIC', 'DPM'] as const

/**
 * Attach a varied set of deviations, actions and NG rounds to a handful of existing entries, and build a few
 * delay-reason records, so all four Exception Management tabs (and the "needs your attention" list) show content
 * for the PIC, SIC and Vendor personas. Only touches entries that were actually created above.
 */
function seedExceptions(entries: ActivityEntry[], parts: PartRecord[]): DelayReason[] {
  const vendorByPart = new Map(parts.map((p) => [p.partNo, p.vendorName]))
  const picByPart = new Map(parts.map((p) => [p.partNo, p.pic]))
  /** First entry for a part whose activity id matches, else any entry for the part. */
  const find = (partNo: string, activityId?: string): ActivityEntry | undefined =>
    (activityId ? entries.find((e) => e.partNo === partNo && e.activityId === activityId) : undefined) ??
    entries.find((e) => e.partNo === partNo)

  // ── Deviations (PIC → SIC → DPM) in a mix of stages ──
  const dev = (
    e: ActivityEntry | undefined,
    seq: number,
    title: string,
    currentStep: number,
    status: Deviation['status'],
    targetDate: string,
    description: string,
    edocNumber: string
  ) => {
    if (!e) return
    const pic = picByPart.get(e.partNo) ?? 'Rahul Verma'
    const history: Deviation['history'] = [
      { at: '2026-10-09T09:30:00Z', by: pic, byRole: 'PIC', action: 'Raised', comment: description }
    ]
    if (status === 'Approved') {
      history.push({ at: '2026-10-10T11:00:00Z', by: pic, byRole: 'PIC', action: 'Approved at PIC' })
      history.push({ at: '2026-10-11T12:00:00Z', by: 'SIC', byRole: 'SIC', action: 'Approved at SIC' })
      history.push({ at: '2026-10-12T14:00:00Z', by: 'DPM', byRole: 'DPM', action: 'Approved at DPM' })
    } else if (status === 'Sent back') {
      history.push({ at: '2026-10-10T11:00:00Z', by: 'SIC', byRole: 'SIC', action: 'Sent back', comment: 'Attach the measurement report before resubmitting.' })
    } else if (currentStep >= 1) {
      history.push({ at: '2026-10-10T11:00:00Z', by: pic, byRole: 'PIC', action: 'Approved at PIC' })
    }
    const d: Deviation = {
      id: `dev-sample-${seq}`,
      title,
      description,
      edocNumber,
      targetDate,
      flow: [...DEV_FLOW],
      currentStep,
      status,
      raisedBy: pic,
      raisedByRole: 'PIC',
      raisedAt: '2026-10-09T09:30:00Z',
      decidedAt: status === 'Approved' || status === 'Rejected' ? '2026-10-12T14:00:00Z' : undefined,
      history
    }
    e.deviations = [...(e.deviations ?? []), d]
  }

  // In progress, awaiting SIC (step 1) — shows in SIC's "needs attention".
  dev(find('31100-M74LD0', 'pp-2'), 1, 'Dimensional deviation on mounting boss', 1, 'In progress', '2026-10-28', 'Boss height 0.4 mm above drawing; requesting temporary acceptance for PP lot.', 'EDOC-2026-0411')
  // In progress, awaiting PIC (step 0) — shows in PIC's "needs attention".
  dev(find('71811-M82P00', 'pp-3'), 2, 'Material grade substitution', 0, 'In progress', '2026-11-02', 'Vendor proposes equivalent PP-TD20 in place of specified grade pending approval.', 'EDOC-2026-0417')
  // Sent back — back at PIC (step 0).
  dev(find('35520-M68P00', 'pp-4'), 3, 'Connector keying mismatch', 0, 'Sent back', '2026-10-30', 'Keying orientation differs from master sample; deviation raised for pilot build.', 'EDOC-2026-0421')
  // Approved — closed, shows in the register.
  dev(find('84701-M55R10', 'pp-5'), 4, 'Surface finish Ra out of band', 2, 'Approved', '2026-10-20', 'Pin surface Ra 0.9 vs 0.8 max; accepted with monitoring.', 'EDOC-2026-0402')

  // ── Actions (recommendations), a mix of assignees and statuses ──
  const act = (
    e: ActivityEntry | undefined,
    seq: number,
    title: string,
    assignedTo: Action['assignedTo'],
    status: Action['status'],
    targetDate: string | undefined,
    description: string,
    createdByRole: Action['createdByRole'],
    createdBy: string
  ) => {
    if (!e) return
    const assignedToName = assignedTo === 'Vendor' ? vendorByPart.get(e.partNo) : undefined
    const log: Action['history'] = [{ at: '2026-10-09T10:00:00Z', by: createdBy, byRole: createdByRole, action: 'Raised', comment: description }]
    if (status === 'In progress') log.push({ at: '2026-10-11T10:00:00Z', by: assignedToName ?? assignedTo, byRole: assignedTo, action: 'In progress' })
    if (status === 'Done') {
      log.push({ at: '2026-10-11T10:00:00Z', by: assignedToName ?? assignedTo, byRole: assignedTo, action: 'In progress' })
      log.push({ at: '2026-10-13T10:00:00Z', by: assignedToName ?? assignedTo, byRole: assignedTo, action: 'Marked done' })
    }
    const a: Action = {
      id: `act-sample-${seq}`,
      title,
      description,
      assignedTo,
      assignedToName,
      targetDate,
      status,
      createdBy,
      createdByRole,
      createdAt: '2026-10-09T10:00:00Z',
      completedAt: status === 'Done' ? '2026-10-13T10:00:00Z' : undefined,
      history: log
    }
    e.actions = [...(e.actions ?? []), a]
  }

  // Open action on the vendor, overdue — PIC sees it as overdue, vendor sees it as theirs.
  act(find('31100-M74LD0', 'pp-1'), 1, 'Submit revised PPAP dimensional report', 'Vendor', 'Open', '2026-10-12', 'Dimensions on cols 4–6 missing from the last upload.', 'PIC', 'Rahul Verma')
  // In progress on the vendor, future date.
  act(find('71811-M82P00', 'pp-2'), 2, 'Re-run weld destructive test on 3 coupons', 'Vendor', 'In progress', '2026-10-26', 'Previous coupons failed shear; repeat with corrected fixture.', 'PIC', 'Anita Desai')
  // Open action assigned to the PIC themselves (follow-up).
  act(find('35520-M68P00', 'pp-3'), 3, 'Schedule joint audit with SIC', 'PIC', 'Open', '2026-10-24', 'Align on pilot readiness before the next milestone.', 'SIC', 'SIC')
  // Done action — history/register.
  act(find('84701-M55R10', 'pp-1'), 4, 'Update control plan with new Ra limit', 'Vendor', 'Done', '2026-10-13', 'Reflect the approved deviation in the control plan.', 'PIC', 'Suresh Nair')
  // Open action assigned to SIC — SIC "needs attention".
  act(find('95100-M82P10', 'pp-2'), 5, 'Approve ECN transfer of trim history', 'SIC', 'Open', '2026-10-23', 'Review and approve the pending history transfer.', 'PIC', 'Anita Desai')

  // ── NG (no-go) rounds on the NG-tracked activity (pp-11) ──
  const ngEntry = find('31100-M74LD0', 'pp-11') ?? find('71811-M82P00', 'pp-11')
  if (ngEntry) {
    const openRound: NgRound = {
      round: 1,
      reason: 'Leak test failed at joint 2 — resubmit after rework.',
      by: 'PIC',
      byName: picByPart.get(ngEntry.partNo) ?? 'Rahul Verma',
      at: '2026-10-12T10:00:00Z',
      targetDate: '2026-10-22'
    }
    ngEntry.ngRounds = [...(ngEntry.ngRounds ?? []), openRound]
  }
  const ngEntry2 = find('35520-M68P00', 'pp-11')
  if (ngEntry2 && ngEntry2 !== ngEntry) {
    ngEntry2.ngRounds = [
      { round: 1, reason: 'Crimp height out of spec.', by: 'PIC', byName: picByPart.get(ngEntry2.partNo) ?? 'Suresh Nair', at: '2026-10-08T10:00:00Z', targetDate: '2026-10-14', resolvedAt: '2026-10-13T10:00:00Z' },
      { round: 2, reason: 'Pull-out force still below minimum — resubmit.', by: 'PIC', byName: picByPart.get(ngEntry2.partNo) ?? 'Suresh Nair', at: '2026-10-13T10:00:00Z', targetDate: '2026-10-25' }
    ]
  }

  // ── Delay reasons: one awaiting PIC review, one accepted, one sent back ──
  const delayReasons: DelayReason[] = []
  const delay = (
    partNo: string,
    activityId: string,
    seq: number,
    category: string,
    status: DelayReason['status'],
    plannedEnd: string,
    remark: string,
    revisedDate: string,
    decisionComment?: string
  ) => {
    const e = find(partNo, activityId)
    if (!e) return
    delayReasons.push({
      id: `delay-sample-${seq}`,
      entryId: e.id,
      rowId: e.templateRowId,
      partNo,
      activityId: e.activityId,
      category,
      remark,
      revisedDate,
      by: vendorByPart.get(partNo) ?? 'Vendor',
      byRole: 'Vendor',
      at: '2026-10-13T08:00:00Z',
      plannedEnd,
      status,
      decidedBy: status === 'Accepted' || status === 'SentBack' ? (picByPart.get(partNo) ?? 'PIC') : undefined,
      decidedAt: status === 'Accepted' || status === 'SentBack' ? '2026-10-14T09:00:00Z' : undefined,
      decisionComment
    })
  }
  delay('31100-M74LD0', 'pp-2', 1, 'Material shortage', 'Submitted', '2026-10-10', 'Resin lot delayed at port; expedited shipment booked.', '2026-10-24')
  delay('71811-M82P00', 'pp-3', 2, 'Tooling rework', 'Accepted', '2026-10-09', 'Mould cavity polishing took longer than planned.', '2026-10-20')
  delay('84701-M55R10', 'pp-4', 3, 'Manpower', 'Accepted', '2026-10-08', 'Shift shortage over the festival week.', '2026-10-18')

  return delayReasons
}
