/**
 * My Work view for a PIC: only what is tagged / pending to me, my whole department (my QA section), or one other PIC
 * in my department. The choice is remembered and applies to every My Work page (Overview, My Actions, Approvals,
 * Calendar and the entry grid). Other roles are not affected.
 */
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PartRecord } from '../../domain'
import { getPicOn } from '../../engine'
import { useWorkParts } from '../../hooks/useWorkParts'
import { FIXED_PIC_NAME, FIXED_SECTION, usePersonaStore } from '../../store/personaStore'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, partInScope } from '../scope'
import { EMPTY_PART_FILTERS, PartFilterProvider } from '../exceptions/exceptionFilters'
import type { PartFilters } from '../exceptions/exceptionFilters'

/** 'me' = tagged to me, 'dept' = my whole department, otherwise a PIC's name. */
type PicView = 'me' | 'dept' | string

const usePicViewStore = create<{ view: PicView; setView: (v: PicView) => void }>()(
  persist((set) => ({ view: 'me', setView: (view) => set({ view }) }), { name: 'qa-tracker-pic-view', version: 1 })
)

/** The PIC whose parts are shown, or null for the whole department (and for roles other than PIC). */
export function usePicViewName(): string | null {
  const { currentPersona } = usePersonaStore()
  const view = usePicViewStore((s) => s.view)
  if (currentPersona !== 'PIC' || view === 'dept') return null
  return view === 'me' ? FIXED_PIC_NAME : view
}

/** Does the part belong to the chosen view? (Always true for roles other than PIC.) */
export function usePicViewMatch(): (part: PartRecord) => boolean {
  const name = usePicViewName()
  const picAssignments = useQAStore((s) => s.picAssignments)
  return useCallback(
    (part: PartRecord) => !name || getPicOn(part, picAssignments, DEMO_TODAY).name === name,
    [name, picAssignments]
  )
}

/** Makes shared lists that read the part-filter context (delays, NG, deviations) follow the view too. */
export function PicViewProvider({ children }: { children: React.ReactNode }) {
  const name = usePicViewName()
  const value = useMemo<PartFilters>(() => (name ? { ...EMPTY_PART_FILTERS, qa_pic_name: [name] } : EMPTY_PART_FILTERS), [name])
  return <PartFilterProvider value={value}>{children}</PartFilterProvider>
}

/** The view dropdown. Shown to the PIC only. */
export function PicViewSelect() {
  const { currentPersona } = usePersonaStore()
  const { view, setView } = usePicViewStore()
  const parts = useWorkParts()
  const picAssignments = useQAStore((s) => s.picAssignments)
  // Other PICs in my department: the PICs of the parts in my section.
  const others = useMemo(() => {
    const names = new Set<string>()
    for (const p of parts) {
      if (p.supersededBy || !partInScope(p, 'PIC')) continue
      const n = getPicOn(p, picAssignments, DEMO_TODAY).name
      if (n && n !== FIXED_PIC_NAME) names.add(n)
    }
    return [...names].sort()
  }, [parts, picAssignments])
  if (currentPersona !== 'PIC') return null
  // A saved PIC who is no longer in the department falls back to "me".
  const value = view === 'me' || view === 'dept' || others.includes(view) ? view : 'me'
  return (
    <label className="flex items-center gap-2 text-[11px] font-medium text-[#344054]">
      View
      <select value={value} onChange={(e) => setView(e.target.value)} aria-label="Whose work to show"
        className="h-9 rounded-lg border border-[var(--color-border)] px-2.5 text-[12px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]">
        <option value="me">Tagged to me ({FIXED_PIC_NAME})</option>
        <option value="dept">My department ({FIXED_SECTION}): all PICs</option>
        {others.length > 0 && (
          <optgroup label="A PIC in my department">
            {others.map((n) => <option key={n} value={n}>{n}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  )
}
