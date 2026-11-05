import { useMemo } from 'react'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { partInScope } from '../scope'
import { useDelayRows } from '../delay/delay'
import { useActionRows } from './ActionsView'
import { useExcMatcher } from './exceptionFilters'

export type ExceptionTab = 'overview' | 'deviations' | 'actions' | 'delays'

/** One open NG (no-go) round across all parts: a submission the PIC rejected that is awaiting resubmission. */
export interface NgLite {
  key: string
  partNo: string
  partName: string
  activityName: string
  round: number
  reason: string
  target?: string
  rowId: string
}

/** One thing that needs the current role: a deviation decision, an action, or a delay reason. */
export interface Attention {
  key: string
  type: 'Deviation' | 'Action' | 'Delay' | 'NG'
  tab: ExceptionTab
  title: string
  where: string
  note: string
  due?: string
  /** Template row and part, when the item belongs to one activity of one part (used to open its form). */
  rowId?: string
  partNo?: string
}

export interface DeviationLite {
  id: string
  title: string
  partNo: string
  partName: string
  stage: string
  mine: boolean
  open: boolean
  target?: string
  rowId: string
}

/** Everything that went off plan (deviations, actions, delay reasons) for the current role, plus what needs them. */
export function useExceptionData() {
  const { entries, parts, activities } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isVendor = currentPersona === 'Vendor'
  const actions = useActionRows()
  const delays = useDelayRows()
  const match = useExcMatcher()
  // Open NG rounds (a submission rejected as NG, awaiting the vendor's resubmission), across parts in scope.
  const ngRows = useMemo(() => {
    const out: NgLite[] = []
    const partByNo = new Map(parts.map((p) => [p.partNo, p]))
    const actByName = new Map(activities.map((a) => [a.id, a.name]))
    for (const e of entries) {
      const part = partByNo.get(e.partNo)
      if (!e.ngRounds?.length || !part || part.supersededBy || !partInScope(part, currentPersona) || !match(part, e.templateRowId)) continue
      const open = e.ngRounds.find((r) => !r.resolvedAt)
      if (!open) continue
      out.push({ key: `${e.id}-ng${open.round}`, partNo: part.partNo, partName: part.partName, activityName: actByName.get(e.activityId) ?? e.activityId, round: open.round, reason: open.reason, target: open.targetDate, rowId: e.templateRowId })
    }
    return out
  }, [entries, parts, activities, currentPersona, match])
  const devRows = useMemo(() => {
    const out: DeviationLite[] = []
    const partByNo = new Map(parts.map((p) => [p.partNo, p]))
    for (const e of entries) {
      const part = partByNo.get(e.partNo)
      if (!e.deviations?.length || !part || part.supersededBy || !partInScope(part, currentPersona) || !match(part, e.templateRowId)) continue
      for (const d of e.deviations) {
        const open = d.status === 'In progress' || d.status === 'Sent back'
        const stage = open ? d.flow[d.currentStep] : ''
        out.push({ id: d.id, title: d.title, partNo: part.partNo, partName: part.partName, stage, open, mine: open && (currentPersona === 'Admin' || stage === currentPersona), target: d.targetDate, rowId: e.templateRowId })
      }
    }
    return out
  }, [entries, parts, currentPersona, match])
  const devMine = devRows.filter((d) => d.mine).length
  const actMine = actions.filter((a) => a.action.assignedTo === currentPersona && a.action.status !== 'Done').length
  const delayMine = isVendor ? delays.needed.length : delays.review.length
  const attention = useMemo<Attention[]>(() => {
    const out: Attention[] = []
    if (!isVendor) {
      for (const d of devRows.filter((x) => x.mine)) {
        out.push({ key: d.id, type: 'Deviation', tab: 'deviations', title: d.title, where: `${d.partName} · ${d.partNo}`, note: `Awaiting your decision (${d.stage})`, due: d.target, rowId: d.rowId, partNo: d.partNo })
      }
    }
    for (const a of actions.filter((x) => x.action.status !== 'Done' && (x.action.assignedTo === currentPersona || (x.overdue && !isVendor)))) {
      out.push({
        key: a.action.id, type: 'Action', tab: 'actions', title: a.action.title, where: `${a.partName} · ${a.activityName}`,
        note: a.overdue ? `Overdue, assigned to ${a.action.assignedTo}` : `Assigned to ${a.action.assignedTo}`, due: a.action.targetDate,
        rowId: a.templateRowId, partNo: a.partNo
      })
    }
    for (const r of isVendor ? delays.needed : delays.review) {
      out.push({
        key: r.key, type: 'Delay', tab: 'delays', title: r.item.activityName, where: `${r.partName} · ${r.item.partNo}`,
        note: isVendor ? `${r.item.daysLate} days late, reason needed${r.state === 'SentBack' ? ' (sent back)' : ''}` : `Reason from vendor to review: ${r.record?.category ?? ''}`,
        due: r.item.plannedEnd, rowId: r.item.rowId, partNo: r.item.partNo
      })
    }
    // Open NG rounds: the vendor has to resubmit; the PIC is waiting for it.
    for (const n of ngRows) {
      out.push({
        key: n.key, type: 'NG', tab: 'overview', title: `NG round ${n.round}: ${n.activityName}`, where: `${n.partName} · ${n.partNo}`,
        note: isVendor ? `Rejected as NG — resubmit. “${n.reason}”` : `Awaiting vendor resubmission. “${n.reason}”`,
        due: n.target, rowId: n.rowId, partNo: n.partNo
      })
    }
    return out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  }, [devRows, actions, delays, ngRows, currentPersona, isVendor])
  return { isVendor, actions, delays, devRows, devMine, actMine, delayMine, ngRows, attention }
}
