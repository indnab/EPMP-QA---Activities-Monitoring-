import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useQAStore } from '../../store/qaStore'
import type { Section } from '../../domain'
import { Link } from 'react-router-dom'
import { dateOptions, milestoneRows } from '../../domain/wbsTree'

// ─── Inline field ─────────────────────────────────────────────────────────────

interface InlineFieldProps {
  label: string
  value: string
  placeholder?: string
  error?: string
  onChange: (v: string) => void
}

function InlineField({ label, value, placeholder, error, onChange }: InlineFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
        {label} <span className="text-[var(--color-destructive)]">*</span>
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
          ${error ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}
      />
      {error && <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

// ─── Sections panel ───────────────────────────────────────────────────────────

function SectionsPanel() {
  const { sections, templateRows, addSection, updateSection, deleteSection } = useQAStore()

  const [addOpen, setAddOpen] = useState(false)
  const [editSection, setEditSection] = useState<Section | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Add form
  const [addId, setAddId] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addErrors, setAddErrors] = useState<{ id?: string; label?: string }>({})

  // Edit form
  const [editLabel, setEditLabel] = useState('')
  const [editError, setEditError] = useState('')

  function openAdd() {
    setAddId('')
    setAddLabel('')
    setAddErrors({})
    setAddOpen(true)
  }

  function handleAdd() {
    const errs: { id?: string; label?: string } = {}
    const trimId = addId.trim().toUpperCase()
    const trimLabel = addLabel.trim()
    if (!trimId) errs.id = 'Section ID is required.'
    else if (sections.some((s) => s.id === trimId)) errs.id = 'A section with this ID already exists.'
    if (!trimLabel) errs.label = 'Label is required.'
    setAddErrors(errs)
    if (Object.keys(errs).length > 0) return
    addSection({ id: trimId, label: trimLabel })
    setAddOpen(false)
  }

  function openEdit(s: Section) {
    setEditSection(s)
    setEditLabel(s.label)
    setEditError('')
  }

  function handleEditSave() {
    const trimLabel = editLabel.trim()
    if (!trimLabel) { setEditError('Label is required.'); return }
    if (editSection) updateSection(editSection.id, { label: trimLabel })
    setEditSection(null)
  }

  function confirmDelete(id: string) {
    setDeleteId(id)
  }

  function handleDelete() {
    if (deleteId) deleteSection(deleteId)
    setDeleteId(null)
  }

  const deleteSection_ = sections.find((s) => s.id === deleteId)
  const cascadeRowCount = templateRows.filter((r) => r.section === deleteId).length

  return (
    <Card title="Sections" actions={<Button variant="primary" size="sm" onClick={openAdd}>+ Add section</Button>}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="pb-2 text-left font-medium text-[var(--color-muted)] w-24">ID</th>
            <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Label</th>
            <th className="pb-2 pl-3 text-right font-medium text-[var(--color-muted)] w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sections.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-[var(--color-muted)]">No sections configured.</td>
            </tr>
          )}
          {sections.map((s) => (
            <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[#fafafa]">
              <td className="py-2 font-mono text-[var(--color-text)]">{s.id}</td>
              <td className="py-2 pl-3 text-[var(--color-text)]">{s.label}</td>
              <td className="py-2 pl-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="text-[11px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(s.id)}
                    className="text-[11px] font-medium text-[var(--color-destructive)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add section modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add section"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd}>Add section</Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineField
            label="Section ID (e.g. NP7)"
            value={addId}
            placeholder="NP7"
            error={addErrors.id}
            onChange={setAddId}
          />
          <InlineField
            label="Label"
            value={addLabel}
            placeholder="NP7"
            error={addErrors.label}
            onChange={setAddLabel}
          />
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={editSection !== null}
        onClose={() => setEditSection(null)}
        title={`Rename section — ${editSection?.id}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditSection(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleEditSave}>Save</Button>
          </>
        }
      >
        <InlineField
          label="Label"
          value={editLabel}
          error={editError}
          onChange={(v) => { setEditLabel(v); setEditError('') }}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete section"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm">
          Delete section <strong>{deleteSection_?.label ?? deleteId}</strong>?
        </p>
        {cascadeRowCount > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-xs text-[#92400e]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              This will also delete <strong>{cascadeRowCount}</strong> template row{cascadeRowCount !== 1 ? 's' : ''} and all their entries.
            </span>
          </div>
        )}
      </Modal>
    </Card>
  )
}

// ─── Milestones panel ─────────────────────────────────────────────────────────

function MilestonesPanel() {
  const archetypes = useQAStore((s) => s.archetypes)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-[var(--color-text)]">Milestones</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Milestones and their planned dates are defined per archetype in Governance.</p>
        </div>
        <Link to="/governance" className="text-[12px] font-semibold text-[var(--color-accent)] hover:underline">Open Governance →</Link>
      </div>
      <div className="space-y-3">
        {archetypes.map((a) => (
          <div key={a.id} className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="mb-2 text-[12px] font-semibold text-[#101828]">{a.name} <span className="font-mono text-[10px] font-normal text-[var(--color-muted)]">{a.id}</span></div>
            <div className="flex flex-wrap gap-2">
              {milestoneRows(a).map((m) => (
                <span key={m.id} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-primary" title={dateOptions(m).map((d) => d.label).join(', ')}>
                  <strong>{m.name}</strong> · {dateOptions(m).length} planned date{dateOptions(m).length === 1 ? '' : 's'}
                </span>
              ))}
              {milestoneRows(a).length === 0 && <span className="text-[11px] text-[var(--color-muted)]">No milestones</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
// ─── Main page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage the sections and milestone lists used across the QA Activity Tracker."
        section="Admin"
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionsPanel />
        <MilestonesPanel />
      </div>
    </div>
  )
}
