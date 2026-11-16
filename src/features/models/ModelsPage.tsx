import { useState, useMemo, useRef } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { Link } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import type { ModelRecord, ProjectArchetype } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { cleanMrds, validateMrds } from '../../domain/mrds'
import { deriveMilestones, plannedDateFields } from '../../domain/wbsTree'
import { MrdEditor } from './MrdEditor'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Format a YYYY-MM-DD date as "24 Oct 2026". */
function fmtDate(d: string | undefined): string {
  if (!d) return '–'
  const [y, m, day] = d.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`
}

// ─── Sync panel ─────────────────────────────────────────────────────────────

interface SyncPanelProps {
  modelName: string
  onClose: () => void
}

function SyncPanel({ modelName, onClose }: SyncPanelProps) {
  const [synced, setSynced] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const allParts = useQAStore((s) => s.parts)

  const partsForModel = useMemo(
    () => allParts.filter((p) => !p.supersededBy && p.model === modelName),
    [allParts, modelName]
  )

  const bySection = useMemo(() => {
    const map: Record<string, typeof partsForModel> = {}
    for (const p of partsForModel) {
      if (!map[p.section]) map[p.section] = []
      map[p.section].push(p)
    }
    return map
  }, [partsForModel])

  const byVendor = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of partsForModel) {
      map[p.vendorName] = (map[p.vendorName] ?? 0) + 1
    }
    return map
  }, [partsForModel])

  function handleSync() {
    setSyncing(true)
    setTimeout(() => { setSyncing(false); setSynced(true) }, 900)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sync parts from ENOVIA / SAP — ${modelName}`}
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        Simulated sync against ENOVIA and SAP mock data. No backend call is made.
      </p>

      {!synced && (
        <Button
          variant="primary"
          onClick={handleSync}
          disabled={syncing}
          className="mb-5"
        >
          {syncing ? 'Syncing…' : 'Run sync'}
        </Button>
      )}

      {synced && (
        <>
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3.5 py-2.5 text-xs text-[#166534]">
            <span className="h-2 w-2 flex-none rounded-full bg-[#16a34a]" />
            Last synced: {new Date().toLocaleString()} · {partsForModel.length} parts found
          </div>

          <h4 className="mb-2 text-[12px] font-semibold text-[var(--color-text)]">Parts by section</h4>
          <table className="mb-5 w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pb-1.5 text-left font-medium text-[var(--color-muted)] w-20">Section</th>
                <th className="pb-1.5 text-right font-medium text-[var(--color-muted)] w-14">Parts</th>
                <th className="pb-1.5 pl-4 text-left font-medium text-[var(--color-muted)]">Part numbers</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySection)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([section, parts]) => (
                  <tr key={section} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-1.5 font-medium">{section}</td>
                    <td className="py-1.5 text-right text-[var(--color-muted)]">{parts.length}</td>
                    <td className="py-1.5 pl-4 text-[var(--color-muted)] break-all">{parts.map((p) => p.partNo).join(', ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <h4 className="mb-2 text-[12px] font-semibold text-[var(--color-text)]">Parts by vendor</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pb-1.5 text-left font-medium text-[var(--color-muted)]">Vendor</th>
                <th className="pb-1.5 text-right font-medium text-[var(--color-muted)] w-14">Parts</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byVendor)
                .sort(([, a], [, b]) => b - a)
                .map(([vendor, count]) => (
                  <tr key={vendor} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-1.5">{vendor}</td>
                    <td className="py-1.5 text-right text-[var(--color-muted)]">{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {!synced && !syncing && partsForModel.length === 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          No parts found for <strong>{modelName}</strong> in the mock dataset.
        </p>
      )}
    </Modal>
  )
}

// ─── Model form (add / edit) ─────────────────────────────────────────────────
interface ModelFormHandle {
  submit: () => void
}
interface ModelFormProps {
  initial: ModelRecord | null
  archetypes: ProjectArchetype[]
  /** The archetype whose planned dates the model is shown with (its project's, else the first active one). */
  defaultArchetypeId: string
  /** Locked when the model is in a project (its dates follow that project's archetype). */
  lockArchetype: boolean
  existingNames: string[]
  onSave: (model: ModelRecord) => void
  formRef: React.RefObject<ModelFormHandle | null>
}
function ModelForm({ initial, archetypes, defaultArchetypeId, lockArchetype, existingNames, onSave, formRef }: ModelFormProps) {
  const isEdit = initial !== null
  const [name, setName] = useState(initial?.name ?? '')
  const [mrds, setMrds] = useState<Record<string, string>>({ ...(initial?.mrds ?? {}) })
  const [arcId, setArcId] = useState(defaultArchetypeId)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const arc = archetypes.find((a) => a.id === arcId)
  // Expose submit() for the footer button
  formRef.current = {
    submit() {
      const next: Record<string, string> = { ...validateMrds(arc, mrds) }
      if (!name.trim()) next['_name'] = 'Model name is required.'
      else if (!isEdit && existingNames.includes(name.trim())) next['_name'] = 'A model with this name already exists.'
      setErrors(next)
      if (Object.keys(next).length > 0) return
      onSave({ name: name.trim(), mrds: cleanMrds(mrds) })
    }
  }
  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
            Model name <span className="text-[var(--color-destructive)]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errors['_name']) setErrors((er) => { const n = { ...er }; delete n['_name']; return n })
            }}
            disabled={isEdit}
            placeholder="e.g. Swift"
            className={`w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
              ${errors['_name'] ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}
              ${isEdit ? 'bg-[var(--color-surface)] text-[var(--color-muted)]' : 'bg-white'}`}
          />
          {errors['_name'] && <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors['_name']}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">Planned dates of archetype</label>
          <select value={arcId} disabled={lockArchetype} onChange={(e) => setArcId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs disabled:bg-[var(--color-surface)] disabled:text-[var(--color-muted)]">
            {archetypes.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
          </select>
          <p className="mt-1 text-[10px] text-[var(--color-muted)]">{lockArchetype ? 'Set by the model’s project.' : 'The project’s archetype decides this at initiation.'}</p>
        </div>
      </div>
      <MrdEditor archetype={arc} mrds={mrds} onChange={setMrds} errors={errors} idPrefix="model" />
    </div>
  )
}
// ─── Main page ───────────────────────────────────────────────────────────────

export function ModelsPage() {
  const { models, archetypes, addModel, updateModel, deleteModel, projects } = useQAStore()
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ModelRecord | null>(null)
  const [syncTarget, setSyncTarget] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Ref used to call ModelForm.submit() from the modal footer button
  const formHandleRef = useRef<{ submit: () => void } | null>(null)

  const existingNames = models.map((m) => m.name)

  function openAdd() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(model: ModelRecord) {
    setEditing(model)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  function handleSave(model: ModelRecord) {
    if (editing) {
      updateModel(editing.name, { mrds: model.mrds })
    } else {
      addModel(model)
    }
    closeForm()
  }

  function handleDelete(name: string) {
    const r = deleteModel(name)
    if (!r.ok) { setDeleteBlocked(r.reason); return }
    setDeleteBlocked(null)
    setConfirmDelete(null)
  }

  // Table columns: every planned date of every archetype, grouped by milestone (own date first, then MRD types).
  const tableCols = useMemo(() => {
    const ms = new Map(deriveMilestones(archetypes).map((m) => [m.id, m.label]))
    const seen = new Set<string>()
    const cols: { key: string; label: string; group?: string; mandatory?: boolean }[] = []
    for (const a of archetypes) {
      for (const f of plannedDateFields(a)) {
        if (seen.has(f.key)) continue
        seen.add(f.key)
        cols.push({ key: f.key, label: f.typeId ? f.label.replace(/ MRD$/, '') : 'Date', group: ms.get(f.milestoneId) ?? f.milestoneName, mandatory: f.required })
      }
    }
    return cols
  }, [archetypes])
  // Count columns per group so the grouped header spans correctly.
  const groupSpans = useMemo(() => {
    const out: { label: string; span: number; grouped: boolean }[] = []
    for (const c of tableCols) {
      const last = out[out.length - 1]
      if (c.group) {
        if (last && last.label === c.group && last.grouped) last.span += 1
        else out.push({ label: c.group, span: 1, grouped: true })
      } else {
        out.push({ label: '', span: 1, grouped: false })
      }
    }
    return out
  }, [tableCols])

  return (
    <div>
      <PageHeader
        title="Models & MRDs"
        description={`Manage vehicle models and their planned dates. Which dates exist comes from the milestones of the archetype (Governance). Blank dates show "Awaiting MRD" on activities.`}
        section="Division Model Coordinator"
        actions={
          <Button variant="primary" onClick={openAdd}>
            + Add model
          </Button>
        }
      />

      {/* Models table */}
      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              {/* Group row: PP / MPP / Pilot span their sub-type columns */}
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th rowSpan={2} className="px-4 py-2 text-left font-semibold text-[var(--color-text)] min-w-[110px] align-bottom">Model</th>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium text-[var(--color-muted)] align-bottom whitespace-nowrap">Project</th>
                {groupSpans.map((g, i) => (
                  <th key={i} colSpan={g.span} className={`px-3 py-1.5 text-center font-semibold whitespace-nowrap ${g.grouped ? 'text-primary border-l border-[var(--color-border)]' : 'text-transparent'}`}>
                    {g.grouped ? g.label : '·'}
                  </th>
                ))}
                <th rowSpan={2} className="px-4 py-2 text-right font-medium text-[var(--color-muted)] align-bottom">Actions</th>
              </tr>
              {/* Column row: sub-type names, and plain milestone names */}
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                {tableCols.map((c, i) => (
                  <th key={c.key} className={`px-3 py-2 text-center font-medium text-[var(--color-muted)] whitespace-nowrap ${c.group && (i === 0 || tableCols[i - 1]?.group !== c.group) ? 'border-l border-[var(--color-border)]' : ''}`}>
                    {c.label}
                    {c.mandatory && <span className="ml-0.5 text-[var(--color-destructive)]">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.length === 0 && (
                <tr>
                  <td
                    colSpan={tableCols.length + 3}
                    className="px-4 py-10 text-center text-[var(--color-muted)]"
                  >
                    No models yet. Click "+ Add model" to get started.
                  </td>
                </tr>
              )}
              {models.map((model) => (
                <tr
                  key={model.name}
                  className="border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[#fafafa]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{model.name}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {(() => {
                      const prj = projectOfModel(model.name, projects)
                      return prj
                        ? <Link to={`/projects/${prj.no}`} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary hover:underline" title={prj.name}>{prj.no}</Link>
                        : <span className="italic text-[var(--color-muted)]">—</span>
                    })()}
                  </td>
                  {tableCols.map((c, i) => {
                    const date = model.mrds[c.key]
                    return (
                      <td key={c.key} className={`px-3 py-3 text-center ${c.group && (i === 0 || tableCols[i - 1]?.group !== c.group) ? 'border-l border-[var(--color-border)]' : ''}`}>
                        {date ? <span>{fmtDate(date)}</span> : <span className="italic text-[var(--color-muted)]">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setSyncTarget(model.name)}
                        className="text-[11px] font-medium text-[#0891b2] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                      >
                        Sync parts
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(model)}
                        className="text-[11px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] rounded"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(model.name)}
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
        </div>
      </Card>

      {/* Add / Edit model modal */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? `Edit model — ${editing.name}` : 'Add model'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => formHandleRef.current?.submit()}>
              {editing ? 'Save changes' : 'Add model'}
            </Button>
          </>
        }
      >
        <ModelForm
          key={editing?.name ?? '__new__'}
          initial={editing}
          archetypes={archetypes}
          defaultArchetypeId={(editing && projectOfModel(editing.name, projects)?.archetypeId) || archetypes.find((a) => a.active)?.id || archetypes[0]?.id || ''}
          lockArchetype={!!(editing && projectOfModel(editing.name, projects))}
          existingNames={existingNames}
          onSave={handleSave}
          formRef={formHandleRef}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => { setConfirmDelete(null); setDeleteBlocked(null) }}
        title="Delete model"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete !== null && handleDelete(confirmDelete)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Delete <strong>{confirmDelete}</strong>? This removes the model record. Existing activity entries are unaffected.
        </p>
        {deleteBlocked && <p className="mt-2 text-sm text-[var(--color-destructive)]">{deleteBlocked}</p>}
      </Modal>

      {/* Sync parts panel */}
      {syncTarget !== null && (
        <SyncPanel modelName={syncTarget} onClose={() => setSyncTarget(null)} />
      )}
    </div>
  )
}
