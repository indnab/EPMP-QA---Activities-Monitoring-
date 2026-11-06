import { useMemo } from 'react'
import { makeEntryId } from '../../domain'
import type { PartRecord } from '../../domain'
import { getFilteredData, getPicOn } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import type { PersonaId } from '../../store/personaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'
import { trialStatusFor } from '../../mock/partIntakeFields'
import { isOpenToEnter, isWaitingForRole } from './workQueue'
import { useDelayRows } from '../delay/delay'
import { useExceptionData } from '../exceptions/useExceptionData'

/** Work I do myself vs things I approve. */
export type ApprovalMode = 'enter' | 'approve'
export type ApprovalType = 'Data Entry' | 'Data Validation' | 'Deviation' | 'Action' | 'Delay Reason'

/** One item in the merged My Work list (one row per thing: an entry, a validation, a deviation, an action, a delay). */
export interface ApprovalRow {
  key: string
  mode: ApprovalMode
  type: ApprovalType
  partNo: string
  partName: string
  vendorCode: string
  vendorName: string
  model: string
  department: string
  trial: string
  /** The part's PIC name today (for the PIC filter). */
  pic: string
  /** Activity name (what the item is about). */
  title: string
  /** For entry items: Draft / Sent back / Not started. */
  statusLabel?: string
  submittedByRole: PersonaId | 'System' | ''
  submittedByName: string
  submittedOn?: string // ISO date-time
  /** Opens the activity form for this part. */
  rowId: string
  /** How to action it in bulk (entry items have no bulk action). */
  approve?:
    | { kind: 'entry'; entryId: string }
    | { kind: 'deviation'; rowId: string; partNo: string; deviationId: string }
    | { kind: 'delay'; recordId: string }
    | { kind: 'action'; rowId: string; partNo: string; actionId: string }
}

function latestSubmit(history: { timestamp: string; persona: string; actorName?: string; action: string }[]) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'Submitted') return history[i]
  }
  return undefined
}

/**
 * Everything in scope for the current role, flattened to one row per item: the work they enter (drafts, sent back,
 * not started) and the things they approve (vendor submissions, deviations, their actions, delay reasons to review).
 */
export function useApprovalRows(): ApprovalRow[] {
  const { entries, activities, parts, templateRows, models, partReleases, partAcks, picAssignments } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const delays = useDelayRows()
  const { devRows, actions } = useExceptionData()

  return useMemo(() => {
    const partByNo = new Map(parts.map((p) => [p.partNo, p]))
    const modelByName = new Map(models.map((m) => [m.name, m]))
    const out: ApprovalRow[] = []

    const trialOf = (part: PartRecord) => trialStatusFor(modelByName.get(part.model)?.mrds, DEMO_TODAY)
    const base = (part: PartRecord, rowId: string) => ({
      partNo: part.partNo, partName: part.partName, vendorCode: part.vendorCode, vendorName: part.vendorName,
      model: part.model, department: part.department || 'Other', trial: trialOf(part),
      pic: getPicOn(part, picAssignments, DEMO_TODAY).name, rowId
    })

    const insts = getFilteredData(
      entries, activities, parts, templateRows, models,
      { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' }, 'overview', DEMO_TODAY
    ).filter((i) => partInScope(i.part, currentPersona))

    const STATUS_LABEL: Record<string, string> = { NotStarted: 'Not started', Draft: 'Draft', 'Sent back': 'Sent back' }

    // 1a) Data entry: activities open for THIS role to fill (not started, draft, sent back).
    for (const i of insts.filter((x) => isOpenToEnter(x, currentPersona))) {
      out.push({
        key: `enter-${i.row.id}-${i.part.partNo}`,
        mode: 'enter',
        type: 'Data Entry',
        ...base(i.part, i.row.id),
        title: i.activity.name,
        statusLabel: STATUS_LABEL[i.status] ?? i.status,
        submittedByRole: '',
        submittedByName: '',
        submittedOn: i.entry?.updatedAt,
        approve: undefined
      })
    }

    // 1b) Data validation: vendor submissions sitting at this role's approval step.
    for (const i of insts.filter((x) => isWaitingForRole(x, currentPersona))) {
      const sub = i.entry ? latestSubmit(i.entry.history) : undefined
      out.push({
        key: `val-${i.row.id}-${i.part.partNo}`,
        mode: 'approve',
        type: 'Data Validation',
        ...base(i.part, i.row.id),
        title: i.activity.name,
        submittedByRole: (sub?.persona as PersonaId) ?? 'Vendor',
        submittedByName: sub?.actorName || (sub?.persona === 'Vendor' ? i.part.vendorName : sub?.persona || FIXED_VENDOR_NAME),
        submittedOn: sub?.timestamp ?? i.entry?.updatedAt,
        approve: { kind: 'entry', entryId: makeEntryId(i.row.id, i.part.partNo) }
      })
    }

    // 2) Deviations awaiting this role's decision.
    for (const d of devRows.filter((x) => x.mine)) {
      const part = partByNo.get(d.partNo)
      if (!part) continue
      const e = entries.find((x) => x.id === makeEntryId(d.rowId, d.partNo))
      const dev = e?.deviations?.find((x) => x.id === d.id)
      out.push({
        key: `dev-${d.id}`,
        mode: 'approve',
        type: 'Deviation',
        ...base(part, d.rowId),
        title: d.title,
        submittedByRole: dev?.raisedByRole ?? 'PIC',
        submittedByName: dev?.raisedBy ?? '',
        submittedOn: dev?.raisedAt,
        approve: { kind: 'deviation', rowId: d.rowId, partNo: d.partNo, deviationId: d.id }
      })
    }

    // 3) Actions assigned to this role that are not yet done.
    for (const a of actions.filter((x) => x.action.assignedTo === currentPersona && x.action.status !== 'Done')) {
      const part = partByNo.get(a.partNo)
      if (!part) continue
      out.push({
        key: `act-${a.action.id}`,
        mode: 'approve',
        type: 'Action',
        ...base(part, a.templateRowId),
        title: a.action.title,
        submittedByRole: a.action.createdByRole,
        submittedByName: a.action.createdBy,
        submittedOn: a.action.createdAt,
        approve: { kind: 'action', rowId: a.templateRowId, partNo: a.partNo, actionId: a.action.id }
      })
    }

    // 4) Delay reasons the vendor submitted, awaiting this role's accept / send back.
    for (const r of delays.review) {
      const part = partByNo.get(r.item.partNo)
      if (!part || !r.record) continue
      out.push({
        key: `delay-${r.record.id}`,
        mode: 'approve',
        type: 'Delay Reason',
        ...base(part, r.item.rowId),
        title: r.item.activityName,
        submittedByRole: r.record.byRole,
        submittedByName: r.record.by,
        submittedOn: r.record.at,
        approve: { kind: 'delay', recordId: r.record.id }
      })
    }

    return out.sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activities, parts, templateRows, models, partReleases, partAcks, picAssignments, currentPersona, delays, devRows, actions])
}
