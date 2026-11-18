/**
 * My Work quick date filter for the whole page: MRDs in the next 30 days, Activities due in the next 30 days
 * (default), or All. Remembered.
 *  - Activities due: the activity's planned end is on or before today + 30 days (so overdue work stays in view).
 *  - MRDs: the activity's milestone has a planned date (its own date or one of its MRD types) in the next 30 days.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModelRecord } from '../../domain'
import type { FilteredInstance } from '../../engine'
import { DEMO_TODAY } from '../scope'

export type QuickRange = 'mrd30' | 'due30' | 'all'
export const QUICK_DAYS = 30

export const useQuickRange = create<{ range: QuickRange; setRange: (r: QuickRange) => void }>()(
  persist((set) => ({ range: 'due30', setRange: (range) => set({ range }) }), { name: 'qa-tracker-mywork-range', version: 1 })
)

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const windowEnd = () => addDays(DEMO_TODAY, QUICK_DAYS)

/** Does the model have a planned date for this milestone (own date or an MRD type) in the next 30 days? */
export function mrdInWindow(model: ModelRecord | undefined, milestoneId?: string): boolean {
  if (!model) return false
  const end = windowEnd()
  return Object.entries(model.mrds).some(([k, d]) =>
    (!milestoneId || k === milestoneId || k.startsWith(`${milestoneId}:`)) && d >= DEMO_TODAY && d <= end)
}

/** Does the activity pass the quick filter? */
export function inQuickRange(i: FilteredInstance, range: QuickRange): boolean {
  if (range === 'all') return true
  if (range === 'due30') return i.dates.status === 'resolved' && i.dates.end <= windowEnd()
  return mrdInWindow(i.model, i.row.milestoneId)
}

const OPTIONS: { id: QuickRange; label: string }[] = [
  { id: 'mrd30', label: `MRDs in next ${QUICK_DAYS} days` },
  { id: 'due30', label: `Activities due in next ${QUICK_DAYS} days` },
  { id: 'all', label: 'All' },
]

/** Segmented quick filter. */
export function QuickRangeControl() {
  const { range, setRange } = useQuickRange()
  return (
    <div className="flex flex-wrap items-center gap-2" data-export-ignore="true">
      <div className="inline-flex rounded-xl bg-[#eef0f4] p-1" role="group" aria-label="Quick date filter">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" onClick={() => setRange(o.id)} aria-pressed={range === o.id}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${range === o.id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467] hover:text-[#101828]'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
