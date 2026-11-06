import { createContext, useCallback, useContext, useMemo } from 'react'
import type { PartRecord } from '../../domain'
import { getPicOn } from '../../engine'
import { INTAKE_FIELDS } from '../../mock/partIntakeFields'
import type { IntakeField } from '../../mock/partIntakeFields'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { DEMO_TODAY, partInScope } from '../scope'
import { MultiSelect } from '../intake/MultiSelect'

/**
 * The primary part filters, taken straight from the Part Intake field spec (the fields flagged primary + filter):
 * Model, QA Dept, Part Category, Model Variant, Fuel Type, QA PIC Name. One shared bar used on every list screen.
 */
export const PRIMARY_FILTER_FIELDS: IntakeField[] = INTAKE_FIELDS.filter((f) => f.primary && f.filter)

/** Filter state: field key → selected values. An empty array (or missing key) = no filter on that field. */
export type PartFilters = Record<string, string[]>

export const EMPTY_PART_FILTERS: PartFilters = Object.fromEntries(PRIMARY_FILTER_FIELDS.map((f) => [f.key, []]))

export function hasPartFilters(f: PartFilters): boolean {
  return PRIMARY_FILTER_FIELDS.some((fld) => (f[fld.key] ?? []).length > 0)
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
    const sel = f[field.key] ?? []
    if (sel.length > 0 && !sel.includes(partFieldValue(part, field, picName))) return false
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

/** The shared primary filter bar shown above a list. Standard multi-select controls (nothing ticked = All). */
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

  const set = (key: string, v: string[]) => onChange({ ...value, [key]: v })

  return (
    <section className="epmp-card mb-4 px-3 py-2" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        {PRIMARY_FILTER_FIELDS.map((field) => (
          <MultiSelect
            key={field.key}
            label={field.label}
            options={(optionsByKey[field.key] ?? []).map((o) => ({ value: o }))}
            selected={value[field.key] ?? []}
            onChange={(next) => set(field.key, next)}
          />
        ))}
        {hasPartFilters(value) && (
          <button onClick={() => onChange(EMPTY_PART_FILTERS)} className="ml-auto text-[11px] font-medium text-[var(--color-primary)] hover:underline">
            Clear all filters
          </button>
        )}
      </div>
    </section>
  )
}
