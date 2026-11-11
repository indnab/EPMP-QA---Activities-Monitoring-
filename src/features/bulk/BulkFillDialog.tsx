/**
 * Bulk fill: one form of common fields. Whatever is entered is written to every selected item at once.
 * Only fields the user actually fills are written; blank fields keep each item's current value.
 *
 * Pass `fields` for a single form, or `sections` to fill several activities at once (one block per activity;
 * values are kept per section, so two activities with the same field key never overwrite each other).
 * Shared by the activity Workspace page, My Work → Insights and the Bulk Entry grid.
 */
import { useState } from 'react'
import { Button, Modal, getFieldRenderer, SourceBadge } from '../../components'
import type { SourceType } from '../../components'
import type { FieldDefinition } from '../../domain'

export interface BulkSection {
  id: string
  title?: string
  /** Small line under the section title, e.g. "applies to 3 parts · 1 locked part skipped". */
  subtitle?: string
  fields: FieldDefinition[]
}

const SINGLE = '_'
const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function BulkFillDialog({
  title, note, fields, sections, targetCount, currentPersona, onClose, onApply
}: {
  title: string
  /** Short context line shown above the fields (e.g. the trial, or how many activities are involved). */
  note?: string
  fields?: FieldDefinition[]
  sections?: BulkSection[]
  targetCount: number
  currentPersona: string
  onClose: () => void
  /** `values` is the single form's values; `bySection` has every section's filled values keyed by section id. */
  onApply: (values: Record<string, unknown>, submit: boolean, bySection: Record<string, Record<string, unknown>>) => void
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
  const apply = (submit: boolean) => onApply(bySection[SINGLE] ?? {}, submit, bySection)
  const noFields = blocks.every((b) => b.fields.length === 0)

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
