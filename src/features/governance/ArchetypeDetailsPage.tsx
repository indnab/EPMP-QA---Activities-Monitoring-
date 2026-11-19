/**
 * Governance → Archetype Details. Admin names the archetype and builds its WBS as a tree:
 * Milestone → Activity → Task → Sub-task (WBS-1, WBS-1.1, …). Milestones are this archetype's own (any name) and each
 * carries its planned dates: its own date plus any MRD types (e.g. Kani MRD, Jig MRD) the Model Coordinator fills per
 * model at Project Initiation. Only Activity rows of type Activity Builder are built in detail; on Submit they are
 * synced into the Activity Builder (see domain/governance.syncArchetype), where each part category is linked to one
 * of its milestone's planned dates.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Button, Modal } from '../../components'
import { Icon } from '../../components/Icon'
import { toast } from '../../components/Toast'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { DependencyType, MilestoneDateType, ProjectArchetype, WbsChecklistItem, WbsDependency, WbsLevel, WbsObject, WbsObjectType } from '../../domain'
import { DEP_LABEL, DEP_TYPES, WBS_TYPES, activityIdFor, nextArchetypeId } from '../../domain/governance'
import { isBuildable } from '../../domain'
import { WBS_LEVELS, WBS_LEVEL_LABEL, allowedLevels, dateOptions, reparent, subtreeIds, wbsTree } from '../../domain/wbsTree'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11.5px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:opacity-70'
const cellInput = 'h-8 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-[11.5px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] disabled:bg-transparent disabled:border-transparent'
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const LAG_MAX = 100

const STATE_CLS = {
  'Not built': 'bg-amber-100 text-amber-800',
  'Draft in progress': 'bg-blue-100 text-blue-800',
  Published: 'bg-emerald-100 text-emerald-800',
} as const

const LEVEL_CLS: Record<WbsLevel, string> = {
  Milestone: 'bg-[#eef4ff] text-primary',
  Activity: 'bg-emerald-50 text-emerald-800',
  Task: 'bg-amber-50 text-amber-800',
  Subtask: 'bg-[#f2f4f7] text-[#475467]',
}

/** Types a row may take: Activity Builder only at Activity level; Milestones have no type. */
const typesFor = (level: WbsLevel) => (level === 'Activity' ? WBS_TYPES : WBS_TYPES.filter((t) => t.id !== 'ActivityBuilder'))

const newRow = (level: WbsLevel, parentId?: string): WbsObject => ({
  id: uid(level === 'Milestone' ? 'ms' : 'wbs'),
  name: '',
  level,
  parentId,
  type: level === 'Activity' ? 'ActivityBuilder' : 'General',
  ...(level === 'Milestone' ? { dateRequired: false, dateTypes: [] } : {}),
})

export function ArchetypeDetailsPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { archetypes, activities, drafts, saveArchetype } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const isNew = routeId === 'new'
  const existing = isNew ? undefined : archetypes.find((a) => a.id === routeId)

  const [arc, setArc] = useState<ProjectArchetype>(() => {
    if (existing) return structuredClone(existing)
    const ms = newRow('Milestone')
    return { id: nextArchetypeId(archetypes), name: '', description: '', active: true, wbs: [ms, newRow('Activity', ms.id)] }
  })
  const [depFor, setDepFor] = useState<string | null>(null)
  const [checklistFor, setChecklistFor] = useState<string | null>(null)
  const [datesFor, setDatesFor] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const tree = wbsTree(arc.wbs)
  const codeOf = new Map(tree.map((n) => [n.obj.id, n.code]))
  const setObj = (oid: string, patch: Partial<WbsObject>) =>
    setArc((a) => ({ ...a, wbs: a.wbs.map((o) => (o.id === oid ? { ...o, ...patch } : o)) }))
  const addMilestone = () => setArc((a) => ({ ...a, wbs: [...a.wbs, newRow('Milestone')] }))
  // "+" adds a row of the same level right after this row and everything under it; its Level can then be changed.
  const addBelow = (row: WbsObject) =>
    setArc((a) => {
      const sub = subtreeIds(a.wbs, row.id)
      let at = a.wbs.findIndex((o) => o.id === row.id)
      a.wbs.forEach((o, i) => { if (sub.has(o.id)) at = Math.max(at, i) })
      return { ...a, wbs: reparent([...a.wbs.slice(0, at + 1), newRow(row.level, row.parentId), ...a.wbs.slice(at + 1)]) }
    })
  // Changing a row's level re-derives parents from the row order (the nearest row above with a higher level).
  const setLevel = (row: WbsObject, level: WbsLevel) =>
    setArc((a) => ({
      ...a,
      wbs: reparent(a.wbs.map((o) => (o.id === row.id
        ? { ...o, level, type: level === 'Activity' && o.level !== 'Activity' ? 'ActivityBuilder' as const : o.type }
        : o))),
    }))
  // Removing a row removes everything under it; dependencies on removed rows go with them.
  const removeObj = (oid: string) =>
    setArc((a) => {
      const gone = subtreeIds(a.wbs, oid)
      return {
        ...a,
        wbs: reparent(a.wbs.filter((o) => !gone.has(o.id)).map((o) => (o.dependency && gone.has(o.dependency.onObjectId) ? { ...o, dependency: undefined } : o))),
      }
    })

  const named = arc.wbs.filter((o) => o.name.trim())
  // A blank row is dropped on Submit, so it must not have named rows under it.
  const blankParent = arc.wbs.some((o) => !o.name.trim() && arc.wbs.some((c) => c.parentId === o.id && c.name.trim()))
  const errors = {
    name: !arc.name.trim(),
    description: !arc.description.trim(),
    objects: !named.some((o) => o.level === 'Milestone'),
    blankParent,
  }
  const invalid = Object.values(errors).some(Boolean)
  const nameOf = (oid: string) => arc.wbs.find((o) => o.id === oid)?.name || 'Untitled'
  // Where each buildable row stands in the Activity Builder.
  const builderState = (o: WbsObject): 'Not built' | 'Draft in progress' | 'Published' => {
    const act = activities.find((a) => a.id === o.activityId)
    if (!act || act.retired) return 'Not built'
    if (drafts.some((d) => d.sourceId === act.id)) return 'Draft in progress'
    return act.published === false ? 'Not built' : 'Published'
  }

  /** Validate and save the archetype (buildable rows are synced into activities). Returns false if something is missing. */
  const persist = (): boolean => {
    setTouched(true)
    if (invalid) {
      // Say what is missing and bring it into view (the archetype is saved before anything else happens).
      const what = errors.name ? 'the archetype name' : errors.description ? 'the archetype description' : errors.objects ? 'at least one named milestone' : 'a name for every row that has rows under it'
      toast(`Can't save the archetype yet: enter ${what}.`)
      const target = errors.name || errors.description ? 'arc-details' : 'arc-wbs-errors'
      setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    // Blank rows are dropped; a dependency must point at a kept row.
    const keep = new Set(named.map((o) => o.id))
    saveArchetype({
      ...arc,
      name: arc.name.trim(),
      description: arc.description.trim(),
      wbs: tree.map((n) => n.obj).filter((o) => keep.has(o.id)).map((o) => ({
        ...o,
        name: o.name.trim(),
        dependency: o.dependency && keep.has(o.dependency.onObjectId) ? o.dependency : undefined,
        ...(o.level === 'Milestone' ? { dateTypes: (o.dateTypes ?? []).filter((t) => t.label.trim()).map((t) => ({ ...t, label: t.label.trim() })) } : {}),
      })),
    })
    return true
  }
  const submit = () => { if (persist()) navigate('/governance') }
  /** "Build activity": save the archetype, then open this row's activity in the Activity Builder (returns here). */
  const build = (o: WbsObject) => {
    if (!o.name.trim()) { setTouched(true); return }
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
  const datesObj = arc.wbs.find((o) => o.id === datesFor)

  return (
    <div className="pb-24">
      <PageHeader title={isNew ? 'Add Archetype' : 'Archetype Details'} section="Governance › Archetypes" />

      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 id="arc-details" className="m-0 text-[14px] font-semibold text-[#101828]">Archetype Details</h2>
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">{arc.id}</span>
        </div>
        {!isAdmin && <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">Read-only · only Admin can edit archetypes.</p>}
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Project Archetype Name <span className="text-red-500">*</span></span>
            <input value={arc.name} disabled={!isAdmin} onChange={(e) => setArc({ ...arc, name: e.target.value })} className={inputCls} placeholder="e.g. Vehicle Development – QA" />
            {touched && errors.name && <span className="mt-1 block text-[10.5px] text-red-600">Enter a name.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Description <span className="text-red-500">*</span></span>
            <input value={arc.description} disabled={!isAdmin} onChange={(e) => setArc({ ...arc, description: e.target.value })} className={inputCls} placeholder="What kind of project this archetype is for" />
            {touched && errors.description && <span className="mt-1 block text-[10.5px] text-red-600">Enter a description.</span>}
          </label>
        </div>
      </Card>

      <Card flush className="!overflow-visible">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="m-0 text-[12px] font-semibold text-[#101828]">Define WBS Objects</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-primary">{named.length}</span>
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">
            Add milestones and their <strong>Planned dates</strong>, then rows below them (<Icon name="circle-plus" size={12} className="inline" /> adds a row below; pick its Level). Activity Builder activities are built in detail.
          </span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
                <th className="w-32 px-3 py-2.5">No.</th>
                <th className="w-32 px-3 py-2.5">Level</th>
                <th className="min-w-[260px] px-3 py-2.5">WBS Objects</th>
                <th className="w-40 px-3 py-2.5">Type</th>
                <th className="min-w-[200px] px-3 py-2.5">Dependency</th>
                <th className="min-w-[330px] px-3 py-2.5 text-right">Planned dates / Activity</th>
                {isAdmin && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {tree.map(({ obj: o, code, depth }, idx) => {
                const state = builderState(o)
                const allowed = allowedLevels(tree[idx - 1]?.obj.level)
                // The current level stays listed even if a change above made it skip a level.
                const levels = WBS_LEVELS.filter((l) => allowed.includes(l) || l === o.level)
                const nDates = o.level === 'Milestone' ? dateOptions(o).length : 0
                return (
                  <tr key={o.id} className={`border-b border-[var(--color-border)] last:border-0 align-middle ${o.level === 'Milestone' ? 'bg-[#f8faff]' : ''}`}>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-mono text-[10.5px] text-[#344054]">{code}</span>
                        {isAdmin && (
                          <button type="button" onClick={() => addBelow(o)} aria-label={`Add row below ${code}`} title={`Add a ${WBS_LEVEL_LABEL[o.level]} below (change its Level as needed)`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-accent)]">
                            <Icon name="circle-plus" size={15} />
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {isAdmin ? (
                        <select value={o.level} aria-label={`${code} level`} onChange={(e) => setLevel(o, e.target.value as WbsLevel)}
                          className={`${cellInput} font-semibold ${LEVEL_CLS[o.level]}`}>
                          {levels.map((l) => <option key={l} value={l}>{WBS_LEVEL_LABEL[l]}</option>)}
                        </select>
                      ) : (
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_CLS[o.level]}`}>{WBS_LEVEL_LABEL[o.level]}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div style={{ paddingLeft: depth * 16 }}>
                        <input value={o.name} disabled={!isAdmin} aria-label={`${code} name`} placeholder={o.level === 'Milestone' ? 'Milestone name, e.g. PP' : `${WBS_LEVEL_LABEL[o.level]} name`}
                          maxLength={255}
                          onChange={(e) => setObj(o.id, { name: e.target.value })} className={`${cellInput} ${o.level === 'Milestone' ? 'font-semibold' : ''}`} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      {o.level === 'Milestone' ? <span className="text-[var(--color-muted)]">—</span> : (
                        <select value={o.type} disabled={!isAdmin} aria-label={`${code} type`}
                          onChange={(e) => setObj(o.id, { type: e.target.value as WbsObjectType })} className={cellInput}>
                          {typesFor(o.level).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {o.dependency ? (
                        <button type="button" onClick={() => setDepFor(o.id)}
                          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-[#eef4ff] px-2.5 py-1 text-left text-[10px] font-medium text-primary hover:brightness-95"
                          title={`${DEP_LABEL[o.dependency.type]} on “${nameOf(o.dependency.onObjectId)}”, lag ${o.dependency.lagDays} day(s)`}>
                          <span className="whitespace-nowrap">{DEP_LABEL[o.dependency.type]}</span>
                          <span className="truncate font-normal text-[#344054]">· {codeOf.get(o.dependency.onObjectId)} {nameOf(o.dependency.onObjectId)}{o.dependency.lagDays ? ` +${o.dependency.lagDays}d` : ''}</span>
                        </button>
                      ) : isAdmin ? (
                        <button type="button" onClick={() => setDepFor(o.id)} aria-label={`Set dependency for ${code}`}
                          disabled={arc.wbs.length < 2}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-accent)] disabled:opacity-40">
                          <Icon name="circle-plus" size={16} />
                        </button>
                      ) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {o.level === 'Milestone' ? (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          <span className="max-w-[220px] truncate text-[10.5px] text-[var(--color-muted)]" title={dateOptions(o).map((d) => d.label).join(', ')}>
                            {dateOptions(o).map((d) => d.label).join(', ')}
                          </span>
                          <button type="button" onClick={() => setDatesFor(o.id)}
                            className="whitespace-nowrap rounded-full border border-[var(--color-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
                            Planned dates ({nDates})
                          </button>
                        </span>
                      ) : isBuildable(o) ? (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_CLS[state]}`}>{state}</span>
                          <button type="button" onClick={() => setChecklistFor(o.id)}
                            className="whitespace-nowrap rounded-full border border-[var(--color-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
                            {o.checklist?.length ? `Checklist (${o.checklist.length})` : 'Select Checklist'}
                          </button>
                          {isAdmin && (
                            <Button variant={state === 'Published' ? 'secondary' : 'primary'} size="sm" className="whitespace-nowrap"
                              disabled={!o.name.trim()}
                              title={!o.name.trim() ? 'Name the activity first' : 'Saves the archetype and opens this activity in the Activity Builder'}
                              onClick={() => build(o)}>
                              {state === 'Not built' ? 'Build activity' : state === 'Draft in progress' ? 'Continue building' : 'Edit activity'}
                            </Button>
                          )}
                        </span>
                      ) : (
                        <span className="block text-right text-[10.5px] text-[var(--color-muted)]"
                          title={o.level === 'Activity' ? 'Set Type to Activity Builder to build it in detail' : 'Only activities are built in the Activity Builder'}>
                          {o.level === 'Activity' ? 'NA · set Type to Activity Builder to build' : '—'}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-1.5 text-center">
                        <button type="button" onClick={() => removeObj(o.id)} aria-label={`Remove ${code}`}
                          title={arc.wbs.some((c) => c.parentId === o.id) ? 'Remove (with everything under it)' : 'Remove'}
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
            <button type="button" onClick={addMilestone} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
              <Icon name="circle-plus" size={16} /> Add milestone
            </button>
          </div>
        )}
        {touched && (errors.objects || errors.blankParent) && (
          <p id="arc-wbs-errors" className="border-t border-[var(--color-border)] px-4 py-2 text-[10.5px] text-red-600">
            {errors.objects ? 'Add at least one named milestone.' : 'Name every row that has rows under it.'}
          </p>
        )}
      </Card>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur lg:left-[208px] xl:left-[216px] left-0">
        <Button variant="secondary" size="md" onClick={() => navigate('/governance')}>{isAdmin ? 'Cancel' : 'Back'}</Button>
        {isAdmin && <Button variant="primary" size="md" onClick={submit} disabled={touched && invalid}>Submit</Button>}
      </div>

      {depObj && (
        <DependencyModal
          obj={depObj}
          candidates={tree.map((n) => n.obj).filter((o) => o.id !== depObj.id && o.name.trim()).map((o) => ({ ...o, name: `${codeOf.get(o.id)} · ${o.name}` }))}
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
      {datesObj && (
        <PlannedDatesModal
          obj={datesObj}
          readOnly={!isAdmin}
          onClose={() => setDatesFor(null)}
          onSave={(dateRequired, dateTypes) => { setObj(datesObj.id, { dateRequired, dateTypes }); setDatesFor(null) }}
        />
      )}
    </div>
  )
}

/** A milestone's planned dates: its own date (always there) plus any MRD types. Filled per model at initiation. */
function PlannedDatesModal({ obj, readOnly, onClose, onSave }: {
  obj: WbsObject
  readOnly: boolean
  onClose: () => void
  onSave: (dateRequired: boolean, dateTypes: MilestoneDateType[]) => void
}) {
  const [own, setOwn] = useState(!!obj.dateRequired)
  const [types, setTypes] = useState<MilestoneDateType[]>(obj.dateTypes ?? [])
  const setType = (id: string, patch: Partial<MilestoneDateType>) => setTypes((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const msName = obj.name.trim() || 'Milestone'
  const labels = types.map((t) => t.label.trim().toLowerCase()).filter(Boolean)
  const dup = labels.some((l, i) => labels.indexOf(l) !== i || l === `${msName.toLowerCase()} date`)
  return (
    <Modal open onClose={onClose} size="md" title={`Planned dates · ${msName}`}
      footer={readOnly ? <Button variant="secondary" size="md" onClick={onClose}>Close</Button> : (
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={dup} onClick={() => onSave(own, types.filter((t) => t.label.trim()).map((t) => ({ ...t, label: t.label.trim() })))}>Save</Button>
        </>
      )}>
      <p className="mb-3 text-[11.5px] text-[var(--color-muted)]">
        The Model Coordinator enters these dates for the model when initiating a project. Each activity under this milestone is planned against one of them.
      </p>
      <div className="mb-3 flex items-center gap-3 rounded-lg bg-[#eef4ff] p-3">
        <span className="min-w-0 flex-1 text-[11.5px] font-medium text-[#101828]">{msName} date <span className="font-normal text-[var(--color-muted)]">(milestone date)</span></span>
        <label className="flex items-center gap-1.5 text-[10.5px] text-[#344054]">
          <input type="checkbox" checked={own} disabled={readOnly} onChange={(e) => setOwn(e.target.checked)} /> Required
        </label>
      </div>
      <div className="space-y-2">
        {types.map((t, i) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-2.5">
            <input value={t.label} disabled={readOnly} aria-label={`Planned date ${i + 1}`} onChange={(e) => setType(t.id, { label: e.target.value })}
              className={inputCls + ' !bg-white flex-1'} placeholder="e.g. Kani MRD" maxLength={60} />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-[#344054]">
              <input type="checkbox" checked={!!t.required} disabled={readOnly} onChange={(e) => setType(t.id, { required: e.target.checked })} /> Required
            </label>
            {!readOnly && (
              <button type="button" onClick={() => setTypes((xs) => xs.filter((x) => x.id !== t.id))} aria-label={`Remove planned date ${i + 1}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {dup && <p className="mt-2 text-[10.5px] text-red-600">Each planned date needs a different name.</p>}
      {!readOnly && (
        <button type="button" onClick={() => setTypes((xs) => [...xs, { id: uid('dt'), label: '', required: false }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
          <Icon name="circle-plus" size={16} /> Add planned date
        </button>
      )}
      <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">Removing a planned date leaves dates already entered on models in place, but activities can no longer be linked to it.</p>
    </Modal>
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
      <p className="mb-3 text-[11.5px] text-[var(--color-muted)]">For <strong className="text-[#101828]">{obj.name || 'this object'}</strong></p>
      <label className="mb-3 block">
        <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Choose Dependent Task <span className="text-red-500">*</span></span>
        <select value={on} disabled={readOnly} onChange={(e) => setOn(e.target.value)} className={inputCls}>
          <option value="">Select a WBS object…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Choose Dependent Type <span className="text-red-500">*</span></span>
        <select value={type} disabled={readOnly} onChange={(e) => setType(e.target.value as DependencyType)} className={inputCls}>
          {DEP_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <div>
        <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Lag (Days)</span>
        <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[#f9fafb]">
          <button type="button" disabled={readOnly || lag <= 0} onClick={() => setLag((l) => clampLag(l - 1))} aria-label="Decrease lag" className="h-9 w-9 text-[15px] text-[#344054] disabled:opacity-40">−</button>
          <input type="number" min={0} max={LAG_MAX} value={lag} disabled={readOnly} aria-label="Lag in days"
            onChange={(e) => setLag(clampLag(Number(e.target.value)))} className="h-9 w-14 border-x border-[var(--color-border)] bg-white text-center text-[11.5px]" />
          <button type="button" disabled={readOnly || lag >= LAG_MAX} onClick={() => setLag((l) => clampLag(l + 1))} aria-label="Increase lag" className="h-9 w-9 text-[15px] text-[#344054] disabled:opacity-40">+</button>
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
    <Modal open onClose={onClose} size="md" title={`Checklist · ${obj.name || 'Activity'}`}
      footer={readOnly ? <Button variant="secondary" size="md" onClick={onClose}>Close</Button> : (
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={() => onSave(filled.map((x) => ({ ...x, label: x.label.trim() })), owner)}>Save</Button>
        </>
      )}>
      {!readOnly && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setItems((xs) => [...xs, { id: uid('chk'), label: '', mandatory: true }])}
            className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-[10.5px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-secondary)]">
            + Add Checklist Item
          </button>
        </div>
      )}
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-end gap-3 rounded-lg bg-[#eef4ff] p-3">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">QA Checklist Item {i + 1} <span className="text-red-500">*</span></span>
              <input value={it.label} disabled={readOnly} onChange={(e) => setItem(it.id, { label: e.target.value })} className={inputCls + ' !bg-white'} placeholder="e.g. Requirements documentation completion" />
            </label>
            <label className="block w-44">
              <span className="mb-1 block text-[10.5px] font-medium text-[#344054]">Mandatory / Non-mandatory <span className="text-red-500">*</span></span>
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
      <label className="mt-4 flex items-center gap-2 text-[11.5px] text-[#344054]">
        <input type="checkbox" checked={owner} disabled={readOnly} onChange={(e) => setOwner(e.target.checked)} />
        QA Ownership to be with Release Manager
      </label>
      <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">Each item becomes a Yes/No field on this activity (required if Mandatory). You can refine them in the Activity Builder.</p>
    </Modal>
  )
}
