/**
 * Bulk fill: one form of common fields. Whatever is entered is written to every selected item at once.
 * Only fields the user actually fills are written; blank fields keep each item's current value.
 *
 * Pass `fields` for a single form, or `sections` to fill several activities at once (one block per activity;
 * values are kept per section, so two activities with the same field key never overwrite each other).
 * Shared by the activity Workspace page, My Work → Overview and the Bulk Entry grid.
 *
 * Pass `targets` (each item's saved values) to check for existing data: if a filled field already has a different
 * value on some items, a review step lists them (existing vs new) and the user chooses, per value or for all, to
 * overwrite it or keep what is there. Kept values are passed back in `skip` as `${targetId}|${fieldKey}`.
 */
import { useState } from 'react'
import { Button, Modal, getFieldRenderer, SourceBadge } from '../../components'
import type { SourceType } from '../../components'
import type { FieldDefinition } from '../../domain'
import { formatValue } from '../mywork/gridModel'

export interface BulkSection {
  id: string
  title?: string
  /** Small line under the section title, e.g. "applies to 3 parts · 1 locked part skipped". */
  subtitle?: string
  fields: FieldDefinition[]
}

const SINGLE = '_'
/** One item the fill writes to, with what it already holds. `sectionId` matches a section (multi-activity fill). */
export interface BulkTarget {
  id: string
  sectionId?: string
  label: string
  values: Record<string, unknown>
}
interface Conflict {
  k: string
  target: BulkTarget
  field: FieldDefinition
  oldValue: unknown
  newValue: unknown
}
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function BulkFillDialog({
  title, note, fields, sections, targetCount, targets, currentPersona, onClose, onApply
}: {
  title: string
  /** Short context line shown above the fields (e.g. the trial, or how many activities are involved). */
  note?: string
  fields?: FieldDefinition[]
  sections?: BulkSection[]
  targetCount: number
  /** The items written to, with their saved values, to warn before overwriting existing data. */
  targets?: BulkTarget[]
  currentPersona: string
  onClose: () => void
  /** `values` is the single form's values; `bySection` has every section's filled values keyed by section id. */
  onApply: (values: Record<string, unknown>, submit: boolean, bySection: Record<string, Record<string, unknown>>, skip: Set<string>) => void
}) {
  const blocks: BulkSection[] = sections ?? [{ id: SINGLE, fields: fields ?? [] }]
  const multi = !!sections
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({})
  const setField = (sid: string, key: string, v: unknown) =>
    setDraft((d) => ({ ...d, [sid]: { ...d[sid], [key]: v } }))

  // Only write fields the user filled, so bulk fill never blanks existing values.
  const bySection: Record<string, Record<string, unknown>> = {}
  for (const b of blocks) {
    const filled = Object.fromEntries(Object.entries(draft[b.id] ?? {}).filter(([, v]) => !isBlank(v)))
    if (Object.keys(filled).length) bySection[b.id] = filled
  }
  const filledCount = Object.values(bySection).reduce((n, v) => n + Object.keys(v).length, 0)
  const n = targetCount
  const items = `${n} item${n === 1 ? '' : 's'}`
  // Existing data: filled fields that already hold a different value on an item.
  const [review, setReview] = useState<{ submit: boolean; conflicts: Conflict[] } | null>(null)
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const findConflicts = (): Conflict[] => {
    const out: Conflict[] = []
    for (const t of targets ?? []) {
      const sid = t.sectionId ?? SINGLE
      const filled = bySection[sid]
      if (!filled) continue
      const block = blocks.find((b) => b.id === sid)
      for (const [key, newValue] of Object.entries(filled)) {
        const oldValue = t.values[key]
        const field = block?.fields.find((f) => f.key === key)
        if (!field || isBlank(oldValue) || sameValue(oldValue, newValue)) continue
        out.push({ k: `${t.id}|${key}`, target: t, field, oldValue, newValue })
      }
    }
    return out
  }
  const apply = (submit: boolean) => {
    const conflicts = findConflicts()
    if (conflicts.length > 0) {
      setReview({ submit, conflicts })
      setKeep(new Set()) // default: overwrite; the user can keep any (or all)
      return
    }
    onApply(bySection[SINGLE] ?? {}, submit, bySection, new Set())
  }
  const confirmReview = () => review && onApply(bySection[SINGLE] ?? {}, review.submit, bySection, keep)
  const noFields = blocks.every((b) => b.fields.length === 0)
  if (review) {
    const all = review.conflicts
    const overwriting = all.filter((c) => !keep.has(c.k)).length
    const show = (field: FieldDefinition, value: unknown) => formatValue(field, value) || '—'
    return (
      <Modal
        open
        onClose={() => setReview(null)}
        size="lg"
        title="Data already exists"
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="text-[11px] text-[var(--color-muted)]">{overwriting} to overwrite · {all.length - overwriting} to keep</span>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="md" onClick={() => setReview(null)}>Back</Button>
              <Button variant="primary" size="md" onClick={confirmReview}>{review.submit ? 'Confirm & submit' : 'Confirm & save'}</Button>
            </div>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]">
          <span className="min-w-0 flex-1">
            {all.length} value{all.length === 1 ? '' : 's'} on {new Set(all.map((c) => c.target.id)).size} item(s) already filled. Choose for each whether to overwrite it or keep what is there.
          </span>
          <Button variant="secondary" size="sm" onClick={() => setKeep(new Set())}>Accept all</Button>
          <Button variant="secondary" size="sm" onClick={() => setKeep(new Set(all.map((c) => c.k)))}>Ignore all</Button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--color-surface)] text-left text-[11px] font-medium text-[#344054]">
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
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${!kept ? 'bg-[var(--color-primary)] text-white' : 'text-[#344054]'}`}>Overwrite</button>
                        <button type="button" onClick={() => set(true)} aria-pressed={kept}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${kept ? 'bg-[#475467] text-white' : 'text-[#344054]'}`}>Keep</button>
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
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="text-[11px] text-[var(--color-muted)]">
            {filledCount === 0 ? 'Enter at least one field.' : `${filledCount} field${filledCount === 1 ? '' : 's'} → ${items}`}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" size="md" disabled={filledCount === 0} onClick={() => apply(false)}>Save draft</Button>
            <Button variant="primary" size="md" disabled={filledCount === 0} onClick={() => apply(true)}>Save &amp; submit</Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 rounded-lg border border-[#bfdbfe] bg-secondary px-3 py-2 text-[12px] text-primary">
        {note ? `${note} · ` : ''}The values below are written to {n === 1 ? '1 item' : `all ${items}`}. Fields left blank keep each one's current value.
      </p>
      {noFields ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">
          The selected items have no fields in common that you can fill.
        </p>
      ) : (
        <div className={multi ? 'space-y-4' : ''}>
          {blocks.map((b) => (
            <section key={b.id} className={multi ? 'rounded-lg border border-[var(--color-border)]' : ''}>
              {multi && (
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
                  <h3 className="m-0 text-[13px] font-semibold text-[#101828]">{b.title}</h3>
                  {b.subtitle && <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{b.subtitle}</p>}
                </div>
              )}
              {b.fields.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-[var(--color-muted)]">Nothing you can fill here for the selected parts.</p>
              ) : (
                <div className={`grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2 ${multi ? 'p-4' : ''}`}>
                  {b.fields.map((field) => {
                    const renderer = getFieldRenderer(field.type)
                    return (
                      <div key={field.key} className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-medium text-[#344054]">{field.label}</span>
                          {field.source && <SourceBadge source={field.source as SourceType} />}
                        </div>
                        {renderer.editor({ field, value: draft[b.id]?.[field.key], onChange: (v) => setField(b.id, field.key, v), currentPersona })}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
