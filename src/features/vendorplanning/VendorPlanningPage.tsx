/**
 * Vendor Planning. Pick parts (or arrive from My Parts with ?parts=…&show=awaiting); every activity of those parts is listed
 * with the system's MRD reference date and the Planned Window calculated from it. The vendor plans a start and an end date. Each activity's definition says who sets its planned date (plannedDateOwner):
 *  - Vendor: the vendor enters and submits it; the PIC approves all of a part's submitted dates at one go, or sends
 *    them back with a comment (the vendor then changes and resubmits).
 *  - PIC: the PIC enters it directly (no approval).
 * A vendor plan inside the window (start and end) stands (approved automatically); with either date outside it needs a remark and goes to the PIC
 * for approval (notified in the bell). Earlier dates are kept. A Gantt view shows each window as a band with the
 * planned start → end as a bar on it; clicking a row places the bar's start there. The vendor sees only its own activities on
 * parts released to it and acknowledged.
 */
import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, PageHeader } from '../../components'
import { plannedDateOwner } from '../../domain'
import { Icon } from '../../components/Icon'
import { toast } from '../../components/Toast'
import { vendorLabel } from '../../domain/people'
import { getFilteredData, getMilestoneMrd, isWorkableByVendor, resolveInstanceDates } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { useWorkParts } from '../../hooks/useWorkParts'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { useQAStore } from '../../store/qaStore'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { MultiSelect } from '../intake/MultiSelect'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'
import { trialLabelOf } from '../trialLabel'
import { PLAN_SLA_DAYS, usePlanningSla } from './planningSla'
import type { PartSla } from './planningSla'

const key = (i: FilteredInstance) => `${i.row.id}|${i.part.partNo}`
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function VendorPlanningPage() {
  const { entries, activities, templateRows, models, milestones, partReleases, partAcks, submitVendorPlan, decideVendorPlans } = useQAStore()
  const workParts = useWorkParts()
  const { currentPersona: role } = usePersonaStore()
  const isVendor = role === 'Vendor'
  const canDecide = role === 'PIC' || role === 'SIC' || role === 'Admin'

  // Parts in scope: the vendor sees only parts released to it and acknowledged.
  const scoped = useMemo(
    () => workParts.filter((p) => !p.supersededBy && partInScope(p, role) && (!isVendor || isWorkableByVendor(p.partNo, partReleases, partAcks))),
    [workParts, role, isVendor, partReleases, partAcks]
  )
  // Arriving from My Parts: ?parts=A,B&show=awaiting opens those parts' plans.
  const [params] = useSearchParams()
  const [fParts, setFParts] = useState<string[]>(() => (params.get('parts') ?? '').split(',').filter(Boolean))
  const [fModels, setFModels] = useState<string[]>([])
  const [trial, setTrial] = useState('All')
  const [view, setView] = useState<'table' | 'gantt' | 'status'>('table')
  const [show, setShow] = useState<'all' | 'unplanned' | 'late' | 'awaiting' | 'sentback'>(() => (['awaiting', 'sentback', 'late', 'unplanned'] as const).find((x) => x === params.get('show')) ?? 'all')
  const modelOptions = [...new Set(scoped.map((p) => p.model))].sort().map((value) => ({ value }))
  const partOptions = scoped
    .filter((p) => fModels.length === 0 || fModels.includes(p.model))
    .map((p) => ({ value: p.partNo, label: `${p.partNo}: ${p.partName} (${p.model})` }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const chosen = fParts.filter((n) => scoped.some((p) => p.partNo === n && (fModels.length === 0 || fModels.includes(p.model))))

  // The vendor's activities for the chosen parts (flows that start with the vendor), in trial order.
  const msOrder = (id: string) => { const k = milestones.findIndex((m) => m.id === id); return k < 0 ? 99 : k }
  const rows = useMemo(() => {
    if (!chosen.length) return []
    const sel = new Set(chosen)
    return getFilteredData(entries, activities, scoped.filter((p) => sel.has(p.partNo)), templateRows, models, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY)
      .filter((i) => !i.notApplicable)
      .map((i) => {
        const win = resolveInstanceDates(i.row, i.model, i.activity, i.part)
        const plan = i.entry?.vendorPlan
        return { i, owner: plannedDateOwner(i.activity), mrd: getMilestoneMrd(i.model, i.row.milestoneId), win: win.status === 'resolved' ? win : null, plan, status: plan ? plan.status ?? 'Submitted' : undefined }
      })
      // The vendor plans (and sees) only the activities it defines.
      .filter((r) => !isVendor || r.owner === 'Vendor')
      .sort((a, b) => a.i.part.partNo.localeCompare(b.i.part.partNo) || msOrder(a.i.row.milestoneId) - msOrder(b.i.row.milestoneId) || (a.win?.end ?? '').localeCompare(b.win?.end ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activities, scoped, templateRows, models, chosen.join(), milestones, isVendor])
  const trialOptions = [...new Set(rows.map((r) => r.i.row.milestoneId))].sort((a, b) => msOrder(a) - msOrder(b))

  // Edits not yet submitted: date and remark per row.
  const [edit, setEdit] = useState<Record<string, { start?: string; date?: string; remark?: string }>>({})
  /** Planned end (the plan's `date`). */
  const dateOf = (r: (typeof rows)[number]) => edit[key(r.i)]?.date ?? r.plan?.current.date ?? ''
  /** Planned start; older plans had only an end date, so the window start stands in. */
  const startOf = (r: (typeof rows)[number]) => edit[key(r.i)]?.start ?? r.plan?.current.start ?? (r.plan ? r.win?.start ?? '' : '')
  const remarkOf = (r: (typeof rows)[number]) => edit[key(r.i)]?.remark ?? r.plan?.current.remark ?? ''
  // Days outside the planned window: > 0 when the planned end is after the window's end, < 0 when the planned start is
  // before the window's start, 0 when both are inside (or there is no date / window).
  const outBy = (r: (typeof rows)[number]) => {
    const d = dateOf(r), st = startOf(r)
    if (!r.win) return 0
    if (d && d > r.win.end) return days(r.win.end, d)
    if (st && st < r.win.start) return -days(st, r.win.start)
    return 0
  }
  const lateBy = outBy
  // Who may type the date: the activity's owner (Admin: any).
  const editable = (r: (typeof rows)[number]) => role === 'Admin' || (r.owner === 'Vendor' ? isVendor : role === 'PIC' || role === 'SIC')
  const shown = rows.filter((r) =>
    (trial === 'All' || r.i.row.milestoneId === trial) &&
    (show === 'all' || (show === 'unplanned' ? !dateOf(r) || !startOf(r) : show === 'late' ? lateBy(r) !== 0 : show === 'awaiting' ? r.status === 'Submitted' : r.status === 'Sent back')))
  const dirty = rows.filter((r) => {
    const e = edit[key(r.i)]
    return e && ((e.date !== undefined && e.date !== (r.plan?.current.date ?? '')) || (e.start !== undefined && e.start !== (r.plan?.current.start ?? '')) || (e.remark !== undefined && e.remark !== (r.plan?.current.remark ?? '')))
  })
  const incomplete = dirty.filter((r) => !startOf(r) || !dateOf(r) || startOf(r) > dateOf(r))
  const needsRemark = dirty.filter((r) => lateBy(r) !== 0 && !remarkOf(r).trim())
  const counts = {
    total: rows.length,
    planned: rows.filter((r) => r.plan).length,
    late: rows.filter((r) => lateBy(r) !== 0).length,
    awaiting: rows.filter((r) => r.status === 'Submitted').length,
    sentBack: rows.filter((r) => r.status === 'Sent back').length,
  }
  const canEdit = rows.some(editable)
  // PIC review: per part, the vendor dates waiting for approval.
  const [sendBack, setSendBack] = useState<{ partNos: string[]; comment: string } | null>(null)
  const awaitingOf = (partNo: string) => rows.filter((r) => r.i.part.partNo === partNo && r.status === 'Submitted')
  const awaitingIn = (partNos: string[]) => rows.filter((r) => partNos.includes(r.i.part.partNo) && r.status === 'Submitted')
  const awaitingParts = [...new Set(rows.filter((r) => r.status === 'Submitted').map((r) => r.i.part.partNo))]
  /** Approve, or send back with a comment, every submitted date of these parts at one go. */
  const decide = (partNos: string[], decision: 'Approve' | 'Send back', comment?: string) => {
    const items = awaitingIn(partNos).map((r) => ({ templateRowId: r.i.row.id, partNo: r.i.part.partNo }))
    const n = decideVendorPlans({ items, decision, comment, by: role })
    const what = partNos.length === 1 ? partNos[0] : `${partNos.length} parts`
    toast(decision === 'Approve' ? `${n} planned date${n === 1 ? '' : 's'} approved for ${what}.` : `${n} planned date${n === 1 ? '' : 's'} sent back to the vendor for ${what}.`)
  }
  // Part timelines (ack + 15 d) and rejections, for the part headers and the Part status view.
  const slaAll = usePlanningSla()
  const slaOf = useMemo(() => new Map(slaAll.map((s) => [s.part.partNo, s])), [slaAll])
  const partActions = (partNo: string) => {
    const w = awaitingOf(partNo).length
    return canDecide && w > 0 ? (
      <span className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => setSendBack({ partNos: [partNo], comment: '' })}>Send back…</Button>
        <Button variant="primary" size="sm" onClick={() => decide([partNo], 'Approve')}><Icon name="check" size={12} className="mr-1" />Approve all ({w})</Button>
      </span>
    ) : null
  }
  const set = (k: string, p: { start?: string; date?: string; remark?: string }) => setEdit((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }))
  const fillWindow = () => {
    const next = { ...edit }
    for (const r of shown) if (editable(r) && !dateOf(r) && !startOf(r) && r.win) next[key(r.i)] = { ...next[key(r.i)], start: r.win.start, date: r.win.end }
    setEdit(next)
  }
  /** Gantt click: the planned bar starts on that day and keeps its length (a new bar is as long as the window). */
  const placeStart = (k: string, day: string) => {
    const r = rows.find((x) => key(x.i) === k)
    if (!r) return
    const st = startOf(r), en = dateOf(r)
    const len = st && en ? Math.max(0, days(st, en)) : r.win ? Math.max(0, days(r.win.start, r.win.end)) : 0
    set(k, { start: day, date: new Date(Date.parse(`${day}T00:00:00Z`) + len * 86_400_000).toISOString().slice(0, 10) })
  }
  const submit = () => {
    if (incomplete.length) { toast(`Enter a start and an end date (start not after end) for ${incomplete.length === 1 ? 'the activity' : `all ${incomplete.length} activities`} you changed.`); return }
    if (needsRemark.length) { toast(`Add a remark for the ${needsRemark.length} date${needsRemark.length === 1 ? '' : 's'} outside the planned window.`); return }
    const n = submitVendorPlan({
      items: dirty.map((r) => ({ templateRowId: r.i.row.id, partNo: r.i.part.partNo, start: startOf(r), date: dateOf(r), remark: remarkOf(r), outside: lateBy(r) !== 0 })),
      by: role, actorName: isVendor ? FIXED_VENDOR_NAME : undefined,
    })
    const out = isVendor ? dirty.filter((r) => lateBy(r) !== 0).length : 0
    setEdit({})
    toast(n ? `Plan submitted: ${n} activit${n === 1 ? 'y' : 'ies'} planned.${out ? ` ${out} outside the planned window ${out === 1 ? 'goes' : 'go'} to the PIC for approval; the rest stand.` : ''}` : 'Nothing changed.')
  }

  const sel = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11.5px] text-[#344054]'
  return (
    <div className="pb-6">
      <PageHeader title="Vendor Planning" section="Parts Data Entry" />
      <section className="epmp-card mb-3 flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Model</span>
        <MultiSelect label="Model" options={modelOptions} selected={fModels} onChange={setFModels} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Parts</span>
        <MultiSelect label="Part" options={partOptions} selected={chosen} onChange={setFParts} />
        {rows.length > 0 && (
          <>
            <select value={trial} onChange={(e) => setTrial(e.target.value)} aria-label="Trial" className={sel}>
              <option value="All">All trials</option>
              {trialOptions.map((t) => <option key={t} value={t}>{trialLabelOf(t)}</option>)}
            </select>
            <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="Show">
              {([['all', 'All'], ['unplanned', 'Not planned'], ['awaiting', `Awaiting approval (${counts.awaiting})`], ['sentback', `Sent back (${counts.sentBack})`], ['late', 'Outside window']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setShow(id)} aria-pressed={show === id}
                  className={`rounded-md px-2.5 py-1 text-[10.5px] font-medium ${show === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{label}</button>
              ))}
            </div>
          </>
        )}
        <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{chosen.length} part{chosen.length === 1 ? '' : 's'} selected{isVendor ? ` · ${scoped.length} released to you` : ''}</span>
      </section>

      {chosen.length === 0 && view !== 'status' ? (
        <div className="epmp-card px-6 py-12 text-center text-[12px] text-[var(--color-muted)]">
          Select one or more <strong>parts</strong> to list their activities with the planned window calculated from the MRD, then enter your planned start and end dates against each.
          {isVendor && scoped.length === 0 && <div className="mt-2">No parts are released to you and acknowledged yet (My Parts).</div>}
          <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => setView('status')}>See the part-wise planning status</Button></div>
        </div>
      ) : (
        <section className="epmp-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[var(--color-text)]">{view === 'status' ? 'Part-wise planning status' : `Planning · ${shown.length} activit${shown.length === 1 ? 'y' : 'ies'}`}</span>
            <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="View">
              {([['table', 'Table'], ['gantt', 'Gantt'], ['status', 'Part status']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
                  className={`rounded-md px-2.5 py-1 text-[10.5px] font-medium ${view === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{label}</button>
              ))}
            </div>
            {view !== 'status' && <span className="text-[10.5px] text-[var(--color-muted)]">{counts.planned} of {counts.total} planned{counts.awaiting ? ` · ${counts.awaiting} awaiting PIC approval` : ''}{counts.sentBack ? ` · ${counts.sentBack} sent back` : ''}{counts.late ? ` · ${counts.late} outside the window` : ''}</span>}
            {canDecide && awaitingParts.length > 0 && view !== 'status' && (
              <span className="flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2 py-1">
                <span className="text-[10.5px] font-semibold text-cyan-800">{counts.awaiting} outside the window · {awaitingParts.length} part{awaitingParts.length === 1 ? '' : 's'}</span>
                <Button variant="secondary" size="sm" onClick={() => setSendBack({ partNos: awaitingParts, comment: '' })}>Send back all…</Button>
                <Button variant="primary" size="sm" onClick={() => decide(awaitingParts, 'Approve')}><Icon name="check" size={12} className="mr-1" />Approve all ({counts.awaiting})</Button>
              </span>
            )}
            {canEdit && view !== 'status' && (
              <span className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={fillWindow} title="Fill the empty start and end dates with the planned window's dates">Use window dates for blanks</Button>
                {dirty.length > 0 && <button type="button" onClick={() => setEdit({})} className="text-[10.5px] font-semibold text-[var(--color-muted)] hover:underline">Discard</button>}
                <Button variant="primary" size="sm" disabled={dirty.length === 0} onClick={submit}><Icon name="check" size={13} className="mr-1" />Submit plan ({dirty.length})</Button>
              </span>
            )}
          </div>
          {view === 'status' ? (
            <PartStatus rows={slaAll.filter((s) => (chosen.length ? chosen.includes(s.part.partNo) : scoped.some((p) => p.partNo === s.part.partNo)) && (s.state !== 'Acknowledged' || s.planRequired > 0 || !isVendor))}
              actions={partActions} onOpenPart={(no) => { setFParts([no]); setView('table') }} />
          ) : view === 'gantt' ? (
            <PlanGantt partInfo={(no) => <PlanDueChip s={slaOf.get(no)} />} partActions={partActions} rows={shown.map((r) => ({
              k: key(r.i), part: r.i.part, activity: r.i.activity.name, trial: trialLabelOf(r.i.row.milestoneId), win: r.win,
              start: startOf(r), date: dateOf(r), out: lateBy(r), status: dirty.includes(r) ? 'Not submitted' : r.status, owner: r.owner, editable: editable(r),
            }))} onSet={placeStart} />
          ) : (
          <div className="max-h-[calc(100vh-290px)] overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-3 py-2">Part</th>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Trial</th>
                  <th className="px-3 py-2">Planned by</th>
                  <th className="px-3 py-2">MRD reference</th>
                  <th className="px-3 py-2">Planned window (system)</th>
                  <th className="px-3 py-2">My planned start → end</th>
                  <th className="px-3 py-2">Remark</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, n) => {
                  const k = key(r.i)
                  const d = dateOf(r)
                  const late = lateBy(r)
                  const changed = dirty.includes(r)
                  const can = editable(r)
                  const newPart = n === 0 || shown[n - 1].i.part.partNo !== r.i.part.partNo
                  const waiting = awaitingOf(r.i.part.partNo)
                  return (
                    <Fragment key={k}>
                    {newPart && (
                      <tr className="border-t-2 border-[var(--color-border)] bg-[#f5f7ff]">
                        <td colSpan={9} className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#101828]">{r.i.part.partNo}</span>
                            <span className="text-[10.5px] text-[#475467]">{r.i.part.partName} · {r.i.part.model} · {vendorLabel(r.i.part.vendorName, r.i.part.vendorCode)}</span>
                            <PlanDueChip s={slaOf.get(r.i.part.partNo)} />
                            {waiting.length > 0 && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{waiting.length} awaiting approval</span>}
                            <span className="ml-auto">{partActions(r.i.part.partNo)}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className={`border-t border-[var(--color-border)] ${changed ? 'bg-[#fffbeb]' : ''}`}>
                      <td className="px-3 py-2"><span className="font-mono">{r.i.part.partNo}</span><div className="text-[10px] text-[var(--color-muted)]">{r.i.part.partName} · {r.i.part.model}</div></td>
                      <td className="px-3 py-2">{r.i.activity.name}</td>
                      <td className="px-3 py-2"><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">{trialLabelOf(r.i.row.milestoneId)}</span></td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.owner === 'Vendor' ? 'bg-orange-50 text-orange-700' : 'bg-violet-50 text-violet-700'}`}>{r.owner}</span></td>
                      <td className="whitespace-nowrap px-3 py-2">{r.mrd ? fmtDate(r.mrd) : <span className="text-[var(--color-muted)]">Awaiting MRD</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.win ? <>{fmtDate(r.win.start)} → <strong>{fmtDate(r.win.end)}</strong></> : <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input type="date" value={startOf(r)} disabled={!can} aria-label={`Planned start for ${r.i.activity.name} on ${r.i.part.partNo}`}
                            onChange={(e) => set(k, { start: e.target.value })}
                            className={`h-8 rounded-lg border px-2 text-[11px] ${late < 0 ? 'border-amber-300 bg-amber-50' : 'border-[var(--color-border)] bg-white'}`} />
                          <span className="text-[var(--color-muted)]">→</span>
                          <input type="date" value={d} min={startOf(r) || undefined} disabled={!can} aria-label={`Planned end for ${r.i.activity.name} on ${r.i.part.partNo}`}
                            onChange={(e) => set(k, { date: e.target.value })}
                            className={`h-8 rounded-lg border px-2 text-[11px] ${late > 0 ? 'border-amber-300 bg-amber-50' : 'border-[var(--color-border)] bg-white'}`} />
                        </div>
                        {r.plan && r.plan.history.length > 0 && (
                          <div className="mt-0.5 text-[9.5px] text-[var(--color-muted)]" title={r.plan.history.map((h) => `${h.start ? `${fmtDate(h.start)} → ` : ''}${fmtDate(h.date)} by ${h.by}`).join('\n')}>
                            was <span className="line-through">{r.plan.history.at(-1)!.start ? `${fmtDate(r.plan.history.at(-1)!.start!)} → ` : ''}{fmtDate(r.plan.history.at(-1)!.date)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input value={remarkOf(r)} disabled={!can} onChange={(e) => set(k, { remark: e.target.value })}
                          placeholder={late !== 0 ? 'Why outside the window? (required)' : 'Optional'} aria-label="Remark"
                          className={`h-8 w-full min-w-[160px] rounded-lg border px-2 text-[11px] ${late !== 0 && !remarkOf(r).trim() ? 'border-red-300' : 'border-[var(--color-border)]'}`} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[10.5px]">
                        <div className="flex flex-wrap gap-1">
                          {!d || !startOf(r) ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">Not planned</span>
                            : late !== 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{late > 0 ? `End ${late} d after window` : `Start ${-late} d before window`}</span>
                              : <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Within window</span>}
                          {!changed && r.status && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${r.status === 'Approved' ? 'bg-emerald-600 text-white' : r.status === 'Sent back' ? 'bg-red-100 text-red-800' : 'bg-cyan-100 text-cyan-800'}`}>
                              {r.status === 'Submitted' ? 'Awaiting PIC approval' : r.status}
                            </span>
                          )}
                        </div>
                        {changed ? <div className="mt-0.5 text-[9.5px] text-amber-700">Not submitted</div>
                          : r.plan ? <div className="mt-0.5 text-[9.5px] text-[var(--color-muted)]">{r.plan.current.byRole === 'Vendor' ? 'Submitted' : 'Set'} {fmtDate(r.plan.current.at.slice(0, 10))} · {r.plan.current.by}</div> : null}
                        {!changed && r.status === 'Sent back' && r.plan?.decision?.comment && (
                          <div className="mt-0.5 max-w-[220px] whitespace-normal text-[9.5px] text-red-700">“{r.plan.decision.comment}” — {r.plan.decision.by}</div>
                        )}
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
                {shown.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">No vendor activities here.</td></tr>}
              </tbody>
            </table>
          </div>
          )}
          <p className="border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted)]">
            Planned window = the system dates from the MRD reference and the activity's offsets. A plan whose start and end are both inside the window stands; if either is outside it needs a remark and the PIC's approval. Vendor: {chosen.length ? [...new Set(rows.map((r) => vendorLabel(r.i.part.vendorName, r.i.part.vendorCode)))].join(', ') : '—'}.
          </p>
        </section>
      )}

      {sendBack && (
        <Modal open onClose={() => setSendBack(null)} title={`Send back planned dates · ${sendBack.partNos.length === 1 ? sendBack.partNos[0] : `${sendBack.partNos.length} parts`}`} size="md"
          footer={<>
            <Button variant="secondary" size="md" onClick={() => setSendBack(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!sendBack.comment.trim()} onClick={() => { decide(sendBack.partNos, 'Send back', sendBack.comment); setSendBack(null) }}>Send back ({awaitingIn(sendBack.partNos).length})</Button>
          </>}>
          <p className="mb-2 text-[12px] text-[#344054]">The {awaitingIn(sendBack.partNos).length} planned date{awaitingIn(sendBack.partNos).length === 1 ? '' : 's'} outside the window for {sendBack.partNos.length === 1 ? 'this part' : `these ${sendBack.partNos.length} parts`} {awaitingIn(sendBack.partNos).length === 1 ? 'goes' : 'go'} back to the vendor to change and resubmit.</p>
          <textarea value={sendBack.comment} onChange={(e) => setSendBack({ ...sendBack, comment: e.target.value })} rows={3} autoFocus
            placeholder="What should the vendor change? (required)" aria-label="Comment for the vendor"
            className="w-full rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-[12px]" />
        </Modal>
      )}
    </div>
  )
}


// ── Gantt view ─────────────────────────────────────────────────────────────────────────────────────────────────
interface GanttRow {
  k: string
  part: { partNo: string; partName: string; model: string }
  activity: string
  trial: string
  win: { start: string; end: string } | null
  start: string
  date: string
  /** Days outside the window (+ after, − before, 0 inside). */
  out: number
  status?: string
  owner: 'Vendor' | 'PIC'
  editable: boolean
}
const GDAY = 86_400_000
const gnum = (d: string) => Date.parse(`${d}T00:00:00Z`)
const gstr = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Each activity on a time axis: the system planned window as a band, the planned date as a marker on it (green inside
 * the band, amber outside, joined to the band by a line). Clicking a row's track sets the planned date there (where
 * the date is yours to set); a red line marks today.
 */
function PlanGantt({ rows, onSet, partInfo, partActions }: {
  rows: GanttRow[]
  onSet: (k: string, date: string) => void
  /** Extra info and approval buttons on each part's header row. */
  partInfo?: (partNo: string) => React.ReactNode
  partActions?: (partNo: string) => React.ReactNode
}) {
  const [zoom, setZoom] = useState<'week' | 'month'>('month')
  const px = zoom === 'week' ? 16 : 5
  const LEFT = 330
  const range = useMemo(() => {
    const ds = rows.flatMap((r) => [r.win?.start, r.win?.end, r.start, r.date]).filter((d): d is string => !!d).concat(DEMO_TODAY)
    const lo = new Date(Math.min(...ds.map(gnum))), hi = new Date(Math.max(...ds.map(gnum)))
    const from = Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1)
    const to = Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 1, 1)
    return { from, to }
  }, [rows])
  const x = (d: string) => Math.round(((gnum(d) - range.from) / GDAY) * px)
  const width = Math.max(560, Math.round(((range.to - range.from) / GDAY) * px))
  const months: { label: string; left: number }[] = []
  for (let d = new Date(range.from); d.getTime() < range.to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push({ label: d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), left: Math.round(((d.getTime() - range.from) / GDAY) * px) })
  }
  const weeks: number[] = []
  if (zoom === 'week') for (let t = range.from; t < range.to; t += GDAY) if (new Date(t).getUTCDay() === 1) weeks.push(Math.round(((t - range.from) / GDAY) * px))
  const todayX = x(DEMO_TODAY)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-2 text-[10.5px] text-[#475467]">
        <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="Zoom">
          {(['week', 'month'] as const).map((z) => (
            <button key={z} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${zoom === z ? 'bg-white text-[#101828] shadow-sm' : ''}`}>{z}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 rounded-sm border border-emerald-400 bg-emerald-100" />Planned window (system)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-6 rounded-sm bg-emerald-600" />Planned start → end inside</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-6 rounded-sm bg-amber-500" />Either date outside: remark + PIC approval</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-px bg-red-500" />Today</span>
        <span className="ml-auto text-[var(--color-muted)]">Click a row to start the planned bar there (exact dates in the Table)</span>
      </div>
      <div className="max-h-[calc(100vh-330px)] overflow-auto" role="grid" aria-label="Planning Gantt">
        <div className="relative" style={{ width: LEFT + width }}>
          <div className="sticky top-0 z-20 flex border-b border-[var(--color-border)] bg-[#dce8fb]">
            <div className="sticky left-0 z-30 flex-none border-r border-[var(--color-border)] bg-[#dce8fb] px-3 py-1.5 text-[10.5px] font-medium text-[#344054]" style={{ width: LEFT }}>Part · Activity</div>
            <div className="relative h-[30px]" style={{ width }}>
              {months.map((m) => <div key={m.left} className="absolute top-0 border-l border-[#b8cdf0] px-1.5 pt-1 text-[10px] font-semibold text-[#344054]" style={{ left: m.left }}>{m.label}</div>)}
            </div>
          </div>
          {rows.map((r, n) => {
            const newPart = n === 0 || rows[n - 1].part.partNo !== r.part.partNo
            const left = r.win ? x(r.win.start) : 0
            const bandW = r.win ? Math.max(6, x(gstr(gnum(r.win.end) + GDAY)) - left) : 0
            const planned = !!(r.start && r.date)
            const pl = planned ? x(r.start) : 0
            const pw = planned ? Math.max(6, x(gstr(gnum(r.date) + GDAY)) - pl) : 0
            const tip = `${r.activity}${r.win ? ` · window ${fmtDate(r.win.start)} → ${fmtDate(r.win.end)}` : ''}${planned ? ` · planned ${fmtDate(r.start)} → ${fmtDate(r.date)}` : ' · not planned'}${r.out ? ` (${Math.abs(r.out)} d ${r.out > 0 ? 'after' : 'before'} the window)` : ''}`
            return (
              <Fragment key={r.k}>
                {newPart && (
                  <div className="flex border-b border-[var(--color-border)] bg-[#f5f7ff]" style={{ height: 34 }}>
                    <div className="sticky left-0 z-10 flex flex-none items-center gap-2 border-r border-[var(--color-border)] bg-[#f5f7ff] px-3" style={{ width: LEFT }}>
                      <span className="font-mono text-[11px] font-semibold text-[#101828]">{r.part.partNo}</span>
                      <span className="truncate text-[10px] text-[#475467]">{r.part.partName} · {r.part.model}</span>
                    </div>
                    <div className="sticky left-[330px] flex items-center gap-2 px-2" style={{ width: Math.min(width, 900) }}>
                      {partInfo?.(r.part.partNo)}
                      {partActions?.(r.part.partNo)}
                    </div>
                  </div>
                )}
                <div role="row" className="flex border-b border-[var(--color-border)] bg-white" style={{ height: 32 }}>
                  <div role="rowheader" className="sticky left-0 z-10 flex flex-none items-center gap-1.5 border-r border-[var(--color-border)] bg-white px-3" style={{ width: LEFT }}>
                    <span className="rounded bg-secondary px-1 py-px text-[9px] font-semibold text-primary">{r.trial}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[#344054]" title={r.activity}>{r.activity}</span>
                    {r.status && (
                      <span className={`flex-none rounded-full px-1.5 py-px text-[9px] font-semibold ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'Sent back' ? 'bg-red-100 text-red-800' : r.status === 'Not submitted' ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'}`}>
                        {r.status === 'Submitted' ? 'Awaiting PIC' : r.status}
                      </span>
                    )}
                  </div>
                  <div className={`relative ${r.editable ? 'cursor-crosshair' : ''}`} style={{ width }} title={tip}
                    onClick={(e) => {
                      if (!r.editable) return
                      const box = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                      onSet(r.k, gstr(range.from + Math.floor((e.clientX - box.left) / px) * GDAY))
                    }}>
                    {months.map((m) => <div key={m.left} className="absolute inset-y-0 border-l border-[#eef2f7]" style={{ left: m.left }} />)}
                    {weeks.map((w) => <div key={w} className="absolute inset-y-0 border-l border-dashed border-[#f1f5f9]" style={{ left: w }} />)}
                    {r.win ? (
                      <div className="absolute rounded-md border border-emerald-400 bg-emerald-100/80" style={{ left, width: bandW, top: 8, height: 16 }} />
                    ) : <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9.5px] italic text-[var(--color-muted)]">Awaiting MRD</span>}
                    {planned && (
                      <div className={`absolute rounded-sm shadow ${r.out ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-emerald-600 ring-2 ring-white'}`} style={{ left: pl, width: pw, top: 12, height: 8 }} />
                    )}
                    {planned && <span className={`absolute whitespace-nowrap rounded bg-white/85 px-0.5 text-[9.5px] font-semibold ${r.out ? 'text-amber-700' : 'text-emerald-700'}`} style={{ left: pl + pw + 4, top: 9 }}>{fmtDate(r.start)} → {fmtDate(r.date)}{r.out ? ` (${r.out > 0 ? '+' : '−'}${Math.abs(r.out)} d)` : ''}</span>}
                  </div>
                </div>
              </Fragment>
            )
          })}
          {todayX >= 0 && todayX <= width && <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500" style={{ left: LEFT + todayX }} aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}

/** "Plan due <date> (ack + 15 d) · N d left / late" for a part's header. */
function PlanDueChip({ s }: { s?: PartSla }) {
  if (!s || !s.planRequired || !s.planDue) return null
  const left = s.planDaysLeft ?? 0
  const cls = !s.planPending ? 'bg-emerald-100 text-emerald-800' : left < 0 ? 'bg-red-100 text-red-800' : left <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`} title={`Vendor planned dates due within ${PLAN_SLA_DAYS} days of acknowledgement (${fmtDate(s.ackedAt!)})`}>
      {s.planFilled}/{s.planRequired} planned · due {fmtDate(s.planDue)} · {!s.planPending ? 'complete' : left < 0 ? `${-left} d late` : `${left} d left`} · {s.planDaysWithVendor} d with vendor
    </span>
  )
}

/**
 * Part-wise planning status: where each part stands (release, acknowledgement, vendor planned dates against ack + 15
 * days), how many dates are approved, waiting for the PIC or sent back, and every rejection with what happened next.
 */
function PartStatus({ rows, actions, onOpenPart }: { rows: PartSla[]; actions: (partNo: string) => React.ReactNode; onOpenPart: (partNo: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [only, setOnly] = useState<'all' | 'late' | 'rejected'>('all')
  const shown = rows
    .filter((s) => only === 'all' || (only === 'late' ? s.planExceeded || s.ackOverdue || s.releaseOverdue : s.rejections.length > 0))
    .sort((a, b) => Number(b.planExceeded) - Number(a.planExceeded) || (a.planDaysLeft ?? 999) - (b.planDaysLeft ?? 999))
  const stage = (s: PartSla): { text: string; cls: string } => {
    if (s.state === 'Pending') return { text: s.releaseOverdue ? `Release overdue (${s.releaseDays} d)` : `Pending release (${s.releaseDays ?? '—'} d)`, cls: s.releaseOverdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800' }
    if (s.state === 'Returned') return { text: 'Returned by vendor', cls: 'bg-red-100 text-red-800' }
    if (s.state === 'Released') return { text: s.ackOverdue ? `Ack overdue (${s.ackDays} d)` : `Awaiting ack (${s.ackDays} d)`, cls: s.ackOverdue ? 'bg-red-100 text-red-800' : 'bg-violet-100 text-violet-800' }
    if (!s.planRequired) return { text: 'No vendor planning', cls: 'bg-slate-100 text-slate-600' }
    if (!s.planPending) return { text: s.planAwaiting ? 'Planned · awaiting PIC' : 'Planned', cls: s.planAwaiting ? 'bg-cyan-100 text-cyan-800' : 'bg-emerald-100 text-emerald-800' }
    const left = s.planDaysLeft ?? 0
    return { text: left < 0 ? `Planning ${-left} d late` : `Planning · ${left} d left`, cls: left < 0 ? 'bg-red-100 text-red-800' : left <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700' }
  }
  const th = 'px-3 py-2'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-[10.5px]">
        <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="Show parts">
          {([['all', `All (${rows.length})`], ['late', 'Overdue'], ['rejected', 'With rejections']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setOnly(id)} aria-pressed={only === id}
              className={`rounded-md px-2.5 py-1 font-medium ${only === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{label}</button>
          ))}
        </div>
        <span className="text-[var(--color-muted)]">Release within 7 d · acknowledgement within 3 d · vendor planned dates within acknowledgement + {PLAN_SLA_DAYS} d. Click a part for its rejection history.</span>
      </div>
      <div className="max-h-[calc(100vh-300px)] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="text-left">
              <th className={th}>Part</th><th className={th}>Vendor</th><th className={th}>Stage</th><th className={th}>Acknowledged</th><th className={th}>Plan due (ack + {PLAN_SLA_DAYS} d)</th>
              <th className={th}>Days with vendor</th><th className={th}>Planned</th><th className={th}>Approved</th><th className={th}>Awaiting PIC</th><th className={th}>Sent back</th><th className={th}>Rejections</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const st = stage(s)
              const isOpen = open === s.part.partNo
              return (
                <Fragment key={s.part.partNo}>
                  <tr className={`cursor-pointer border-t border-[var(--color-border)] ${isOpen ? 'bg-[var(--color-surface)]' : 'hover:bg-[var(--color-surface)]'}`} onClick={() => setOpen(isOpen ? null : s.part.partNo)}>
                    <td className="px-3 py-2"><span className="font-mono text-[#101828]">{s.part.partNo}</span><div className="text-[10px] text-[var(--color-muted)]">{s.part.partName} · {s.part.model}</div></td>
                    <td className="px-3 py-2">{vendorLabel(s.part.vendorName, s.part.vendorCode)}</td>
                    <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.text}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{s.ackedAt ? fmtDate(s.ackedAt) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{s.planDue ? fmtDate(s.planDue) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{s.planDaysWithVendor ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{s.planRequired ? `${s.planFilled} / ${s.planRequired}` : '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700">{s.planApproved || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-cyan-700">{s.planAwaiting || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-red-700">{s.planSentBack || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{s.rejections.length ? <span className="font-semibold text-red-700">{s.rejections.length}</span> : '—'}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center justify-end gap-1.5">
                        {actions(s.part.partNo)}
                        {s.state === 'Acknowledged' && s.planRequired > 0 && <button type="button" onClick={() => onOpenPart(s.part.partNo)} className="whitespace-nowrap text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">Open plan →</button>}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#fafbff]">
                      <td colSpan={12} className="px-4 py-2.5">
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Rejection history · {s.part.partNo}</div>
                        {s.rejections.length === 0 ? (
                          <p className="text-[11px] text-[var(--color-muted)]">No planned dates sent back for this part.</p>
                        ) : (
                          <table className="w-full text-[10.5px]">
                            <thead><tr className="text-left"><th className="px-2 py-1">Sent back on</th><th className="px-2 py-1">Activity</th><th className="px-2 py-1">Dates rejected</th><th className="px-2 py-1">By</th><th className="px-2 py-1">Comment</th><th className="px-2 py-1">Now</th></tr></thead>
                            <tbody>
                              {s.rejections.map((x, k) => (
                                <tr key={k} className="border-t border-[var(--color-border)]">
                                  <td className="whitespace-nowrap px-2 py-1">{fmtDate(x.at.slice(0, 10))}</td>
                                  <td className="px-2 py-1">{x.activity}</td>
                                  <td className="whitespace-nowrap px-2 py-1 line-through">{x.date ? `${x.start ? `${fmtDate(x.start)} → ` : ''}${fmtDate(x.date)}` : '—'}</td>
                                  <td className="px-2 py-1">{x.by}</td>
                                  <td className="px-2 py-1">{x.comment ? `“${x.comment}”` : '—'}</td>
                                  <td className="px-2 py-1">
                                    <span className={`rounded-full px-2 py-0.5 font-semibold ${x.now === 'Approved' ? 'bg-emerald-100 text-emerald-800' : x.now === 'Submitted' ? 'bg-cyan-100 text-cyan-800' : 'bg-red-100 text-red-800'}`}>
                                      {x.now === 'Sent back' ? 'Not resubmitted yet' : x.now === 'Submitted' ? 'Resubmitted · awaiting PIC' : 'Resubmitted · approved'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
