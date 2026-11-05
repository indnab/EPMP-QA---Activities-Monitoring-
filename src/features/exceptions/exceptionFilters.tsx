import { createContext, useCallback, useContext, useMemo } from 'react'
import type { PartRecord } from '../../domain'
import { getPicOn } from '../../engine'
import { INTAKE_FIELDS } from '../../mock/partIntakeFields'
import type { IntakeField } from '../../mock/partIntakeFields'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'

/**
 * The primary part filters, taken straight from the Part Intake field spec (the fields flagged primary + filter):
 * Model, QA Dept, Part Category, Model Variant, Fuel Type, QA PIC Name. One shared bar used on every list screen.
 */
export const PRIMARY_FILTER_FIELDS: IntakeField[] = INTAKE_FIELDS.filter((f) => f.primary && f.filter)

/** Filter state: field key → selected value ('All' = no filter). */
export type PartFilters = Record<string, string>

export const EMPTY_PART_FILTERS: PartFilters = Object.fromEntries(PRIMARY_FILTER_FIELDS.map((f) => [f.key, 'All']))

export function hasPartFilters(f: PartFilters): boolean {
  return PRIMARY_FILTER_FIELDS.some((fld) => (f[fld.key] ?? 'All') !== 'All')
}

/** Read a filter field's value off a part (core column, derived PIC, or attrs bag). */
function partFieldValue(part: PartRecord, field: IntakeField, picName: string): string {
  if (field.key === 'qa_pic_name') return picName
  if (field.core) {
    const map: Record<string, string> = {
      model: part.model, department: part.department, pic: part.pic,
      partNo: part.partNo, partName: part.partName, vendorCode: part.vendorCode,
      vendorName: part.vendorName, section: part.section
    }
    return map[field.core] ?? ''
  }
  return part.attrs?.[field.key] ?? ''
}

/** Provided by each list page; where no provider exists the default is "no filter" so everything passes. */
const PartFilterContext = createContext<PartFilters>(EMPTY_PART_FILTERS)
export const PartFilterProvider = PartFilterContext.Provider

// Back-compat aliases (Exception Management page used these names).
export const ExcFilterProvider = PartFilterProvider
export const EMPTY_EXC_FILTERS = EMPTY_PART_FILTERS
export type ExcFilters = PartFilters

/** Pure matcher used by both the context hook and pages that hold filters in their own state. */
function matchPart(part: PartRecord, f: PartFilters, picName: string): boolean {
  for (const field of PRIMARY_FILTER_FIELDS) {
    const sel = f[field.key] ?? 'All'
    if (sel !== 'All' && partFieldValue(part, field, picName) !== sel) return false
  }
  return true
}

/**
 * A test for "does this part pass the given primary filters?". With no filters (or 'All' everywhere) everything
 * passes. Pass explicit filters to use a page's own state; omit to read the nearest PartFilterProvider (used by
 * Exception Management). The optional templateRowId is accepted for call-site compatibility; the set is part-only.
 */
export function useExcMatcher(filters?: PartFilters): (part: PartRecord, templateRowId?: string) => boolean {
  const ctx = useContext(PartFilterContext)
  const f = filters ?? ctx
  const { picAssignments } = useQAStore()
  return useCallback(
    (part) => matchPart(part, f, getPicOn(part, picAssignments, DEMO_TODAY).name),
    [f, picAssignments]
  )
}

const filterCls =
  'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const labelCls = 'mb-1 block text-[10px] font-semibold text-[var(--color-muted)]'

/** The shared primary filter bar shown above a list. */
export function ExceptionFilterBar({ value, onChange }: { value: PartFilters; onChange: (f: PartFilters) => void }) {
  const { parts, picAssignments } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const scoped = useMemo(() => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)), [parts, currentPersona])
  // Options per field: the field's declared pick-list, else the distinct values present in the scoped parts.
  const optionsByKey = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const field of PRIMARY_FILTER_FIELDS) {
      if (field.options?.length) {
        out[field.key] = field.options
      } else {
        const vals = scoped.map((p) => partFieldValue(p, field, getPicOn(p, picAssignments, DEMO_TODAY).name))
        out[field.key] = Array.from(new Set(vals.filter(Boolean))).sort()
      }
    }
    return out
  }, [scoped, picAssignments])

  const set = (key: string, v: string) => onChange({ ...value, [key]: v })

  return (
    <section className="epmp-card mb-4 px-4 py-3.5" aria-label="Filters">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {PRIMARY_FILTER_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className={labelCls}>{field.label}</span>
            <select value={value[field.key] ?? 'All'} onChange={(e) => set(field.key, e.target.value)} className={filterCls}>
              <option value="All">All</option>
              {(optionsByKey[field.key] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      {hasPartFilters(value) && (
        <div className="mt-2.5">
          <button onClick={() => onChange(EMPTY_PART_FILTERS)} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">
            Clear all filters
          </button>
        </div>
      )}
    </section>
  )
}
