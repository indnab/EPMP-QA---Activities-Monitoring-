import { useMemo } from 'react'
import { makeEntryId } from '../../domain'
import type { PartRecord } from '../../domain'
import { getFilteredData } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import type { PersonaId } from '../../store/personaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'
import { trialStatusFor } from '../../mock/partIntakeFields'
import { isWaitingForRole } from './workQueue'
import { useDelayRows } from '../delay/delay'
import { useExceptionData } from '../exceptions/useExceptionData'

export type ApprovalType = 'Data Validation' | 'Deviation' | 'Action' | 'Delay Reason'

/** One approval item in the flat My Approvals table (one row per thing awaiting the current role). */
export interface ApprovalRow {
  key: string
  type: ApprovalType
  partNo: string
  partName: string
  vendorCode: string
  vendorName: string
  model: string
  trial: string
  title: string
  submittedByRole: PersonaId | 'System' | ''
  submittedByName: string
  submittedOn?: string // ISO date-time
  /** Opens the activity form for this part. */
  rowId: string
  /** Fields the store actions need to approve this item in bulk. */
  approve:
    | { kind: 'entry'; entryId: string }
    | { kind: 'deviation'; rowId: string; partNo: string; deviationId: string }
    | { kind: 'delay'; recordId: string }
    | { kind: 'action'; rowId: string; partNo: string; actionId: string }
}

/** The latest "Submitted" history line on an entry (who/when the vendor submitted it). */
function latestSubmit(history: { timestamp: string; persona: string; actorName?: string; action: string }[]) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'Submitted') return history[i]
  }
  return undefined
}

/**
 * Everything across the app that waits on the current role to approve, flattened to one row per item:
 * data validations (vendor submissions), deviations, actions assigned to the role, and delay reasons to review.
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
      model: part.model, trial: trialOf(part), rowId
    })

    // 1) Data validations: vendor submissions sitting at this role's approval step.
    const insts = getFilteredData(
      entries, activities, parts, templateRows, models,
      { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' }, 'overview', DEMO_TODAY
    ).filter((i) => partInScope(i.part, currentPersona) && isWaitingForRole(i, currentPersona))
    for (const i of insts) {
      const sub = i.entry ? latestSubmit(i.entry.history) : undefined
      out.push({
        key: `val-${i.row.id}-${i.part.partNo}`,
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
        type: 'Delay Reason',
        ...base(part, r.item.rowId),
        title: r.item.activityName,
        submittedByRole: r.record.byRole,
        submittedByName: r.record.by,
        submittedOn: r.record.at,
        approve: { kind: 'delay', recordId: r.record.id }
      })
    }

    // Newest submissions first.
    return out.sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activities, parts, templateRows, models, partReleases, partAcks, picAssignments, currentPersona, delays, devRows, actions])
}
