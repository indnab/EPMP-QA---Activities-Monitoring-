import { createContext, useCallback, useContext, useMemo } from 'react'
import type { PartRecord } from '../../domain'
import { getPicOn } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'

/** The usual filters (same set as My Work), applied to every Exception Management tab. */
export interface ExcFilters {
  model: string
  dept: string
  milestone: string
  pic: string
  partName: string
  partCode: string
  vendorCode: string
  vendor: string
}

export const EMPTY_EXC_FILTERS: ExcFilters = {
  model: 'All', dept: 'All', milestone: 'All', pic: 'All', partName: '', partCode: '', vendorCode: 'All', vendor: 'All'
}

export function hasExcFilters(f: ExcFilters): boolean {
  return (Object.keys(f) as (keyof ExcFilters)[]).some((k) => f[k] !== EMPTY_EXC_FILTERS[k])
}

/** Provided by the Exception Management page only; everywhere else (bell, Home, My Work) the default is "no filter". */
const ExcFilterContext = createContext<ExcFilters>(EMPTY_EXC_FILTERS)
export const ExcFilterProvider = ExcFilterContext.Provider

/**
 * Returns a test for "does this part (and the milestone of its template row) pass the page's filters?".
 * With no filters set, or outside the Exception Management page, everything passes.
 */
export function useExcMatcher(): (part: PartRecord, templateRowId?: string) => boolean {
  const f = useContext(ExcFilterContext)
  const { templateRows, picAssignments } = useQAStore()
  const rowMs = useMemo(() => new Map(templateRows.map((r) => [r.id, r.milestoneId])), [templateRows])
  return useCallback(
    (part, templateRowId) => {
      if (f.model !== 'All' && part.model !== f.model) return false
      if (f.dept !== 'All' && (part.department || 'Other') !== f.dept) return false
      if (f.vendor !== 'All' && part.vendorName !== f.vendor) return false
      if (f.vendorCode !== 'All' && part.vendorCode !== f.vendorCode) return false
      if (f.pic !== 'All' && getPicOn(part, picAssignments, DEMO_TODAY).name !== f.pic) return false
      if (f.partName && !part.partName.toLowerCase().includes(f.partName.toLowerCase())) return false
      if (f.partCode && !part.partNo.toLowerCase().includes(f.partCode.toLowerCase())) return false
      if (f.milestone !== 'All' && templateRowId && rowMs.get(templateRowId) !== f.milestone) return false
      return true
    },
    [f, picAssignments, rowMs]
  )
}

const filterCls =
  'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const labelCls = 'mb-1 block text-[10px] font-semibold text-[var(--color-muted)]'

/** The filter bar shown above the Exception Management tabs. */
export function ExceptionFilterBar({ value, onChange }: { value: ExcFilters; onChange: (f: ExcFilters) => void }) {
  const { parts, templateRows, picAssignments } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const set = (patch: Partial<ExcFilters>) => onChange({ ...value, ...patch })

  const scoped = useMemo(() => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)), [parts, currentPersona])
  const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort()
  const models = useMemo(() => uniq(scoped.map((p) => p.model)), [scoped])
  const depts = useMemo(() => uniq(scoped.map((p) => p.department || 'Other')), [scoped])
  const vendors = useMemo(() => uniq(scoped.map((p) => p.vendorName)), [scoped])
  const vendorCodes = useMemo(() => uniq(scoped.map((p) => p.vendorCode)), [scoped])
  const pics = useMemo(() => uniq(scoped.map((p) => getPicOn(p, picAssignments, DEMO_TODAY).name)), [scoped, picAssignments])
  const milestones = useMemo(() => uniq(templateRows.map((r) => r.milestoneId)), [templateRows])

  const select = (label: string, key: keyof ExcFilters, options: string[]) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select value={value[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<ExcFilters>)} className={filterCls}>
        <option value="All">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
  const text = (label: string, key: 'partName' | 'partCode') => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input value={value[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<ExcFilters>)} placeholder="All" className={filterCls} />
    </label>
  )

  return (
    <section className="epmp-card mb-4 px-4 py-3.5" aria-label="Filters">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        {select('Model', 'model', models)}
        {select('Department', 'dept', depts)}
        {select('Trial status', 'milestone', milestones)}
        {select('PIC name', 'pic', pics)}
        {text('Part name', 'partName')}
        {text('Part code', 'partCode')}
        {select('Vendor code', 'vendorCode', vendorCodes)}
        {select('Vendor name', 'vendor', vendors)}
      </div>
      {hasExcFilters(value) && (
        <div className="mt-2.5">
          <button onClick={() => onChange(EMPTY_EXC_FILTERS)} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">
            Clear all filters
          </button>
        </div>
      )}
    </section>
  )
}
