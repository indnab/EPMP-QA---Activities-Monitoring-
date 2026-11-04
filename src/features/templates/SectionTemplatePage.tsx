import { useState, useMemo } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore, getPersonaScope, FIXED_SECTION } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { makeTemplateRowId } from '../../domain'
import type { TemplateRow, ActivityDefinition, MilestoneDef, Section, ModelRecord } from '../../domain'
import { resolveInstanceDates } from '../../engine'
import { activitiesForNewUse } from '../scope'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`
}

function fmtOffset(n: number): string {
  if (n === 0) return 'MRD'
  return n > 0 ? `MRD +${n}d` : `MRD ${n}d`
}

// ─── Row form (add / edit-offsets) ────────────────────────────────────────────

interface RowFormState {
  activityId: string
  milestoneId: string
  startOffset: number
  endOffset: number
}

interface RowFormErrors {
  activityId?: string
  milestoneId?: string
  startOffset?: string
  duplicate?: string
}

interface RowFormProps {
  initial: RowFormState
  /** When true, activity+milestone are locked (offset-edit mode) */
  lockIdentity: boolean
  activities: ActivityDefinition[]
  milestones: MilestoneDef[]
  existingRows: TemplateRow[]
  editingRowId?: string
  onSave: (row: RowFormState) => void
  onCancel: () => void
}

function RowForm({
  initial,
  lockIdentity,
  activities,
  milestones,
  existingRows,
  editingRowId,
  onSave,
  onCancel,
}: RowFormProps) {
  const [form, setForm] = useState<RowFormState>(initial)
  const [errors, setErrors] = useState<RowFormErrors>({})

  function set<K extends keyof RowFormState>(key: K, val: RowFormState[K]) {
    setForm((p) => ({ ...p, [key]: val }))
    setErrors((e) => { const n = { ...e }; delete (n as any)[key]; delete n.duplicate; return n })
  }

  function validate(): boolean {
    const next: RowFormErrors = {}
    if (!form.activityId) next.activityId = 'Activity is required.'
    if (!form.milestoneId) next.milestoneId = 'Milestone is required.'
    if (form.startOffset > form.endOffset) {
      next.startOffset = 'Start offset must not be after end offset.'
    }
    // Duplicate (activity, milestone) per section — exclude the row being edited
    const dup = existingRows.find(
      (r) =>
        r.id !== editingRowId &&
        r.activityId === form.activityId &&
        r.milestoneId === form.milestoneId
    )
    if (dup) next.duplicate = 'This activity + milestone combination already exists in the template.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSave() {
    if (validate()) onSave(form)
  }

  // New rows can only use activities that are published and not deleted (retired)
  const publishedActivities = activitiesForNewUse(activities).filter((a) => a.published !== false)

  return (
    <div>
      {/* Activity */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
          Activity <span className="text-[var(--color-destructive)]">*</span>
        </label>
        {lockIdentity ? (
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
            {activities.find((a) => a.id === form.activityId)?.name ?? form.activityId}
          </p>
        ) : (
          <select
            value={form.activityId}
            onChange={(e) => set('activityId', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
              ${errors.activityId ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}
          >
            <option value="">Select activity…</option>
            {publishedActivities.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {errors.activityId && (
          <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors.activityId}</p>
        )}
      </div>

      {/* Milestone */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
          Milestone <span className="text-[var(--color-destructive)]">*</span>
        </label>
        {lockIdentity ? (
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
            {milestones.find((m) => m.id === form.milestoneId)?.label ?? form.milestoneId}
          </p>
        ) : (
          <select
            value={form.milestoneId}
            onChange={(e) => set('milestoneId', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
              ${errors.milestoneId ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}
          >
            <option value="">Select milestone…</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
        {errors.milestoneId && (
          <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors.milestoneId}</p>
        )}
      </div>

      {/* Offsets */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
            Start offset (days)
          </label>
          <input
            type="number"
            value={form.startOffset}
            onChange={(e) => set('startOffset', parseInt(e.target.value, 10) || 0)}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
              ${errors.startOffset ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}
          />
          {errors.startOffset && (
            <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors.startOffset}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
            End offset (days)
          </label>
          <input
            type="number"
            value={form.endOffset}
            onChange={(e) => set('endOffset', parseInt(e.target.value, 10) || 0)}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
              ${errors.startOffset ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}
          />
        </div>
      </div>
      <p className="mb-4 text-[11px] text-[var(--color-muted)]">
        Negative = before MRD (e.g. −30 = 30 days before). Positive = after MRD. Start must not be after end.
      </p>

      {errors.duplicate && (
        <div className="mb-4 rounded-lg border border-[var(--color-destructive)] bg-[#fff5f5] px-3.5 py-2.5 text-[11px] text-[var(--color-destructive)]">
          {errors.duplicate}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save row</Button>
      </div>
    </div>
  )
}

// ─── Live preview table ────────────────────────────────────────────────────────

interface PreviewTableProps {
  rows: TemplateRow[]
  activities: ActivityDefinition[]
  milestones: MilestoneDef[]
  models: ModelRecord[]
  selectedModel: string
  onModelChange: (name: string) => void
}

function PreviewTable({ rows, activities, milestones, models, selectedModel, onModelChange }: PreviewTableProps) {
  const model = models.find((m) => m.name === selectedModel)

  return (
    <Card title="Live preview" actions={
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
      >
        {models.length === 0 && <option value="">No models</option>}
        {models.map((m) => (
          <option key={m.name} value={m.name}>{m.name}</option>
        ))}
      </select>
    }>
      {rows.length === 0 ? (
        <p className="py-4 text-xs text-[var(--color-muted)]">Add template rows to see the preview.</p>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pb-2 text-left font-medium text-[var(--color-muted)]">Activity</th>
                <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Milestone</th>
                <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Offsets</th>
                <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Resolved start</th>
                <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Resolved end</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const activity = activities.find((a) => a.id === row.activityId)
                const milestone = milestones.find((m) => m.id === row.milestoneId)
                const dates = resolveInstanceDates(row, model)
                return (
                  <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 font-medium text-[var(--color-text)] max-w-[180px] truncate" title={activity?.name}>
                      {activity?.name ?? row.activityId}
                    </td>
                    <td className="py-2 pl-3 text-[var(--color-muted)]">{milestone?.label ?? row.milestoneId}</td>
                    <td className="py-2 pl-3 text-[var(--color-muted)] tabular-nums">
                      {fmtOffset(row.startOffset)} → {fmtOffset(row.endOffset)}
                    </td>
                    {dates.status === 'resolved' ? (
                      <>
                        <td className="py-2 pl-3 tabular-nums">{fmtDate(dates.start)}</td>
                        <td className="py-2 pl-3 tabular-nums">{fmtDate(dates.end)}</td>
                      </>
                    ) : (
                      <td colSpan={2} className="py-2 pl-3 italic text-[var(--color-muted)]">
                        Awaiting MRD ({dates.milestoneId})
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Delete confirm modal ──────────────────────────────────────────────────────

interface DeleteConfirmProps {
  rowId: string | null
  activities: ActivityDefinition[]
  milestones: MilestoneDef[]
  rows: TemplateRow[]
  entries: { templateRowId: string }[]
  onConfirm: (id: string) => void
  onCancel: () => void
}

function DeleteConfirm({ rowId, activities, milestones, rows, entries, onConfirm, onCancel }: DeleteConfirmProps) {
  if (!rowId) return null
  const row = rows.find((r) => r.id === rowId)
  const activity = activities.find((a) => a.id === row?.activityId)
  const milestone = milestones.find((m) => m.id === row?.milestoneId)
  const entryCount = entries.filter((e) => e.templateRowId === rowId).length

  return (
    <Modal
      open
      onClose={onCancel}
      title="Remove template row"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(rowId)}>Remove</Button>
        </>
      }
    >
      <p className="text-sm">
        Remove <strong>{activity?.name ?? row?.activityId}</strong> under <strong>{milestone?.label ?? row?.milestoneId}</strong>?
      </p>
      {entryCount > 0 && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          This will also delete <strong>{entryCount}</strong> existing entr{entryCount === 1 ? 'y' : 'ies'} for this row.
        </p>
      )}
    </Modal>
  )
}

// ─── Section picker (Admin only) ──────────────────────────────────────────────

function resolveSection(persona: PersonaId, sections: Section[]): string {
  const scope = getPersonaScope(persona)
  if (scope.section) return scope.section
  // Admin: default to first section
  return sections[0]?.id ?? FIXED_SECTION
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SectionTemplatePage() {
  const { activities, milestones, sections, models, templateRows, entries, addTemplateRow, updateTemplateRow, deleteTemplateRow } = useQAStore()
  const currentPersona = usePersonaStore((s) => s.currentPersona)

  const isAdmin = currentPersona === 'Admin'
  const isSectionAdmin = currentPersona === 'SectionAdmin'

  // Section selection
  const [selectedSection, setSelectedSection] = useState<string>(() =>
    resolveSection(currentPersona, sections)
  )
  const effectiveSection = isAdmin ? selectedSection : resolveSection(currentPersona, sections)

  // Preview model
  const [previewModel, setPreviewModel] = useState<string>(models[0]?.name ?? '')

  // Row editor modal
  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState<TemplateRow | null>(null)
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null)

  const sectionRows = useMemo(
    () => templateRows.filter((r) => r.section === effectiveSection),
    [templateRows, effectiveSection]
  )

  const sectionLabel = sections.find((s) => s.id === effectiveSection)?.label ?? effectiveSection

  function handleAdd(form: RowFormState) {
    const id = makeTemplateRowId(effectiveSection, form.activityId, form.milestoneId)
    addTemplateRow({
      id,
      section: effectiveSection,
      activityId: form.activityId,
      milestoneId: form.milestoneId,
      startOffset: form.startOffset,
      endOffset: form.endOffset,
    })
    setAddOpen(false)
  }

  function handleEditSave(form: RowFormState) {
    if (!editRow) return
    // Only offsets can be changed — activity and milestone are locked in the form
    updateTemplateRow(editRow.id, {
      startOffset: form.startOffset,
      endOffset: form.endOffset,
    })
    setEditRow(null)
  }

  function handleDuplicateRow(row: TemplateRow) {
    // Silently find a unique id by adding a suffix if needed; open add dialog pre-populated
    // We open the add modal — user picks a different activity or milestone to avoid clash
    void row // used via the modal initial state below
    setDuplicateSource(row)
    setAddOpen(true)
  }

  const [duplicateSource, setDuplicateSource] = useState<TemplateRow | null>(null)

  function openAdd() {
    setDuplicateSource(null)
    setAddOpen(true)
  }

  function handleDeleteConfirm(id: string) {
    deleteTemplateRow(id)
    setDeleteRowId(null)
  }

  const addInitial: RowFormState = duplicateSource
    ? {
        activityId: duplicateSource.activityId,
        milestoneId: duplicateSource.milestoneId,
        startOffset: duplicateSource.startOffset,
        endOffset: duplicateSource.endOffset,
      }
    : { activityId: '', milestoneId: '', startOffset: 0, endOffset: 0 }

  return (
    <div>
      <PageHeader
        title="Section Template"
        description={
          isAdmin
            ? 'Admin view — read-only. Select a section to inspect its template.'
            : `Define which activities apply to ${sectionLabel}, under which milestone, and with what MRD-offset dates.`
        }
        section="Department Co-ordinator"
        actions={
          <>
            {isAdmin && (
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            )}
            {isSectionAdmin && (
              <Button variant="primary" onClick={openAdd}>
                + Add row
              </Button>
            )}
          </>
        }
      />

      {/* Edit-identity notice */}
      {isSectionAdmin && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5 text-xs text-[#1e40af]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            Editing a row changes its <strong>offsets only</strong>. To change the activity or milestone, duplicate the row and delete the original.
          </span>
        </div>
      )}

      {/* Template rows table */}
      <Card flush className="mb-5">
        <div className="table-scroll">
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-4 py-3 text-left font-semibold text-[var(--color-text)]">Activity</th>
                <th className="px-3 py-3 text-left font-medium text-[var(--color-muted)]">Milestone</th>
                <th className="px-3 py-3 text-center font-medium text-[var(--color-muted)]">Start offset</th>
                <th className="px-3 py-3 text-center font-medium text-[var(--color-muted)]">End offset</th>
                {isSectionAdmin && (
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sectionRows.length === 0 && (
                <tr>
                  <td
                    colSpan={isSectionAdmin ? 5 : 4}
                    className="px-4 py-10 text-center text-[var(--color-muted)]"
                  >
                    {effectiveSection} has no template rows yet.
                    {isSectionAdmin && ' Click "+ Add row" to get started.'}
                  </td>
                </tr>
              )}
              {sectionRows.map((row) => {
                const activity = activities.find((a) => a.id === row.activityId)
                const milestone = milestones.find((m) => m.id === row.milestoneId)
                return (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[#fafafa]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text)] max-w-[240px]">
                      <div className="truncate" title={activity?.name}>{activity?.name ?? row.activityId}</div>
                    </td>
                    <td className="px-3 py-3 text-[var(--color-muted)]">{milestone?.label ?? row.milestoneId}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--color-muted)]">{fmtOffset(row.startOffset)}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-[var(--color-muted)]">{fmtOffset(row.endOffset)}</td>
                    {isSectionAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditRow(row)}
                            className="text-[11px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                          >
                            Edit offsets
                          </button>
                          {/* A deleted activity cannot be used for a new row, so its rows cannot be duplicated */}
                          {!activity?.retired && (
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(row)}
                              className="text-[11px] font-medium text-[#0891b2] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                            >
                              Duplicate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteRowId(row.id)}
                            className="text-[11px] font-medium text-[var(--color-destructive)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Live preview */}
      {models.length > 0 && (
        <PreviewTable
          rows={sectionRows}
          activities={activities}
          milestones={milestones}
          models={models}
          selectedModel={previewModel || models[0].name}
          onModelChange={setPreviewModel}
        />
      )}

      {/* Add row modal */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setDuplicateSource(null) }}
        title="Add template row"
        size="md"
      >
        <RowForm
          initial={addInitial}
          lockIdentity={false}
          activities={activities}
          milestones={milestones}
          existingRows={sectionRows}
          onSave={handleAdd}
          onCancel={() => { setAddOpen(false); setDuplicateSource(null) }}
        />
      </Modal>

      {/* Edit offsets modal */}
      <Modal
        open={editRow !== null}
        onClose={() => setEditRow(null)}
        title="Edit offsets"
        size="md"
      >
        {editRow && (
          <RowForm
            key={editRow.id}
            initial={{
              activityId: editRow.activityId,
              milestoneId: editRow.milestoneId,
              startOffset: editRow.startOffset,
              endOffset: editRow.endOffset,
            }}
            lockIdentity={true}
            activities={activities}
            milestones={milestones}
            existingRows={sectionRows}
            editingRowId={editRow.id}
            onSave={handleEditSave}
            onCancel={() => setEditRow(null)}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <DeleteConfirm
        rowId={deleteRowId}
        activities={activities}
        milestones={milestones}
        rows={sectionRows}
        entries={entries}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteRowId(null)}
      />
    </div>
  )
}
