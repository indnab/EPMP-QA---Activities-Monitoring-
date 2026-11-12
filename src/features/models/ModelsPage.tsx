import { useState, useMemo, useRef } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useQAStore } from '../../store/qaStore'
import type { ModelRecord, MilestoneDef } from '../../domain'
import { TIMELINE_MILESTONES, SUBTYPE_LABEL, subTypesFor, subTypeMrdKey } from '../../domain/timelineCatalog'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Given milestones in their configured order, return the set of milestone ids
 * whose dates violate chronological order (non-blocking warning only).
 */
function findOutOfOrderMilestones(
  milestones: MilestoneDef[],
  mrds: Record<string, string>
): Set<string> {
  const filled = milestones.map((m) => ({ id: m.id, date: mrds[m.id] })).filter((m) => m.date)
  const bad = new Set<string>()
  for (let i = 1; i < filled.length; i++) {
    if (filled[i].date < filled[i - 1].date) {
      bad.add(filled[i].id)
      bad.add(filled[i - 1].id)
    }
  }
  return bad
}

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
  milestones: MilestoneDef[]
  existingNames: string[]
  onSave: (model: ModelRecord) => void
  formRef: React.RefObject<ModelFormHandle | null>
}

function ModelForm({ initial, milestones, existingNames, onSave, formRef }: ModelFormProps) {
  const isEdit = initial !== null
  const [name, setName] = useState(initial?.name ?? '')
  const [mrds, setMrds] = useState<Record<string, string>>({ ...(initial?.mrds ?? {}) })
  // Governance: the project archetype this model (project) follows.
  const archetypes = useQAStore((s) => s.archetypes)
  const [archetypeId, setArchetypeId] = useState<string>(initial?.archetypeId ?? archetypes.find((a) => a.active)?.id ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const outOfOrder = useMemo(() => findOutOfOrderMilestones(milestones, mrds), [milestones, mrds])

  // Expose submit() for the footer button
  formRef.current = {
    submit() {
      const next: Record<string, string> = {}
      if (!name.trim()) {
        next['_name'] = 'Model name is required.'
      } else if (!isEdit && existingNames.includes(name.trim())) {
        next['_name'] = 'A model with this name already exists.'
      }
      for (const m of milestones) {
        // PP/MPP/Pilot have no own date — they are captured via sub-types below, so don't require a top-level date.
        if (TIMELINE_MILESTONES.includes(m.id)) continue
        if (m.mandatory && !mrds[m.id]) {
          next[m.id] = `${m.label} MRD is required.`
        }
      }
      setErrors(next)
      if (Object.keys(next).length > 0) return
      onSave({ name: name.trim(), mrds, archetypeId: archetypeId || undefined })
    }
  }

  function setMrd(id: string, val: string) {
    setMrds((prev) => {
      const next = { ...prev }
      if (val) next[id] = val
      else delete next[id]
      return next
    })
    if (errors[id]) setErrors((e) => { const n = { ...e }; delete n[id]; return n })
  }

  return (
    <div>
      {/* Model name */}
      <div className="mb-5">
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
        {errors['_name'] && (
          <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors['_name']}</p>
        )}
      </div>

      {/* Project archetype (Governance) */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text)]" htmlFor="model-archetype">Project archetype</label>
        <select id="model-archetype" value={archetypeId} onChange={(e) => setArchetypeId(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]">
          <option value="">None</option>
          {archetypes.map((a) => (
            <option key={a.id} value={a.id} disabled={!a.active && a.id !== initial?.archetypeId}>
              {a.name} ({a.id}){a.active ? '' : ' · inactive'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">The model is counted as a project of this archetype.</p>
      </div>

      {/* Non-blocking ordering warning */}
      {outOfOrder.size > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-xs text-[#92400e]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Dates appear out of chronological order for milestone(s):{' '}
            <strong>{[...outOfOrder].join(', ')}</strong>. Save is still allowed — verify before proceeding.
          </span>
        </div>
      )}

      {/* Milestone MRD inputs. PP/MPP/Pilot have no own date — only the sub-types below carry dates. */}
      <p className="mb-3 text-[11px] text-[var(--color-muted)]">
        SOP is required (<span className="text-[var(--color-destructive)]">*</span>). PP, MPP and Pilot have no single
        date — set their dates under the sub-types below. Other milestones may be left blank — activities for those
        show "Awaiting MRD".
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {milestones.filter((m) => !TIMELINE_MILESTONES.includes(m.id)).map((m) => (
          <div key={m.id}>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
              {m.label}
              {m.mandatory && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
            </label>
            <input
              type="date"
              value={mrds[m.id] ?? ''}
              onChange={(e) => setMrd(m.id, e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] bg-white
                ${errors[m.id]
                  ? 'border-[var(--color-destructive)]'
                  : outOfOrder.has(m.id)
                  ? 'border-[#f59e0b]'
                  : 'border-[var(--color-border)]'}`}
            />
            {errors[m.id] && (
              <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors[m.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Sub-type MRD dates (PP / MPP / Pilot) — aligns with the activity timeline templates ── */}
      <div className="mt-6 border-t border-[var(--color-border)] pt-4">
        <p className="mb-3 text-[11px] text-[var(--color-muted)]">
          Sub-type MRD dates per milestone. All sub-types are shown (Kani / Jig apply to Weld parts). Leave blank where
          not applicable — blanks show as “Awaiting MRD”.
        </p>
        <div className="space-y-4">
          {TIMELINE_MILESTONES.map((ms) => (
            <div key={ms}>
              <div className="mb-1.5 text-[11px] font-semibold text-primary">{ms} sub-types</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subTypesFor(ms, null).map((st) => {
                  const key = subTypeMrdKey(ms, st)
                  return (
                    <div key={key}>
                      <label className="mb-1 block text-[11px] font-medium text-[var(--color-text)]">{SUBTYPE_LABEL[st]}</label>
                      <input
                        type="date"
                        value={mrds[key] ?? ''}
                        onChange={(e) => setMrd(key, e.target.value)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ModelsPage() {
  const { models, milestones, addModel, updateModel, deleteModel, archetypes } = useQAStore()
  const archetypeName = (id: string) => archetypes.find((a) => a.id === id)?.name ?? id

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
      updateModel(editing.name, { mrds: model.mrds, archetypeId: model.archetypeId })
    } else {
      addModel(model)
    }
    closeForm()
  }

  function handleDelete(name: string) {
    deleteModel(name)
    setConfirmDelete(null)
  }

  // Table columns: PP/MPP/Pilot are shown by their sub-type MRDs (no single date); the rest keep one column each.
  const tableCols = useMemo(() => {
    const cols: { key: string; label: string; group?: string; mandatory?: boolean }[] = []
    for (const m of milestones) {
      if (TIMELINE_MILESTONES.includes(m.id)) {
        for (const st of subTypesFor(m.id, null)) {
          cols.push({ key: subTypeMrdKey(m.id, st), label: SUBTYPE_LABEL[st].replace(' MRD', ''), group: m.label })
        }
      } else {
        cols.push({ key: m.id, label: m.label, mandatory: m.mandatory })
      }
    }
    return cols
  }, [milestones])
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
        description={`Manage vehicle models and their milestone MRD dates. PP, MPP and Pilot are captured by their sub-types (Weld, Engine, Assembly…); SOP is required. Blank dates show "Awaiting MRD" on activities.`}
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
                <th rowSpan={2} className="px-3 py-2 text-left font-medium text-[var(--color-muted)] align-bottom whitespace-nowrap">Archetype</th>
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
                    {model.archetypeId
                      ? <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary" title={archetypeName(model.archetypeId)}>{model.archetypeId}</span>
                      : <span className="italic text-[var(--color-muted)]">—</span>}
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
          milestones={milestones}
          existingNames={existingNames}
          onSave={handleSave}
          formRef={formHandleRef}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
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
      </Modal>

      {/* Sync parts panel */}
      {syncTarget !== null && (
        <SyncPanel modelName={syncTarget} onClose={() => setSyncTarget(null)} />
      )}
    </div>
  )
}
