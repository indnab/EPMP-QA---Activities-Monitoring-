/**
 * Governance → Archetype Details. Admin names the archetype and defines its WBS objects: name, type, trial (QA),
 * dependency (predecessor + FS/SS/FF/SF + lag) and, for QA objects, a checklist. On Submit, QA objects are synced into
 * the Activity Builder (see domain/governance.syncArchetype), where their fields/flow/timeline are configured.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Button, Modal } from '../../components'
import { Icon } from '../../components/Icon'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { DependencyType, ProjectArchetype, WbsChecklistItem, WbsDependency, WbsObject, WbsObjectType } from '../../domain'
import { DEP_LABEL, DEP_TYPES, WBS_TYPES, activityIdFor, nextArchetypeId } from '../../domain/governance'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:opacity-70'
const cellInput = 'h-8 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-[12px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:bg-transparent disabled:border-transparent'
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const LAG_MAX = 100
const STATE_CLS = {
  'Not built': 'bg-amber-100 text-amber-800',
  'Draft in progress': 'bg-blue-100 text-blue-800',
  Published: 'bg-emerald-100 text-emerald-800',
} as const

export function ArchetypeDetailsPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { archetypes, milestones, activities, drafts, saveArchetype } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const isNew = routeId === 'new'
  const existing = isNew ? undefined : archetypes.find((a) => a.id === routeId)

  // A new WBS row is a QA activity by default (with the first trial), so it can be built straight away.
  const firstTrial = milestones.find((m) => m.mandatory)?.id
  const newRow = (): WbsObject => ({ id: uid('wbs'), name: '', type: 'QA', trial: firstTrial })
  const [arc, setArc] = useState<ProjectArchetype>(() =>
    existing
      ? structuredClone(existing)
      : { id: nextArchetypeId(archetypes), name: '', description: '', active: true, wbs: [newRow()] }
  )
  const [depFor, setDepFor] = useState<string | null>(null)
  const [checklistFor, setChecklistFor] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const trials = useMemo(() => milestones.filter((m) => m.mandatory), [milestones])
  const setObj = (oid: string, patch: Partial<WbsObject>) =>
    setArc((a) => ({ ...a, wbs: a.wbs.map((o) => (o.id === oid ? { ...o, ...patch } : o)) }))
  const addObj = () => setArc((a) => ({ ...a, wbs: [...a.wbs, newRow()] }))
  const removeObj = (oid: string) =>
    setArc((a) => ({
      ...a,
      // Dependencies on a removed object go with it.
      wbs: a.wbs.filter((o) => o.id !== oid).map((o) => (o.dependency?.onObjectId === oid ? { ...o, dependency: undefined } : o)),
    }))
  const changeType = (o: WbsObject, type: WbsObjectType) =>
    setObj(o.id, type === 'QA' ? { type, trial: o.trial ?? trials[0]?.id } : { type, trial: undefined })

  const named = arc.wbs.filter((o) => o.name.trim())
  const errors = {
    name: !arc.name.trim(),
    description: !arc.description.trim(),
    objects: named.length === 0,
    trial: arc.wbs.some((o) => o.type === 'QA' && o.name.trim() && !o.trial),
  }
  const invalid = Object.values(errors).some(Boolean)
  const nameOf = (oid: string) => arc.wbs.find((o) => o.id === oid)?.name || 'Untitled'
  // Where each QA row stands in the Activity Builder.
  const builderState = (o: WbsObject): 'Not built' | 'Draft in progress' | 'Published' => {
    const act = activities.find((a) => a.id === o.activityId)
    if (!act || act.retired) return 'Not built'
    if (drafts.some((d) => d.sourceId === act.id)) return 'Draft in progress'
    return act.published === false ? 'Not built' : 'Published'
  }

  /** Validate and save the archetype (QA rows are synced into activities). Returns false if something is missing. */
  const persist = (): boolean => {
    setTouched(true)
    if (invalid) return false
    // Blank rows are dropped; a dependency must point at a kept row.
    const keep = new Set(named.map((o) => o.id))
    saveArchetype({
      ...arc,
      name: arc.name.trim(),
      description: arc.description.trim(),
      wbs: named.map((o) => ({ ...o, name: o.name.trim(), dependency: o.dependency && keep.has(o.dependency.onObjectId) ? o.dependency : undefined })),
    })
    return true
  }
  const submit = () => { if (persist()) navigate('/governance') }
  /** "Build activity": save the archetype, then open this row's activity in the Activity Builder (returns here). */
  const build = (o: WbsObject) => {
    if (!o.name.trim() || !o.trial) { setTouched(true); return }
    if (!persist()) return
    navigate(`/builder/${activityIdFor(arc, o)}?from=${encodeURIComponent(arc.id)}`)
  }

  if (!isNew && !existing) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Archetype not found</p>
        <Link to="/governance" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Governance</Link>
      </div>
    )
  }

  const depObj = arc.wbs.find((o) => o.id === depFor)
  const chkObj = arc.wbs.find((o) => o.id === checklistFor)

  return (
    <div className="pb-24">
      <PageHeader title={isNew ? 'Add Archetype' : 'Archetype Details'} section="Governance › Archetypes" />

      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-semibold text-[#101828]">Archetype Details</h2>
          <span className="font-mono text-[11px] text-[var(--color-muted)]">{arc.id}</span>
        </div>
        {!isAdmin && <p className="mb-3 text-[11px] text-[var(--color-muted)]">Read-only · only Admin can edit archetypes.</p>}
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Project Archetype Name <span className="text-red-500">*</span></span>
            <input value={arc.name} disabled={!isAdmin} onChange={(e) => setArc({ ...arc, name: e.target.value })} className={inputCls} placeholder="e.g. Vehicle Development – QA" />
            {touched && errors.name && <span className="mt-1 block text-[11px] text-red-600">Enter a name.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Description <span className="text-red-500">*</span></span>
            <input value={arc.description} disabled={!isAdmin} onChange={(e) => setArc({ ...arc, description: e.target.value })} className={inputCls} placeholder="What kind of project this archetype is for" />
            {touched && errors.description && <span className="mt-1 block text-[11px] text-red-600">Enter a description.</span>}
          </label>
        </div>
      </Card>

      <Card flush className="!overflow-visible">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="m-0 text-[13px] font-semibold text-[#101828]">Define WBS Objects</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{named.length}</span>
          <span className="ml-auto text-[11px] text-[var(--color-muted)]">Add an activity per row, then click <strong>Build activity</strong> to define its fields, flow and timeline.</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                <th className="w-12 px-3 py-2.5">No.</th>
                <th className="min-w-[260px] px-3 py-2.5">WBS Objects</th>
                <th className="w-40 px-3 py-2.5">Type</th>
                <th className="w-32 px-3 py-2.5">Trial</th>
                <th className="min-w-[200px] px-3 py-2.5">Dependency</th>
                <th className="min-w-[330px] px-3 py-2.5 text-right">Activity (build in detail)</th>
                {isAdmin && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {arc.wbs.map((o, i) => {
                const state = builderState(o)
                return (
                  <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0 align-middle">
                    <td className="px-3 py-1.5 tabular-nums text-[var(--color-muted)]">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <input value={o.name} disabled={!isAdmin} aria-label={`WBS object ${i + 1} name`} placeholder="WBS object name"
                        onChange={(e) => setObj(o.id, { name: e.target.value })} className={cellInput} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={o.type} disabled={!isAdmin} aria-label={`WBS object ${i + 1} type`}
                        onChange={(e) => changeType(o, e.target.value as WbsObjectType)} className={cellInput}>
                        {WBS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {o.type === 'QA' ? (
                        <select value={o.trial ?? ''} disabled={!isAdmin} aria-label={`WBS object ${i + 1} trial`}
                          onChange={(e) => setObj(o.id, { trial: e.target.value || undefined })} className={cellInput}>
                          <option value="">Select…</option>
                          {trials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      ) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {o.dependency ? (
                        <button type="button" onClick={() => setDepFor(o.id)} disabled={!isAdmin && !o.dependency}
                          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-[#eef4ff] px-2.5 py-1 text-left text-[10px] font-medium text-primary hover:brightness-95"
                          title={`${DEP_LABEL[o.dependency.type]} on “${nameOf(o.dependency.onObjectId)}”, lag ${o.dependency.lagDays} day(s)`}>
                          <span className="whitespace-nowrap">{DEP_LABEL[o.dependency.type]}</span>
                          <span className="truncate font-normal text-[#344054]">· {nameOf(o.dependency.onObjectId)}{o.dependency.lagDays ? ` +${o.dependency.lagDays}d` : ''}</span>
                        </button>
                      ) : isAdmin ? (
                        <button type="button" onClick={() => setDepFor(o.id)} aria-label={`Set dependency for WBS object ${i + 1}`}
                          disabled={arc.wbs.length < 2}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-accent)] disabled:opacity-40">
                          <Icon name="circle-plus" size={16} />
                        </button>
                      ) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {o.type === 'QA' ? (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_CLS[state]}`}>{state}</span>
                          <button type="button" onClick={() => setChecklistFor(o.id)}
                            className="whitespace-nowrap rounded-full border border-[var(--color-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
                            {o.checklist?.length ? `Checklist (${o.checklist.length})` : 'Select Checklist'}
                          </button>
                          {isAdmin && (
                            <Button variant={state === 'Published' ? 'secondary' : 'primary'} size="sm" className="whitespace-nowrap"
                              disabled={!o.name.trim() || !o.trial}
                              title={!o.name.trim() ? 'Name the activity first' : !o.trial ? 'Choose a trial first' : 'Saves the archetype and opens this activity in the Activity Builder'}
                              onClick={() => build(o)}>
                              {state === 'Not built' ? 'Build activity' : state === 'Draft in progress' ? 'Continue building' : 'Edit activity'}
                            </Button>
                          )}
                        </span>
                      ) : <span className="block text-center text-[11px] text-[var(--color-muted)]" title="Only QA objects are built as activities">NA · set Type to QA to build</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-1.5 text-center">
                        <button type="button" onClick={() => removeObj(o.id)} aria-label={`Remove WBS object ${i + 1}`} title={o.activityId ? 'Remove (its activity is retired on submit)' : 'Remove'}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]">
                          <Icon name="close" size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <div className="border-t border-[var(--color-border)] px-3 py-2">
            <button type="button" onClick={addObj} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
              <Icon name="circle-plus" size={16} /> Add WBS object
            </button>
          </div>
        )}
        {touched && (errors.objects || errors.trial) && (
          <p className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-red-600">
            {errors.objects ? 'Add at least one named WBS object.' : 'Choose a trial for every QA object.'}
          </p>
        )}
      </Card>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur lg:left-[248px] xl:left-[272px] left-0">
        <Button variant="secondary" size="md" onClick={() => navigate('/governance')}>{isAdmin ? 'Cancel' : 'Back'}</Button>
        {isAdmin && <Button variant="primary" size="md" onClick={submit} disabled={touched && invalid}>Submit</Button>}
      </div>

      {depObj && (
        <DependencyModal
          obj={depObj}
          candidates={arc.wbs.filter((o) => o.id !== depObj.id && o.name.trim())}
          readOnly={!isAdmin}
          onClose={() => setDepFor(null)}
          onSave={(dep) => { setObj(depObj.id, { dependency: dep }); setDepFor(null) }}
        />
      )}
      {chkObj && (
        <ChecklistModal
          obj={chkObj}
          readOnly={!isAdmin}
          onClose={() => setChecklistFor(null)}
          onSave={(checklist, qaOwnershipReleaseManager) => { setObj(chkObj.id, { checklist, qaOwnershipReleaseManager }); setChecklistFor(null) }}
        />
      )}
    </div>
  )
}

function DependencyModal({ obj, candidates, readOnly, onClose, onSave }: {
  obj: WbsObject
  candidates: WbsObject[]
  readOnly: boolean
  onClose: () => void
  onSave: (dep: WbsDependency | undefined) => void
}) {
  const [on, setOn] = useState(obj.dependency?.onObjectId ?? '')
  const [type, setType] = useState<DependencyType>(obj.dependency?.type ?? 'FS')
  const [lag, setLag] = useState(obj.dependency?.lagDays ?? 0)
  const clampLag = (n: number) => Math.max(0, Math.min(LAG_MAX, Math.round(n) || 0))
  return (
    <Modal open onClose={onClose} size="sm" title="Set Dependency"
      footer={readOnly ? <Button variant="secondary" size="md" onClick={onClose}>Close</Button> : (
        <>
          {obj.dependency && <Button variant="ghost" size="md" className="mr-auto" onClick={() => onSave(undefined)}>Remove</Button>}
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={!on} onClick={() => onSave({ onObjectId: on, type, lagDays: clampLag(lag) })}>Set Dependency</Button>
        </>
      )}>
      <p className="mb-3 text-[12px] text-[var(--color-muted)]">For <strong className="text-[#101828]">{obj.name || 'this object'}</strong></p>
      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-medium text-[#344054]">Choose Dependent Task <span className="text-red-500">*</span></span>
        <select value={on} disabled={readOnly} onChange={(e) => setOn(e.target.value)} className={inputCls}>
          <option value="">Select a WBS object…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-medium text-[#344054]">Choose Dependent Type <span className="text-red-500">*</span></span>
        <select value={type} disabled={readOnly} onChange={(e) => setType(e.target.value as DependencyType)} className={inputCls}>
          {DEP_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <div>
        <span className="mb-1 block text-[11px] font-medium text-[#344054]">Lag (Days)</span>
        <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[#f9fafb]">
          <button type="button" disabled={readOnly || lag <= 0} onClick={() => setLag((l) => clampLag(l - 1))} aria-label="Decrease lag" className="h-9 w-9 text-[16px] text-[#344054] disabled:opacity-40">−</button>
          <input type="number" min={0} max={LAG_MAX} value={lag} disabled={readOnly} aria-label="Lag in days"
            onChange={(e) => setLag(clampLag(Number(e.target.value)))} className="h-9 w-14 border-x border-[var(--color-border)] bg-white text-center text-[12px]" />
          <button type="button" disabled={readOnly || lag >= LAG_MAX} onClick={() => setLag((l) => clampLag(l + 1))} aria-label="Increase lag" className="h-9 w-9 text-[16px] text-[#344054] disabled:opacity-40">+</button>
        </div>
        <span className="mt-1 block text-[10px] text-[var(--color-muted)]">Max {LAG_MAX}</span>
      </div>
    </Modal>
  )
}

function ChecklistModal({ obj, readOnly, onClose, onSave }: {
  obj: WbsObject
  readOnly: boolean
  onClose: () => void
  onSave: (checklist: WbsChecklistItem[], qaOwnershipReleaseManager: boolean) => void
}) {
  const [items, setItems] = useState<WbsChecklistItem[]>(obj.checklist?.length ? obj.checklist : [{ id: uid('chk'), label: '', mandatory: true }])
  const [owner, setOwner] = useState(!!obj.qaOwnershipReleaseManager)
  const setItem = (id: string, patch: Partial<WbsChecklistItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const filled = items.filter((x) => x.label.trim())
  return (
    <Modal open onClose={onClose} size="md" title={`QA Checklist · ${obj.name || 'QA object'}`}
      footer={readOnly ? <Button variant="secondary" size="md" onClick={onClose}>Close</Button> : (
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={() => onSave(filled.map((x) => ({ ...x, label: x.label.trim() })), owner)}>Save</Button>
        </>
      )}>
      {!readOnly && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setItems((xs) => [...xs, { id: uid('chk'), label: '', mandatory: true }])}
            className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
            + Add Checklist Item
          </button>
        </div>
      )}
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-end gap-3 rounded-lg bg-[#eef4ff] p-3">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[#344054]">QA Checklist Item {i + 1} <span className="text-red-500">*</span></span>
              <input value={it.label} disabled={readOnly} onChange={(e) => setItem(it.id, { label: e.target.value })} className={inputCls + ' !bg-white'} placeholder="e.g. Requirements documentation completion" />
            </label>
            <label className="block w-44">
              <span className="mb-1 block text-[11px] font-medium text-[#344054]">Mandatory / Non-mandatory <span className="text-red-500">*</span></span>
              <select value={it.mandatory ? 'm' : 'n'} disabled={readOnly} onChange={(e) => setItem(it.id, { mandatory: e.target.value === 'm' })} className={inputCls + ' !bg-white'}>
                <option value="m">Mandatory</option>
                <option value="n">Non-mandatory</option>
              </select>
            </label>
            {!readOnly && (
              <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} aria-label={`Remove checklist item ${i + 1}`}
                className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-white hover:text-[var(--color-destructive)]">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12px] text-[#344054]">
        <input type="checkbox" checked={owner} disabled={readOnly} onChange={(e) => setOwner(e.target.checked)} />
        QA Ownership to be with Release Manager
      </label>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">Each item becomes a Yes/No field on this activity (required if Mandatory). You can refine them in the Activity Builder.</p>
    </Modal>
  )
}
