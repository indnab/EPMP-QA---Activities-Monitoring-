/**
 * Part Category and Fuel Type filters, shared by every screen whose rows are parts (or part × activity items).
 * Values live on PartRecord.attrs (Part Intake fields `part_category` and `fuel_type`); options come from the
 * intake field spec. Screens with the full primary filter bar (ExceptionFilterBar) already include both.
 */
import { INTAKE_FIELDS } from '../mock/partIntakeFields'
import { MultiSelect } from './intake/MultiSelect'

export const PART_ATTR_KEYS = ['part_category', 'fuel_type'] as const
export type PartAttrKey = (typeof PART_ATTR_KEYS)[number]

export const PART_ATTR_FIELDS = PART_ATTR_KEYS.map((k) => {
  const f = INTAKE_FIELDS.find((x) => x.key === k)
  return { key: k, label: f?.label ?? k, options: f?.options ?? [] }
})

/** Selected values per attribute; an empty list = no filter. */
export type PartAttrSel = Record<PartAttrKey, string[]>
export const EMPTY_ATTR_SEL: PartAttrSel = { part_category: [], fuel_type: [] }

export const hasAttrSel = (s: PartAttrSel) => PART_ATTR_KEYS.some((k) => s[k].length > 0)

/** Does the part pass the selected Part Category / Fuel Type? */
export function matchPartAttrs(part: { attrs?: Record<string, string> } | undefined, s: PartAttrSel): boolean {
  return PART_ATTR_KEYS.every((k) => s[k].length === 0 || s[k].includes(part?.attrs?.[k] ?? ''))
}

/** The two multi-select dropdowns, for a page's filter bar. */
export function PartAttrFilters({ value, onChange }: { value: PartAttrSel; onChange: (next: PartAttrSel) => void }) {
  return (
    <>
      {PART_ATTR_FIELDS.map((f) => (
        <MultiSelect key={f.key} label={f.label} options={f.options.map((o) => ({ value: o }))}
          selected={value[f.key]} onChange={(next) => onChange({ ...value, [f.key]: next })} />
      ))}
    </>
  )
}

/** Single-value form (for screens whose filters are plain dropdowns): attribute key → value, 'All' / missing = any. */
export type PartAttrValues = Partial<Record<PartAttrKey, string>>

export const hasAttrValues = (v: PartAttrValues) => PART_ATTR_KEYS.some((k) => !!v[k] && v[k] !== 'All')

export function matchAttrValues(part: { attrs?: Record<string, string> } | undefined, v: PartAttrValues): boolean {
  return PART_ATTR_KEYS.every((k) => !v[k] || v[k] === 'All' || (part?.attrs?.[k] ?? '') === v[k])
}

/** The two filters as plain dropdowns, styled by the caller. */
export function PartAttrSelects({ value, onChange, className }: { value: PartAttrValues; onChange: (next: PartAttrValues) => void; className: string }) {
  return (
    <>
      {PART_ATTR_FIELDS.map((f) => (
        <select key={f.key} aria-label={f.label} value={value[f.key] ?? 'All'} className={className}
          onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}>
          <option value="All">All {f.key === 'fuel_type' ? 'fuel types' : 'part categories'}</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </>
  )
}
