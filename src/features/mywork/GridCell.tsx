import type { FieldDefinition } from '../../domain'

/** How a cell is flagged: nothing, required by a rule after an answer elsewhere, or missing on a submit attempt. */
export type CellTone = 'none' | 'rule' | 'error'

const base =
  'h-8 w-full rounded-md border bg-white px-2 text-[11px] text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:opacity-70'

function toneClass(tone: CellTone): string {
  if (tone === 'error') return 'border-[var(--color-ryg-red)] bg-[#fef2f2]'
  if (tone === 'rule') return 'border-[#fcd34d] bg-[#fffbeb]'
  return 'border-[var(--color-border)]'
}

interface CellEditorProps {
  field: FieldDefinition
  value: any
  onChange: (value: any) => void
  /** `data-cell` attribute used for Enter-key movement down the column. */
  cellId?: string
  tone?: CellTone
  label?: string
}

/**
 * Compact single-line editor for one field type. Produces the same value shapes as the part form's editors
 * (text, number, 'Y'/'N', option string, string[], boolean) so the store sees identical data.
 * File fields are not handled here; the grid links them to the part form.
 */
export function CellEditor({ field, value, onChange, cellId, tone = 'none', label }: CellEditorProps) {
  const cls = `${base} ${toneClass(tone)}`
  const common = { 'data-cell': cellId, 'aria-label': label ?? field.label }

  switch (field.type) {
    case 'number':
    case 'percent':
      return (
        <input
          {...common}
          type="number"
          min={field.type === 'percent' ? 0 : undefined}
          max={field.type === 'percent' ? 100 : undefined}
          value={typeof value === 'number' && Number.isNaN(value) ? '' : value ?? ''}
          onChange={(e) => onChange(Number.isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber)}
          className={`${cls} min-w-[84px]`}
        />
      )
    case 'date':
      return (
        <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${cls} min-w-[128px]`} />
      )
    case 'yesNo':
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${cls} min-w-[84px]`}>
          <option value="">—</option>
          <option value="Y">Yes</option>
          <option value="N">No</option>
        </select>
      )
    case 'dropdown':
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${cls} min-w-[110px]`}>
          <option value="">—</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    case 'multiSelect': {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <details className="relative min-w-[110px]">
          <summary
            {...common}
            tabIndex={0}
            className={`${cls} flex cursor-pointer list-none items-center`}
          >
            {selected.length ? `${selected.length} selected` : '—'}
          </summary>
          <div className="absolute left-0 z-20 mt-1 min-w-[160px] rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-lg">
            {field.options?.map((opt) => (
              <label key={opt} className="flex items-center gap-2 py-0.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])}
                />
                {opt}
              </label>
            ))}
          </div>
        </details>
      )
    }
    case 'flag':
      return (
        <label className="flex h-8 items-center gap-1.5 text-[11px]">
          <input {...common} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {value ? 'Flagged' : 'Clear'}
        </label>
      )
    case 'longText':
    case 'text':
    default:
      return (
        <input
          {...common}
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} ${field.type === 'longText' ? 'min-w-[200px]' : 'min-w-[130px]'}`}
        />
      )
  }
}
