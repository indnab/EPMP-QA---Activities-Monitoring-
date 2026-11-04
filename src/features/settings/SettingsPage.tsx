import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useQAStore } from '../../store/qaStore'
import type { Section, MilestoneDef } from '../../domain'

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
  const { milestones, addMilestone, updateMilestone, deleteMilestone } = useQAStore()

  const [addOpen, setAddOpen] = useState(false)
  const [editMilestone, setEditMilestone] = useState<MilestoneDef | null>(null)
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
    const trimId = addId.trim()
    const trimLabel = addLabel.trim()
    if (!trimId) errs.id = 'Milestone ID is required.'
    else if (milestones.some((m) => m.id === trimId)) errs.id = 'A milestone with this ID already exists.'
    if (!trimLabel) errs.label = 'Label is required.'
    setAddErrors(errs)
    if (Object.keys(errs).length > 0) return
    // New milestones are always optional
    addMilestone({ id: trimId, label: trimLabel, mandatory: false })
    setAddOpen(false)
  }

  function openEdit(m: MilestoneDef) {
    setEditMilestone(m)
    setEditLabel(m.label)
    setEditError('')
  }

  function handleEditSave() {
    const trimLabel = editLabel.trim()
    if (!trimLabel) { setEditError('Label is required.'); return }
    if (editMilestone) updateMilestone(editMilestone.id, { label: trimLabel })
    setEditMilestone(null)
  }

  function handleDelete() {
    if (deleteId) deleteMilestone(deleteId)
    setDeleteId(null)
  }

  const deleteMilestone_ = milestones.find((m) => m.id === deleteId)

  return (
    <Card title="Milestones" actions={<Button variant="primary" size="sm" onClick={openAdd}>+ Add milestone</Button>}>
      <p className="mb-3 text-[11px] text-[var(--color-muted)]">
        PP, MPP, Pilot and SOP are mandatory — they cannot be deleted or have their mandatory flag changed.
        New milestones are optional.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="pb-2 text-left font-medium text-[var(--color-muted)] w-24">ID</th>
            <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Label</th>
            <th className="pb-2 pl-3 text-center font-medium text-[var(--color-muted)] w-20">Mandatory</th>
            <th className="pb-2 pl-3 text-right font-medium text-[var(--color-muted)] w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {milestones.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-[var(--color-muted)]">No milestones configured.</td>
            </tr>
          )}
          {milestones.map((m) => (
            <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[#fafafa]">
              <td className="py-2 font-mono text-[var(--color-text)]">{m.id}</td>
              <td className="py-2 pl-3 text-[var(--color-text)]">{m.label}</td>
              <td className="py-2 pl-3 text-center">
                {m.mandatory ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-medium text-[#991b1b]">
                    Required
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                    Optional
                  </span>
                )}
              </td>
              <td className="py-2 pl-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="text-[11px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                  >
                    Rename
                  </button>
                  {m.mandatory ? (
                    <span
                      className="text-[11px] text-[var(--color-muted)] cursor-not-allowed"
                      title="Mandatory milestones cannot be deleted"
                    >
                      Delete
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteId(m.id)}
                      className="text-[11px] font-medium text-[var(--color-destructive)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add milestone modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add milestone"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd}>Add milestone</Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineField
            label="Milestone ID (e.g. Jig2)"
            value={addId}
            placeholder="Jig2"
            error={addErrors.id}
            onChange={setAddId}
          />
          <InlineField
            label="Label"
            value={addLabel}
            placeholder="Jig 2"
            error={addErrors.label}
            onChange={setAddLabel}
          />
          <p className="text-[11px] text-[var(--color-muted)]">New milestones are optional by default.</p>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={editMilestone !== null}
        onClose={() => setEditMilestone(null)}
        title={`Rename milestone — ${editMilestone?.id}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditMilestone(null)}>Cancel</Button>
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
        title="Delete milestone"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm">
          Delete milestone <strong>{deleteMilestone_?.label ?? deleteId}</strong>?
        </p>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          All template rows and model MRD values using this milestone will be removed.
        </p>
      </Modal>
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
