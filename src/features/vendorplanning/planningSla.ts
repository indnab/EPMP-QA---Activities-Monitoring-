/**
 * Release → acknowledgement → vendor planning timelines, per part:
 *  - the PIC validates and releases the part to the vendor within RELEASE_SLA_DAYS of receiving it;
 *  - the vendor acknowledges it within ACK_SLA_DAYS of the release;
 *  - where the vendor defines planned dates, it fills them all within PLAN_SLA_DAYS of acknowledging (ack + 15 d).
 * Past a deadline the part counts as overdue (tiles, bell alerts). Planned-date rejections (sent back by the PIC) are
 * collected per part for tracking.
 */
import { followsMainPart } from '../../engine'
import { useMemo } from 'react'
import { plannedDateOwner } from '../../domain'
import type { PartRecord, ReleaseState } from '../../domain'
import { getFilteredData, getReleaseState } from '../../engine'
import { useWorkParts } from '../../hooks/useWorkParts'
import { useQAStore } from '../../store/qaStore'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { DEMO_TODAY } from '../scope'

export const RELEASE_SLA_DAYS = 7
export const ACK_SLA_DAYS = 3
export const PLAN_SLA_DAYS = 15

const dnum = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
export const daysBetween = (a: string, b: string) => Math.round((dnum(b) - dnum(a)) / 86_400_000)
export const plusDays = (d: string, n: number) => new Date(dnum(d) + n * 86_400_000).toISOString().slice(0, 10)

export interface Rejection {
  activity: string
  at: string
  by: string
  comment?: string
  /** The dates sent back (start only on plans that had one), and where that activity's plan stands now. */
  start?: string
  date: string
  now: 'Sent back' | 'Submitted' | 'Approved'
}

export interface PartSla {
  part: PartRecord
  state: ReleaseState
  /** Release: waiting since the part was received (Pending state only). */
  receivedAt?: string
  releaseDays?: number
  releaseOverdue: boolean
  /** Acknowledgement: released on, days waiting (Released state only). */
  releasedAt?: string
  ackDays?: number
  ackOverdue: boolean
  /** Vendor planning (once acknowledged): ack + 15 days. */
  ackedAt?: string
  planDue?: string
  /** Days the planning has been with the vendor (since acknowledgement). */
  planDaysWithVendor?: number
  /** Negative = days past the due date. */
  planDaysLeft?: number
  planRequired: number
  planFilled: number
  planApproved: number
  planAwaiting: number
  planSentBack: number
  /** Not all vendor dates filled by the due date. */
  planExceeded: boolean
  planPending: boolean
  rejections: Rejection[]
}

/** Timelines for every work part (not superseded / deleted). Callers narrow to the role's scope. */
export function usePlanningSla(): PartSla[] {
  const { entries, activities, templateRows, models, partReleases, partAcks } = useQAStore()
  const parts = useWorkParts()
  return useMemo(() => {
    const today = DEMO_TODAY
    const live = parts.filter((p) => !p.supersededBy)
    const inst = getFilteredData(entries, activities, live, templateRows, models, { ...EMPTY_FILTERS }, 'overview', today)
      .filter((i) => !i.notApplicable && !followsMainPart(i) && plannedDateOwner(i.activity) === 'Vendor')
    const byPart = new Map<string, typeof inst>()
    for (const i of inst) byPart.set(i.part.partNo, [...(byPart.get(i.part.partNo) ?? []), i])
    const latest = <T extends { partNo: string; at: string }>(xs: T[], no: string) =>
      xs.filter((x) => x.partNo === no).reduce<T | undefined>((b, x) => (!b || x.at > b.at ? x : b), undefined)

    return live.map((part): PartSla => {
      const state = getReleaseState(part.partNo, partReleases, partAcks)
      const rel = latest(partReleases, part.partNo)
      const ack = latest(partAcks, part.partNo)
      const receivedAt = part.receivedAt ?? part.createdAt?.slice(0, 10)
      // A part added today (or dated after the demo date) has been with the PIC 0 days.
      const releaseDays = state === 'Pending' && receivedAt ? Math.max(0, daysBetween(receivedAt, today)) : undefined
      const releasedAt = state === 'Released' && rel ? rel.at.slice(0, 10) : undefined
      const ackDays = releasedAt ? daysBetween(releasedAt, today) : undefined
      const mine = byPart.get(part.partNo) ?? []
      const plans = mine.map((i) => i.entry?.vendorPlan)
      const status = (p: (typeof plans)[number]) => (p ? p.status ?? 'Submitted' : undefined)
      const planRequired = state === 'Acknowledged' ? mine.length : 0
      const planFilled = state === 'Acknowledged' ? plans.filter((p) => p && status(p) !== 'Sent back').length : 0
      const ackedAt = state === 'Acknowledged' && ack ? ack.at.slice(0, 10) : undefined
      const planDue = ackedAt && planRequired ? plusDays(ackedAt, PLAN_SLA_DAYS) : undefined
      const planDaysLeft = planDue ? daysBetween(today, planDue) : undefined
      const planPending = planRequired > 0 && planFilled < planRequired
      const rejections: Rejection[] = []
      for (const i of mine) {
        for (const h of i.entry?.history ?? []) {
          if (!h.action.startsWith('Sent back planned date')) continue
          rejections.push({
            activity: i.activity.name, at: h.timestamp, by: h.actorName || h.persona, comment: h.comment,
            start: (h.action.match(/\d{4}-\d{2}-\d{2}/g) ?? []).length > 1 ? h.action.match(/\d{4}-\d{2}-\d{2}/g)![0] : undefined,
            date: (h.action.match(/\d{4}-\d{2}-\d{2}/g) ?? []).at(-1) ?? '', now: status(i.entry?.vendorPlan) ?? 'Sent back',
          })
        }
      }
      rejections.sort((a, b) => b.at.localeCompare(a.at))
      return {
        part, state, receivedAt: state === 'Pending' ? receivedAt : undefined, releaseDays,
        releaseOverdue: releaseDays !== undefined && releaseDays > RELEASE_SLA_DAYS,
        releasedAt, ackDays, ackOverdue: ackDays !== undefined && ackDays > ACK_SLA_DAYS,
        ackedAt, planDue, planDaysWithVendor: ackedAt ? daysBetween(ackedAt, today) : undefined, planDaysLeft,
        planRequired, planFilled,
        planApproved: plans.filter((p) => status(p) === 'Approved').length,
        planAwaiting: plans.filter((p) => status(p) === 'Submitted').length,
        planSentBack: plans.filter((p) => status(p) === 'Sent back').length,
        planPending, planExceeded: planPending && planDaysLeft !== undefined && planDaysLeft < 0,
        rejections,
      }
    })
  }, [parts, entries, activities, templateRows, models, partReleases, partAcks])
}
