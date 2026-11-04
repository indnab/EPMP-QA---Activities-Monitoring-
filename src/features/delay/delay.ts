import { useMemo } from 'react'
import type { ActivityDefinition, ActivityEntry, DelayReason } from '../../domain'
import { makeEntryId } from '../../domain'
import { getFilteredData, isWorkableByVendor } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'

/** Where an activity stands on its delay reason. 'Needed' = delayed with the vendor and nothing given yet. */
export type DelayState = 'Needed' | 'SentBack' | 'Submitted' | 'Accepted'

/** The latest reason record for an entry, and the state it implies (Needed when there is none). */
export function delayStateOf(entryId: string, reasons: DelayReason[]): { state: DelayState; latest?: DelayReason } {
  let latest: DelayReason | undefined
  for (const r of reasons) if (r.entryId === entryId && (!latest || r.at > latest.at)) latest = r
  if (!latest) return { state: 'Needed' }
  return { state: latest.status === 'SentBack' ? 'SentBack' : latest.status, latest }
}

/** The vendor still has to give (or redo) a reason. */
export function needsVendorReason(state: DelayState): boolean {
  return state === 'Needed' || state === 'SentBack'
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/**
 * True when the activity is late and the ball is with the vendor: past its planned end (Red), still open for the vendor
 * to enter (not started, draft or sent back), the vendor is the one who enters first, and it is not Not applicable.
 */
export function vendorHoldsDelay(activity: ActivityDefinition, entry: ActivityEntry | undefined, ryg: string, notApplicable: boolean): boolean {
  if (ryg !== 'Red' || notApplicable) return false
  const st = entry?.validationState
  if (st && st !== 'Draft' && st !== 'Sent back') return false
  if (activity.flow.steps[0]?.role !== 'Vendor') return false
  return activity.fields.some((f) => f.enteredBy === 'Vendor' && f.source !== 'calculated')
}

export function isVendorDelayed(inst: FilteredInstance): boolean {
  return vendorHoldsDelay(inst.activity, inst.entry, String(inst.ryg), inst.notApplicable)
}

/** What the dialog needs to know about one late activity-part pair. */
export interface DelayItem {
  key: string
  rowId: string
  partNo: string
  partName: string
  activityId: string
  activityName: string
  milestoneId: string
  plannedEnd: string
  daysLate: number
  /** The PIC’s comment when the previous reason was sent back. */
  sentBackComment?: string
}

export function delayItemFor(inst: FilteredInstance, reasons: DelayReason[]): DelayItem {
  const key = makeEntryId(inst.row.id, inst.part.partNo)
  const { state, latest } = delayStateOf(key, reasons)
  const end = inst.dates.status === 'resolved' ? inst.dates.end : DEMO_TODAY
  return {
    key,
    rowId: inst.row.id,
    partNo: inst.part.partNo,
    partName: inst.part.partName,
    activityId: inst.activity.id,
    activityName: inst.activity.name,
    milestoneId: inst.row.milestoneId,
    plannedEnd: end,
    daysLate: Math.max(1, daysBetween(end, DEMO_TODAY)),
    sentBackComment: state === 'SentBack' ? latest?.decisionComment : undefined
  }
}

/** One activity-part pair in the delay register. */
export interface DelayRow {
  key: string
  state: DelayState
  item: DelayItem
  record?: DelayReason
  partName: string
}

/**
 * The delay register for the current role: activities late with the vendor (reason needed or sent back), reasons
 * awaiting the PIC, and accepted reasons. Only parts the vendor has acknowledged are included.
 */
export function useDelayRows() {
  const { entries, activities, parts, templateRows, models, partReleases, partAcks, delayReasons } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const rows = useMemo<DelayRow[]>(() => {
    const instances = getFilteredData(
      entries, activities, parts, templateRows, models,
      { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' }, 'overview', DEMO_TODAY
    ).filter((i) => partInScope(i.part, currentPersona) && isWorkableByVendor(i.part.partNo, partReleases, partAcks))
    const out = new Map<string, DelayRow>()
    for (const inst of instances) {
      const key = makeEntryId(inst.row.id, inst.part.partNo)
      const { state, latest } = delayStateOf(key, delayReasons)
      const delayed = isVendorDelayed(inst)
      if (delayed || (latest && !inst.notApplicable)) {
        out.set(key, { key, state, item: delayItemFor(inst, delayReasons), record: latest, partName: inst.part.partName })
      }
    }
    return Array.from(out.values()).sort((a, b) => b.item.daysLate - a.item.daysLate)
  }, [entries, activities, parts, templateRows, models, partReleases, partAcks, delayReasons, currentPersona])
  return {
    rows,
    needed: rows.filter((r) => needsVendorReason(r.state)),
    review: rows.filter((r) => r.state === 'Submitted'),
    accepted: rows.filter((r) => r.state === 'Accepted')
  }
}
