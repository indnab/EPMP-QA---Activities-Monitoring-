import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays } from '../engine'
import type { ResolvedDates } from '../domain'
import { usePersonaStore } from '../store/personaStore'
import { DEMO_TODAY } from './scope'

/** How far ahead the PIC's default view looks. */
export const UPCOMING_DAYS = 30

/** The PIC's "only upcoming" choice. On by default; one setting shared by My Work and the Parts Data Entry screens. */
interface UpcomingState {
  upcomingOnly: boolean
  setUpcomingOnly: (v: boolean) => void
}

export const useUpcomingStore = create<UpcomingState>()(
  persist(
    (set) => ({ upcomingOnly: true, setUpcomingOnly: (v) => set({ upcomingOnly: v }) }),
    { name: 'qa-tracker-upcoming', version: 1 }
  )
)

/**
 * True when an activity's planned dates put it in the upcoming window: it starts on or before today + 30 days.
 * That keeps work that is due soon, already running or overdue, and drops work further out. Activities with no
 * date yet (awaiting an MRD) are not upcoming.
 */
export function isUpcoming(dates: ResolvedDates, today: string = DEMO_TODAY, days: number = UPCOMING_DAYS): boolean {
  return dates.status === 'resolved' && dates.start <= addDays(today, days)
}

/** True when the list should be narrowed to upcoming work: the current role is the PIC and the box is ticked. */
export function useUpcomingOnly(): boolean {
  const persona = usePersonaStore((s) => s.currentPersona)
  const upcomingOnly = useUpcomingStore((s) => s.upcomingOnly)
  return persona === 'PIC' && upcomingOnly
}

/** The checkbox that turns the filter on or off. Renders for the PIC only. */
export function UpcomingToggle({ className = '' }: { className?: string }) {
  const persona = usePersonaStore((s) => s.currentPersona)
  const { upcomingOnly, setUpcomingOnly } = useUpcomingStore()
  if (persona !== 'PIC') return null
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-[12px] text-[#344054] ${className}`}>
      <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
      Show {UPCOMING_DAYS} days
    </label>
  )
}
