import { useMemo, useState } from 'react'
import { PageHeader, Card, Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { TechnicalCategory, DependencyType } from '../../domain'
import { TECHNICAL_CATEGORIES, CATEGORY_LABEL } from '../../domain/timelineCatalog'

const DEP_TYPES: { id: DependencyType; label: string }[] = [
  { id: 'FS', label: 'Finish to Start (FS)' },
  { id: 'SS', label: 'Start to Start (SS)' },
  { id: 'FF', label: 'Finish to Finish (FF)' },
  { id: 'SF', label: 'Start to Finish (SF)' }
]
const DEP_LABEL: Record<DependencyType, string> = Object.fromEntries(DEP_TYPES.map((d) => [d.id, d.label])) as Record<DependencyType, string>

const selCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'

export function DependenciesPage() {
  const { activities, activityDependencies, addActivityDependency, deleteActivityDependency } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canEdit = currentPersona === 'Admin' || currentPersona === 'DPM'

  const [category, setCategory] = useState<TechnicalCategory>('Engine')
  const [addOpen, setAddOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [type, setType] = useState<DependencyType>('FS')
  const [lag, setLag] = useState(0)

  const publishedActivities = useMemo(
    () => activities.filter((a) => a.published !== false && !a.retired).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [activities]
  )
  const actName = (id: string) => publishedActivities.find((a) => a.id === id)?.name ?? id

  const deps = useMemo(
    () => activityDependencies.filter((d) => d.category === category),
    [activityDependencies, category]
  )

  const dup = deps.some((d) => d.fromId === fromId && d.toId === toId)
  const valid = fromId && toId && fromId !== toId && !dup

  const openAdd = () => { setFromId(''); setToId(''); setType('FS'); setLag(0); setAddOpen(true) }
  const submit = () => {
    if (!valid) return
    addActivityDependency({ category, fromId, toId, type, lagDays: lag })
    setAddOpen(false)
  }

  return (
    <div>
      <PageHeader
        title="Activity Dependencies"
        section="Project Execution"
        description="Define precedence between activities for each technical category — dependent activity, dependency type (FS/SS/FF/SF) and lag."
      />

      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Technical category
          <select value={category} onChange={(e) => setCategory(e.target.value as TechnicalCategory)} className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] font-normal normal-case text-[#344054]">
            {TECHNICAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {canEdit ? (
          <Button variant="primary" size="sm" className="ml-auto" onClick={openAdd}>+ Set dependency</Button>
        ) : (
          <span className="ml-auto text-[11px] text-[var(--color-muted)]">Read-only · DPM or Admin can edit.</span>
        )}
      </section>

      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                <th className="px-4 py-3 min-w-[260px]">Dependent activity</th>
                <th className="px-4 py-3">Depends on (predecessor)</th>
                <th className="px-4 py-3">Dependency type</th>
                <th className="px-4 py-3 text-right">Lag (days)</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {deps.length === 0 ? (
                <tr><td colSpan={canEdit ? 5 : 4} className="px-4 py-10 text-center text-[var(--color-muted)]">No dependencies defined for {CATEGORY_LABEL[category]} yet.</td></tr>
              ) : (
                deps.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[#101828]">{actName(d.fromId)}</td>
                    <td className="px-4 py-2.5 text-[#344054]">{actName(d.toId)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-primary">{DEP_LABEL[d.type]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.lagDays}</td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => deleteActivityDependency(d.id)} className="text-[11px] text-[var(--color-destructive)] hover:underline">Remove</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Set dependency modal — mirrors the client mockup */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Set dependency · ${CATEGORY_LABEL[category]}`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submit} disabled={!valid}>Set dependency</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Dependent activity <span className="text-[var(--color-destructive)]">*</span></span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selCls}>
              <option value="">Select activity…</option>
              {publishedActivities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Depends on (predecessor) <span className="text-[var(--color-destructive)]">*</span></span>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className={selCls}>
              <option value="">Select activity…</option>
              {publishedActivities.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Dependency type <span className="text-[var(--color-destructive)]">*</span></span>
              <select value={type} onChange={(e) => setType(e.target.value as DependencyType)} className={selCls}>
                {DEP_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <label className="block w-32">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Lag (days)</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setLag((n) => Math.max(0, n - 1))} className="h-9 w-9 flex-none rounded-lg border border-[var(--color-border)] bg-white text-[#344054]">−</button>
                <input type="number" min={0} value={lag} onChange={(e) => setLag(Math.max(0, Math.round(e.target.valueAsNumber) || 0))} className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-center text-[12px]" />
                <button type="button" onClick={() => setLag((n) => n + 1)} className="h-9 w-9 flex-none rounded-lg border border-[var(--color-border)] bg-white text-[#344054]">+</button>
              </div>
            </label>
          </div>
          {dup && <p className="text-[11px] text-red-600">A dependency between these two activities already exists for this category.</p>}
          {fromId && toId && fromId === toId && <p className="text-[11px] text-red-600">An activity can't depend on itself.</p>}
          {valid && (
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] text-[#344054]">
              <strong>{actName(fromId)}</strong> {DEP_LABEL[type]} <strong>{actName(toId)}</strong>{lag ? ` · ${lag} day lag` : ''}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
