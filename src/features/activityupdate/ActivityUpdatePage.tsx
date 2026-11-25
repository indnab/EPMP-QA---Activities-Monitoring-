/**
 * Activity Update. Flow: Model(s) → Trial → Part(s) → Activity.
 * Pick one or more models and parts at the top (and optionally a trial). The list shows the activities of those
 * parts grouped by trial, with progress; pick one and its update form opens in a drawer on the right. Whatever is entered is written
 * to every selected part of that activity (bulk update), after showing what each part already holds and asking
 * before overwriting. Save as draft, Submit, or (for the validator) Approve, following the activity's flow.
 */
import { TrialName } from '../trialLabel'
import { toast } from '../../components/Toast'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, getFieldRenderer, SourceBadge, Tabs } from '../../components'
import type { SourceType, TabItem } from '../../components'
import { PartDetailDrawer } from '../workspace/PartDetailDrawer'
import { Icon } from '../../components/Icon'
import type { ActivityEntry, FieldDefinition } from '../../domain'
import { makeEntryId } from '../../domain'
import { getFilteredData, isWorkableByVendor, taskOf } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { useWorkParts } from '../../hooks/useWorkParts'
import { usePersonaStore } from '../../store/personaStore'
import { useQAStore } from '../../store/qaStore'
import { ExistingValues, OverwriteReview, conflictsOf, isBlank } from '../bulk/overwrite'
import type { Conflict } from '../bulk/overwrite'
import { MultiSelect } from '../intake/MultiSelect'
import { hasMyWork, validatingRole } from '../mywork/workQueue'
import { DEMO_TODAY, canPersonaEdit, fieldVisibleToPersona, partInScope } from '../scope'

type Mode = 'draft' | 'submit' | 'approve'
const ALL = { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' } as const
const key = (i: FilteredInstance) => `${i.row.id}|${i.part.partNo}`

/** Status of an activity across the selected parts. */
function rollup(items: FilteredInstance[]): { label: string; cls: string } {
  const n = items.length
  const approved = items.filter((i) => i.status === 'Approved').length
  if (approved === n) return { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (items.some((i) => i.status === 'Sent back')) return { label: 'NG', cls: 'bg-red-50 text-red-700 border-red-200' }
  if (items.some((i) => i.status === 'Submitted')) return { label: 'To approve', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' }
  if (items.some((i) => i.status === 'Draft') || approved > 0) return { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { label: 'Pending', cls: 'bg-slate-50 text-slate-600 border-slate-200' }
}

/**
 * The activity list of the given items (grouped by trial) and the update form, which opens in a right-side drawer.
 * Shared by the Activity Update page and the My Work Overview, which pass the items their filters select.
 */
export function ActivityUpdatePanel({ instances, partCount, trials, fill }: {
  /** Full screen: the list and the form area stretch from the top to the bottom of the screen. */
  fill?: boolean
  instances: FilteredInstance[]
  partCount: number
  /** Trials (milestone ids) to list, in order, even when they have no activities. Default: every trial. */
  trials?: string[]
}) {
  const { milestones, partReleases, partAcks, updateEntryValues, transitionEntryState, entries, documents } = useQAStore()
  const { currentPersona: role } = usePersonaStore()
  const [activeKey, setActiveKey] = useState<string | null>(null) // `${activityId}|${milestoneId}`
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [review, setReview] = useState<{ mode: Mode; conflicts: Conflict[] } | null>(null)
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  // Drawer tab (Form = the bulk update; the others are the part form's tabs) and, for those, which part they show.
  const [tab, setTab] = useState('form')
  const [tabPart, setTabPart] = useState<string | null>(null)
  const msOrder = (id: string) => { const k = milestones.findIndex((m) => m.id === id); return k < 0 ? 99 : k }
  const groups = useMemo(() => {
    const byMs = new Map<string, Map<string, FilteredInstance[]>>()
    for (const i of instances) {
      const ms = byMs.get(i.row.milestoneId) ?? new Map<string, FilteredInstance[]>()
      ms.set(i.activity.id, [...(ms.get(i.activity.id) ?? []), i])
      byMs.set(i.row.milestoneId, ms)
    }
    // Every trial is listed (PP, MPP, Pilot, SOP …), also one with no activities for this selection.
    for (const ms of trials ?? milestones.map((m) => m.id)) if (!byMs.has(ms)) byMs.set(ms, new Map())
    return [...byMs.entries()]
      .sort(([a], [b]) => msOrder(a) - msOrder(b))
      .map(([ms, acts]) => {
        const list = [...acts.values()].map((items) => ({ key: `${items[0].activity.id}|${ms}`, activity: items[0].activity, items }))
        const all = list.flatMap((a) => a.items)
        return { ms, label: milestones.find((m) => m.id === ms)?.label ?? ms, list, done: all.filter((i) => i.status === 'Approved').length, total: all.length }
      })
  }, [instances, trials?.join(), milestones]) // eslint-disable-line react-hooks/exhaustive-deps
  const activityCount = groups.reduce((n, g) => n + g.list.length, 0)
  // The models of the selection (shown in the list header).
  const selectedModels = [...new Set(instances.map((i) => i.part.model))].sort()

  const active = groups.flatMap((g) => g.list).find((a) => a.key === activeKey)
  const items = active?.items ?? []
  // Fields this role fills on at least one selected part (tables, buttons and derived values are per part, so not here).
  const fields = useMemo<FieldDefinition[]>(() => {
    if (!active) return []
    return active.activity.fields.filter((f) =>
      !f.dataOnly && f.type !== 'table' && f.type !== 'button' && f.type !== 'derived' &&
      fieldVisibleToPersona(f, role) && items.some((i) => canPersonaEdit(f, role, i.entry)))
  }, [active, items, role])
  const targets = items.map((i) => ({ id: key(i), label: `${i.part.partNo} · ${i.part.model}`, values: i.entry?.values ?? {} }))
  const filled = Object.fromEntries(Object.entries(draft).filter(([, v]) => !isBlank(v)))
  const steps = active?.activity.flow.steps ?? []
  const validator = validatingRole(role)
  const canApprove = role !== 'Vendor' && steps.some((s) => s.role === validator && s.allowedOutcomes.includes('Approve'))
  const entersFirst = steps[0]?.role === role || (role !== 'Vendor' && steps[0]?.role === validator)

  // Leaving the activity (another activity, another selection or another page) saves what was entered as a draft,
  // except values that would overwrite different saved data.
  const autoDraft = () => {
    if (!active || Object.keys(filled).length === 0) return
    const kept = new Set(conflictsOf(targets, () => filled, () => fields).map((c) => c.k))
    apply('draft', kept)
    toast(`${active.activity.name}: your entries were saved as a draft${kept.size ? ` (${kept.size} value${kept.size === 1 ? '' : 's'} that would overwrite existing data left out)` : ''}.`)
  }
  // When the selection changes (filters), first save the previous entries as a draft for the parts they were made for.
  const prevAutoDraft = useRef(autoDraft)
  const selectionSig = instances.map(key).join(',')
  useEffect(() => {
    prevAutoDraft.current()
    setDraft({})
    setNotice('')
  }, [selectionSig]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevAutoDraft.current = autoDraft }) // after every render: the latest values, for the next change
  useEffect(() => () => prevAutoDraft.current(), []) // leaving the page
  const pick = (k: string) => { if (k !== activeKey) autoDraft(); setActiveKey(k); setDraft({}); setNotice(''); setTab('form'); setTabPart(null) }

  /** Write the values, then submit / approve each part as its flow allows. */
  function apply(mode: Mode, kept: Set<string>) {
    if (!active) return
    let saved = 0, submitted = 0, approved = 0, notReady = 0
    const freshEntry = (i: FilteredInstance): ActivityEntry | undefined =>
      useQAStore.getState().entries.find((e) => e.id === makeEntryId(i.row.id, i.part.partNo))
    const missingRequired = (i: FilteredInstance) => {
      const vals = freshEntry(i)?.values ?? {}
      return active.activity.fields.some((f) => f.mandatory && !f.dataOnly && f.enteredBy === validator && f.type !== 'table' && isBlank(vals[f.key]))
    }
    for (const i of items) {
      const own = Object.fromEntries(Object.entries(filled).filter(([k]) => {
        const f = fields.find((x) => x.key === k)
        return f && canPersonaEdit(f, role, i.entry) && !kept.has(`${key(i)}|${k}`)
      }))
      if (Object.keys(own).length) { updateEntryValues(i.row.id, i.part.partNo, own, role); saved++ }
      if (mode === 'draft') continue
      const id = makeEntryId(i.row.id, i.part.partNo)
      let e = freshEntry(i)
      // Submit what this role enters first (still in draft or sent back).
      if (e && (e.validationState === 'Draft' || e.validationState === 'Sent back') && entersFirst) {
        if (mode === 'approve' && missingRequired(i)) { notReady++; continue }
        transitionEntryState(id, 'Submit', undefined, role)
        submitted++
        e = freshEntry(i)
      }
      if (mode !== 'approve') continue
      // Approve where the item now waits at this role's step.
      if (e?.validationState === 'Submitted' && steps[e.currentStepIndex]?.role === validator) {
        if (missingRequired(i)) { notReady++; continue }
        transitionEntryState(id, 'Approve', undefined, role)
        approved++
      } else if (e?.validationState !== 'Approved') notReady++
    }
    const n = items.length
    const parts = [
      saved ? `saved ${saved}` : '',
      submitted ? `submitted ${submitted}` : '',
      approved ? `approved ${approved}` : '',
      notReady ? `${notReady} not ready to approve (waiting on another step, e.g. the vendor's submission, or a required field is empty)` : '',
    ].filter(Boolean)
    setNotice(`${n} part${n === 1 ? '' : 's'} — ${parts.length ? parts.join(' · ') : 'nothing to change'}`)
    setDraft({})
    setReview(null)
  }
  function run(mode: Mode) {
    const conflicts = conflictsOf(targets, () => filled, () => fields)
    if (conflicts.length) { setKeep(new Set()); setReview({ mode, conflicts }); return }
    apply(mode, new Set())
  }

  // Closing the drawer (✕, the backdrop or Esc) keeps what was entered as a draft, like the part form.
  const closeForm = () => { autoDraft(); setActiveKey(null); setDraft({}); setNotice(''); setReview(null) }
  const closeRef = useRef(closeForm)
  useEffect(() => { closeRef.current = closeForm })
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !review) closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, review])

  const tasks = [...new Set(items.map((i) => taskOf(i, { releases: partReleases, acks: partAcks }) ?? '—'))]
  const st = active ? rollup(items) : null
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
  // Same tabs as the part form; counts add up over the selected parts.
  const liveEntry = (i: FilteredInstance) => entries.find((e) => e.id === makeEntryId(i.row.id, i.part.partNo))
  const sum = (f: (i: FilteredInstance) => number) => items.reduce((n, i) => n + f(i), 0)
  const drawerTabs: TabItem[] = active ? [
    { id: 'form', label: 'Form' },
    ...(active.activity.trackNgRounds ? [{ id: 'ng', label: `NG rounds (${sum((i) => liveEntry(i)?.ngRounds?.length ?? 0)})` }] : []),
    { id: 'documents', label: `Documents (${sum((i) => documents.filter((d) => d.entryId === makeEntryId(i.row.id, i.part.partNo) && (role !== 'Vendor' || d.uploadedBy === 'Vendor')).length)})` },
    { id: 'actions', label: `Actions (${sum((i) => liveEntry(i)?.actions?.length ?? 0)})` },
    { id: 'deviations', label: `Deviations (${sum((i) => liveEntry(i)?.deviations?.length ?? 0)})` },
    ...(active.activity.canReferenceOtherActivities ? [{ id: 'refs', label: 'References' }] : []),
    { id: 'history', label: `History (${sum((i) => liveEntry(i)?.history?.length ?? 0)})` },
  ] : []
  const shownPart = items.find((i) => i.part.partNo === tabPart) ?? items[0]

  return (
    <>
      {/* Activities of the selection (still grouped by trial below), on the left. Picking one opens its update form on the right. */}
      <div className={`grid grid-cols-1 gap-3 lg:grid-cols-[minmax(380px,1fr)_minmax(0,1fr)] ${fill ? 'h-[calc(100vh-4.75rem)] items-stretch' : 'items-start'}`}>
      <section className={`epmp-card flex min-h-0 flex-col overflow-hidden ${fill ? 'h-full' : ''}`}>
        <h2 className="m-0 flex flex-wrap items-center gap-2 bg-[var(--color-nav-bg)] px-4 py-2.5 text-[12.5px] font-semibold text-white">
          Activities ({activityCount}) · <span className="font-normal" title={selectedModels.join(', ')}>{selectedModels.length === 1 ? 'Model' : 'Models'}: {selectedModels.join(', ') || '—'}</span>
        </h2>
        <div className={`space-y-2 overflow-y-auto p-2.5 ${fill ? 'min-h-0 flex-1' : 'max-h-[calc(100vh-300px)]'}`}>
          {groups.map((g) => {
            const open = !closedGroups.has(g.ms)
            const pct = g.total ? Math.round((g.done / g.total) * 100) : 0
            return (
              <div key={g.ms} className="rounded-xl border border-[var(--color-border)] bg-white">
                <button type="button" onClick={() => setClosedGroups((s) => { const n = new Set(s); if (n.has(g.ms)) n.delete(g.ms); else n.add(g.ms); return n })}
                  aria-expanded={open} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--color-surface)]">
                  <Icon name="chevron-down" size={13} className={open ? '' : '-rotate-90'} />
                  <span className="text-[12.5px] font-semibold text-[#101828]">{g.label} ({g.list.length})</span>
                  <span className="ml-auto flex w-36 flex-col items-end gap-0.5">
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface)]"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                    <span className="text-[10px] text-[var(--color-muted)]">{g.done} / {g.total} approved ({pct}%)</span>
                  </span>
                </button>
                {open && g.list.length === 0 && (
                  <p className="border-t border-[var(--color-border)] px-3 py-2.5 text-[10.5px] text-[var(--color-muted)]">
                    No activities for {g.label} in this selection (none set up for this trial in the section template, or none match the filters).
                  </p>
                )}
                {open && g.list.length > 0 && (
                  <ul className="border-t border-[var(--color-border)] p-1">
                    {g.list.map((a, n) => {
                      const rs = rollup(a.items)
                      const isOn = a.key === activeKey
                      return (
                        <li key={a.key}>
                          <button type="button" onClick={() => pick(a.key)} aria-current={isOn ? 'true' : undefined} aria-haspopup="dialog"
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${isOn ? 'bg-secondary ring-1 ring-[#bfdbfe]' : 'hover:bg-[var(--color-surface)]'}`}>
                            <span className="w-5 flex-none text-[10px] tabular-nums text-[var(--color-muted)]">{String(n + 1).padStart(2, '0')}</span>
                            <span className="min-w-0 flex-1 text-[11.5px] text-[#101828]">{a.activity.name}</span>
                            <span className="text-[10px] tabular-nums text-[var(--color-muted)]">{a.items.filter((i) => i.status === 'Approved').length}/{a.items.length}</span>
                            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rs.cls}`}>{rs.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
          {groups.length === 0 && <p className="py-6 text-center text-[11.5px] text-[var(--color-muted)]">No activities for this selection.</p>}
        </div>
      </section>
      {/* Right: where the update form opens */}
      <div className={`hidden items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-white/60 px-6 text-center text-[11.5px] text-[var(--color-muted)] lg:flex ${fill ? 'h-full' : 'min-h-[240px]'}`}>
        Pick an activity on the left to update it for the {partCount} selected part{partCount === 1 ? '' : 's'}. The form opens here, on the right.
      </div>
      </div>

      {/* Update form: a drawer on the right, same frame as the part form. */}
      {active && st && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={closeForm} />
          <div role="dialog" aria-modal="true" aria-label={`Update activity · ${active.activity.name}`}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl max-lg:h-[100dvh]">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[var(--color-border)] px-5 py-4 max-sm:px-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                    <span className="text-xs text-[var(--color-muted)]">Bulk update · {items.length} part{items.length === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-[#bfdbfe] bg-secondary px-2 py-0.5 text-[10.5px] text-primary" title="Next step in this activity's flow">
                      <span className="text-[var(--color-muted)]">Task</span> <strong className="font-semibold">{tasks.length === 1 ? tasks[0] : 'Mixed'}</strong>
                    </span>
                  </div>
                  <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-[var(--color-text)]" title={active.activity.name}>
                    <span className="truncate">{active.activity.name}</span>
                    <span className="flex-none rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary"><TrialName id={active.items[0].row.milestoneId} /></span>
                  </h2>
                  <p className="mt-0.5 truncate text-[12px] text-[#344054]">
                    {items.length === 1
                      ? <>{items[0].part.partName} <span className="font-mono text-xs text-[var(--color-muted)]">· {items[0].part.partNo}</span></>
                      : `${items.length} parts updated together`}
                  </p>
                </div>
                <button type="button" onClick={closeForm} aria-label="Close" title="Close (your entries are kept as a draft)"
                  className="ml-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-muted)]">
                <span>Model: <strong className="text-[var(--color-text)]">{uniq(items.map((i) => i.part.model)).join(', ')}</strong></span>
                <span>Vendor: <strong className="text-[var(--color-text)]">{uniq(items.map((i) => i.part.vendorName)).join(', ') || '—'}</strong></span>
                <span>Trial: <strong className="text-[var(--color-text)]">{milestones.find((m) => m.id === active.items[0].row.milestoneId)?.label ?? active.items[0].row.milestoneId}</strong></span>
              </div>
            </div>

            {/* Tabs (as on the part form) */}
            <div className="flex-shrink-0 border-b border-[var(--color-border)] px-5 pt-3 max-sm:px-4">
              <Tabs items={drawerTabs} activeId={tab} onChange={setTab} className="max-lg:flex-nowrap" />
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-sm:px-4">
              {tab !== 'form' && shownPart && (
                <>
                  {items.length > 1 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Part">
                      <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Part</span>
                      {items.map((i) => {
                        const on = i.part.partNo === shownPart.part.partNo
                        return (
                          <button key={key(i)} type="button" onClick={() => setTabPart(i.part.partNo)} aria-pressed={on}
                            className={`rounded-full border px-2.5 py-1 text-[10.5px] ${on ? 'border-[var(--color-primary)] bg-secondary font-semibold text-primary' : 'border-[var(--color-border)] text-[#344054] hover:bg-[var(--color-surface)]'}`}>
                            <span className="font-mono">{i.part.partNo}</span> <span className="text-[var(--color-muted)]">{i.part.partName}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <PartDetailDrawer key={`${tab}|${key(shownPart)}`} activity={shownPart.activity} row={shownPart.row} partNo={shownPart.part.partNo} onClose={() => setTab('form')} embedTab={tab} />
                </>
              )}
              {tab === 'form' && (<>
              {/* The selected parts for this activity */}
              <div className="mb-4 overflow-hidden rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--color-surface)] text-left text-[10.5px] text-[#344054]">
                    <tr><th className="px-2.5 py-1.5">Part</th><th className="px-2.5 py-1.5">Model</th><th className="px-2.5 py-1.5">Status</th><th className="px-2.5 py-1.5">Task</th></tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={key(i)} className="border-t border-[var(--color-border)]">
                        <td className="px-2.5 py-1.5"><span className="font-mono">{i.part.partNo}</span> <span className="text-[var(--color-muted)]">{i.part.partName}</span></td>
                        <td className="px-2.5 py-1.5">{i.part.model}</td>
                        <td className="px-2.5 py-1.5">{i.status === 'NotStarted' ? 'Not started' : i.status}</td>
                        <td className="px-2.5 py-1.5">{taskOf(i, { releases: partReleases, acks: partAcks }) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fields.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-[11.5px] text-[var(--color-muted)]">
                  You have no fields to fill on this activity for these parts{canApprove ? ' — you can still approve what is waiting for you.' : '.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.key} className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-medium text-[#344054]">{field.label}{field.mandatory && <span className="text-red-500"> *</span>}</span>
                        {field.source && <SourceBadge source={field.source as SourceType} />}
                      </div>
                      {getFieldRenderer(field.type).editor({ field, value: draft[field.key], onChange: (v) => setDraft((d) => ({ ...d, [field.key]: v })), currentPersona: role })}
                      <ExistingValues field={field} targets={targets} />
                    </div>
                  ))}
                </div>
              )}
              </>)}
            </div>

            {/* Footer (the bulk form's buttons) */}
            {tab === 'form' && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-5 py-3 max-sm:px-4">
              <Button variant="secondary" size="md" disabled={Object.keys(filled).length === 0} onClick={() => run('draft')}>Save draft</Button>
              {entersFirst && <Button variant={canApprove ? 'secondary' : 'primary'} size="md" onClick={() => run('submit')}>Submit</Button>}
              {canApprove && <Button variant="primary" size="md" onClick={() => run('approve')}><Icon name="check" size={14} className="mr-1" />Save &amp; approve</Button>}
              <span className="min-w-0 flex-1 basis-full text-[10.5px] text-[var(--color-muted)] sm:basis-0 sm:text-right" role="status">
                {notice || `Values are written to all ${items.length} selected part${items.length === 1 ? '' : 's'}; blank fields keep each part's value.`}
              </span>
            </div>
            )}
          </div>
        </>
      )}
      {review && (
        <OverwriteReview conflicts={review.conflicts} keep={keep} setKeep={setKeep}
          confirmLabel={review.mode === 'approve' ? 'Confirm & approve' : review.mode === 'submit' ? 'Confirm & submit' : 'Confirm & save'}
          onBack={() => setReview(null)} onConfirm={() => apply(review.mode, keep)} />
      )}
    </>
  )
}

export function ActivityUpdatePage() {
  const { entries, activities, templateRows, models, milestones, partReleases, partAcks } = useQAStore()
  const workParts = useWorkParts()
  const { currentPersona: role } = usePersonaStore()
  const [fModels, setFModels] = useState<string[]>([])
  const [trial, setTrial] = useState('All')
  const [fParts, setFParts] = useState<string[]>([])

  // ── Top filters: Model(s) → Trial → Part(s) ──
  const scoped = useMemo(
    () => workParts.filter((p) => !p.supersededBy && partInScope(p, role) && (role !== 'Vendor' || isWorkableByVendor(p.partNo, partReleases, partAcks))),
    [workParts, role, partReleases, partAcks]
  )
  const modelOptions = useMemo(() => [...new Set(scoped.map((p) => p.model))].sort(), [scoped])
  const partsOfModels = useMemo(() => scoped.filter((p) => fModels.includes(p.model)), [scoped, fModels])
  const partOptions = useMemo(
    () => partsOfModels.map((p) => ({ value: p.partNo, label: `${p.partNo}: ${p.partName} (${p.model})` })).sort((a, b) => a.label.localeCompare(b.label)),
    [partsOfModels]
  )
  const selectedParts = useMemo(() => fParts.filter((pn) => partsOfModels.some((p) => p.partNo === pn)), [fParts, partsOfModels])
  const allOfParts = useMemo(() => {
    if (selectedParts.length === 0) return []
    const sel = new Set(selectedParts)
    return getFilteredData(entries, activities, scoped.filter((p) => sel.has(p.partNo)), templateRows, models, { ...ALL }, 'overview', DEMO_TODAY)
      .filter((i) => !i.notApplicable)
  }, [entries, activities, scoped, templateRows, models, selectedParts])
  const msOrder = (id: string) => { const k = milestones.findIndex((m) => m.id === id); return k < 0 ? 99 : k }
  const trialOptions = [...new Set(allOfParts.map((i) => i.row.milestoneId))].sort((a, b) => msOrder(a) - msOrder(b))
  const instances = useMemo(() => allOfParts.filter((i) => trial === 'All' || i.row.milestoneId === trial), [allOfParts, trial])

  if (!hasMyWork(role)) {
    return (
      <div>
        <PageHeader title="Activity Update" section="Parts Data Entry" />
        <div className="epmp-card px-6 py-10 text-center text-sm text-[var(--color-muted)]">Activity Update is for the PIC, Vendor, SIC and DPM.</div>
      </div>
    )
  }

  const crumbs = [fModels.length ? fModels.join(', ') : 'Model', trial === 'All' ? 'All trials' : trial, 'Activity']
  return (
    <div className="pb-6">
      <PageHeader title="Activity Update" section="Parts Data Entry" />
      <section className="epmp-card mb-3 flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">1 · Model</span>
        <MultiSelect label="Model" options={modelOptions.map((m) => ({ value: m }))} selected={fModels} onChange={setFModels} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">2 · Trial</span>
        <select value={trial} onChange={(e) => setTrial(e.target.value)} aria-label="Trial" disabled={selectedParts.length === 0}
          className="h-9 rounded-lg border border-[var(--color-border)] px-2.5 text-[11.5px] text-[#344054]">
          <option value="All">All trials</option>
          {trialOptions.map((t) => <option key={t} value={t}>{milestones.find((m) => m.id === t)?.label ?? t}</option>)}
        </select>
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">3 · Part</span>
        {fModels.length === 0
          ? <span className="text-[11.5px] text-[var(--color-muted)]">Choose model(s) first</span>
          : <MultiSelect label="Part" options={partOptions} selected={selectedParts} onChange={setFParts} />}
        <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{selectedParts.length} part{selectedParts.length === 1 ? '' : 's'} selected</span>
      </section>
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#475467]" aria-label="Selection">
        <Link to="/data-entry" className="inline-flex items-center hover:text-[var(--color-primary)]" aria-label="Parts Data Entry"><Icon name="grid" size={13} /></Link>
        {crumbs.map((c, n) => (
          <span key={n} className="inline-flex items-center gap-1.5">
            <span className="text-[var(--color-muted)]">›</span>
            <span className={n === crumbs.length - 1 ? 'font-semibold text-[#101828]' : ''}>{c}</span>
          </span>
        ))}
      </nav>
      {selectedParts.length === 0 ? (
        <div className="epmp-card px-6 py-12 text-center text-[12px] text-[var(--color-muted)]">
          Select one or more <strong>models</strong>, then the <strong>parts</strong> to update. Pick several to update them together.
        </div>
      ) : (
        <ActivityUpdatePanel instances={instances} partCount={selectedParts.length} trials={trial === 'All' ? undefined : [trial]} />
      )}
    </div>
  )
}
