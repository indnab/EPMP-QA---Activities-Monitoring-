/**
 * Bulk fill: one form of common fields. Whatever is entered is written to every selected item at once.
 * Only fields the user actually fills are written; blank fields keep each item's current value.
 * Shared by the activity Workspace page and My Work → Insights.
 */
import { useState } from 'react'
import { Button, Modal, getFieldRenderer, SourceBadge } from '../../components'
import type { SourceType } from '../../components'
import type { FieldDefinition } from '../../domain'

export function BulkFillDialog({
  title, note, fields, targetCount, currentPersona, onClose, onApply
}: {
  title: string
  /** Short context line shown above the fields (e.g. the trial, or how many activities are involved). */
  note?: string
  fields: FieldDefinition[]
  targetCount: number
  currentPersona: string
  onClose: () => void
  onApply: (values: Record<string, unknown>, submit: boolean) => void
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const setField = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }))
  // Only write fields the user filled, so bulk fill never blanks existing values.
  const filled = Object.fromEntries(
    Object.entries(draft).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
  )
  const filledCount = Object.keys(filled).length
  const n = targetCount
  const items = `${n} item${n === 1 ? '' : 's'}`

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
            <Button variant="secondary" size="md" disabled={filledCount === 0} onClick={() => onApply(filled, false)}>Save draft</Button>
            <Button variant="primary" size="md" disabled={filledCount === 0} onClick={() => onApply(filled, true)}>Save &amp; submit</Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 rounded-lg border border-[#bfdbfe] bg-secondary px-3 py-2 text-[12px] text-primary">
        {note ? `${note} · ` : ''}The values below are written to {n === 1 ? '1 item' : `all ${items}`}. Fields left blank keep each one's current value.
      </p>
      {fields.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">
          The selected items have no fields in common that you can fill.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          {fields.map((field) => {
            const renderer = getFieldRenderer(field.type)
            return (
              <div key={field.key} className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-[#344054]">{field.label}</span>
                  {field.source && <SourceBadge source={field.source as SourceType} />}
                </div>
                {renderer.editor({ field, value: draft[field.key], onChange: (v) => setField(field.key, v), currentPersona })}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
