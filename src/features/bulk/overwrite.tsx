/**
 * Shared by the bulk fill dialog and the Activity Update screen: what the selected items already hold for a field,
 * and the "Data already exists" review (overwrite or keep each value; Accept all / Ignore all).
 */
import { Button, Modal } from '../../components'
import type { FieldDefinition } from '../../domain'
import { formatValue } from '../mywork/gridModel'

/** One item a fill writes to, with what it already holds. `sectionId` matches a section (multi-activity fill). */
export interface BulkTarget {
  id: string
  sectionId?: string
  label: string
  values: Record<string, unknown>
}
export interface Conflict {
  k: string
  target: BulkTarget
  field: FieldDefinition
  oldValue: unknown
  newValue: unknown
}
export const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Filled values that would replace a different value already saved on an item. */
export function conflictsOf(
  targets: BulkTarget[],
  filledFor: (t: BulkTarget) => Record<string, unknown> | undefined,
  fieldsFor: (t: BulkTarget) => FieldDefinition[]
): Conflict[] {
  const out: Conflict[] = []
  for (const t of targets) {
    const filled = filledFor(t)
    if (!filled) continue
    const fields = fieldsFor(t)
    for (const [key, newValue] of Object.entries(filled)) {
      const oldValue = t.values[key]
      const field = fields.find((f) => f.key === key)
      if (!field || isBlank(oldValue) || sameValue(oldValue, newValue)) continue
      out.push({ k: `${t.id}|${key}`, target: t, field, oldValue, newValue })
    }
  }
  return out
}

/** The review step: existing vs new per value, Overwrite / Keep each, Accept all / Ignore all. `keep` holds kept keys. */
export function OverwriteReview({ conflicts, keep, setKeep, confirmLabel, onBack, onConfirm }: {
  conflicts: Conflict[]
  keep: Set<string>
  setKeep: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  confirmLabel: string
  onBack: () => void
  onConfirm: () => void
}) {
    const all = conflicts
    const overwriting = all.filter((c) => !keep.has(c.k)).length
    const show = (field: FieldDefinition, value: unknown) => formatValue(field, value) || '—'
    return (
      <Modal
        open
        onClose={onBack}
        size="lg"
        title="Data already exists"
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="text-[10.5px] text-[var(--color-muted)]">{overwriting} to overwrite · {all.length - overwriting} to keep</span>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="md" onClick={onBack}>Back</Button>
              <Button variant="primary" size="md" onClick={onConfirm}>{confirmLabel}</Button>
            </div>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11.5px] text-[#92400e]">
          <span className="min-w-0 flex-1">
            {all.length} value{all.length === 1 ? '' : 's'} on {new Set(all.map((c) => c.target.id)).size} item(s) already filled. Choose for each whether to overwrite it or keep what is there.
          </span>
          <Button variant="secondary" size="sm" onClick={() => setKeep(new Set())}>Accept all</Button>
          <Button variant="secondary" size="sm" onClick={() => setKeep(new Set(all.map((c) => c.k)))}>Ignore all</Button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-[var(--color-surface)] text-left text-[10.5px] font-medium text-[#344054]">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Already filled</th>
                <th className="px-3 py-2">New value</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => {
                const kept = keep.has(c.k)
                const set = (k: boolean) => setKeep((prev) => { const n = new Set(prev); if (k) n.add(c.k); else n.delete(c.k); return n })
                return (
                  <tr key={c.k} className="border-t border-[var(--color-border)] align-top">
                    <td className="px-3 py-2 text-[#101828]">{c.target.label}</td>
                    <td className="px-3 py-2 text-[#344054]">{c.field.label}</td>
                    <td className={`px-3 py-2 ${kept ? 'font-medium text-[#101828]' : 'text-[var(--color-muted)] line-through'}`}>{show(c.field, c.oldValue)}</td>
                    <td className={`px-3 py-2 ${kept ? 'text-[var(--color-muted)] line-through' : 'font-medium text-[#101828]'}`}>{show(c.field, c.newValue)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5" role="group" aria-label={`${c.target.label} ${c.field.label}`}>
                        <button type="button" onClick={() => set(false)} aria-pressed={!kept}
                          className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${!kept ? 'bg-[var(--color-primary)] text-white' : 'text-[#344054]'}`}>Overwrite</button>
                        <button type="button" onClick={() => set(true)} aria-pressed={kept}
                          className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${kept ? 'bg-[#475467] text-white' : 'text-[#344054]'}`}>Keep</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Modal>
    )
}

/** What the selected items already hold for one field: one value, "all the same", or a list per item. */
export function ExistingValues({ field, targets }: { field: FieldDefinition; targets: BulkTarget[] }) {
  if (targets.length === 0) return null
  const filled = targets
    .map((t) => ({ t, v: t.values[field.key] }))
    .filter(({ v }) => !isBlank(v))
  const box = 'mt-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10.5px] text-[#475467]'
  if (filled.length === 0) {
    return <p className={box}>Not filled on {targets.length === 1 ? 'this item' : `any of the ${targets.length} items`} yet.</p>
  }
  const shown = (v: unknown) => formatValue(field, v) || '—'
  const values = new Set(filled.map(({ v }) => JSON.stringify(v)))
  // One item, or every item holds the same value: a single line.
  if (targets.length === 1 || (values.size === 1 && filled.length === targets.length)) {
    return (
      <p className={box}>
        <span className="font-semibold text-[#344054]">Already filled{targets.length > 1 ? ` (all ${targets.length})` : ''}:</span> {shown(filled[0].v)}
      </p>
    )
  }
  return (
    <details className={box} open={targets.length <= 5}>
      <summary className="cursor-pointer select-none">
        <span className="font-semibold text-[#344054]">Already filled on {filled.length} of {targets.length}</span>
        <span className="text-[var(--color-muted)]"> · show values</span>
      </summary>
      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
        {targets.map((t) => {
          const v = t.values[field.key]
          return (
            <li key={t.id} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]" title={t.label}>{t.label}</span>
              <span className={isBlank(v) ? 'italic text-[var(--color-muted)]' : 'font-medium text-[#101828]'}>{isBlank(v) ? 'empty' : shown(v)}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
