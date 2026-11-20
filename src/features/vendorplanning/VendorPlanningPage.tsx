/**
 * Vendor Planning. The vendor picks parts (theirs, released and acknowledged); every activity the vendor works on for
 * those parts is listed with the system's MRD reference date and the Planned Window calculated from it (the section
 * template / timeline offsets). Against each, the vendor enters a planned date and submits the plan (one or many).
 * A date after the window's end is flagged (and needs a remark); earlier submissions are kept. PIC / SIC / Admin see
 * the same plan and may enter it on the vendor's behalf.
 */
import { useMemo, useState } from 'react'
import { Button, PageHeader } from '../../components'
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

const key = (i: FilteredInstance) => `${i.row.id}|${i.part.partNo}`
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function VendorPlanningPage() {
  const { entries, activities, templateRows, models, milestones, partReleases, partAcks, submitVendorPlan } = useQAStore()
  const workParts = useWorkParts()
  const { currentPersona: role } = usePersonaStore()
  const isVendor = role === 'Vendor'
  const canEdit = ['Vendor', 'PIC', 'SIC', 'Admin'].includes(role)

  // Parts in scope: the vendor sees only parts released to it and acknowledged.
  const scoped = useMemo(
    () => workParts.filter((p) => !p.supersededBy && partInScope(p, role) && (!isVendor || isWorkableByVendor(p.partNo, partReleases, partAcks))),
    [workParts, role, isVendor, partReleases, partAcks]
  )
  const [fParts, setFParts] = useState<string[]>([])
  const [fModels, setFModels] = useState<string[]>([])
  const [trial, setTrial] = useState('All')
  const [show, setShow] = useState<'all' | 'unplanned' | 'late'>('all')
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
      .filter((i) => !i.notApplicable && i.activity.flow.steps[0]?.role === 'Vendor')
      .map((i) => {
        const win = resolveInstanceDates(i.row, i.model, i.activity, i.part)
        return { i, mrd: getMilestoneMrd(i.model, i.row.milestoneId), win: win.status === 'resolved' ? win : null, plan: i.entry?.vendorPlan }
      })
      .sort((a, b) => a.i.part.partNo.localeCompare(b.i.part.partNo) || msOrder(a.i.row.milestoneId) - msOrder(b.i.row.milestoneId) || (a.win?.end ?? '').localeCompare(b.win?.end ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activities, scoped, templateRows, models, chosen.join(), milestones])
  const trialOptions = [...new Set(rows.map((r) => r.i.row.milestoneId))].sort((a, b) => msOrder(a) - msOrder(b))

  // Edits not yet submitted: date and remark per row.
  const [edit, setEdit] = useState<Record<string, { date?: string; remark?: string }>>({})
  const dateOf = (r: (typeof rows)[number]) => edit[key(r.i)]?.date ?? r.plan?.current.date ?? ''
  const remarkOf = (r: (typeof rows)[number]) => edit[key(r.i)]?.remark ?? r.plan?.current.remark ?? ''
  const lateBy = (r: (typeof rows)[number]) => { const d = dateOf(r); return d && r.win ? days(r.win.end, d) : 0 }
  const shown = rows.filter((r) =>
    (trial === 'All' || r.i.row.milestoneId === trial) &&
    (show === 'all' || (show === 'unplanned' ? !dateOf(r) : lateBy(r) > 0)))
  const dirty = rows.filter((r) => {
    const e = edit[key(r.i)]
    return e && ((e.date !== undefined && e.date !== (r.plan?.current.date ?? '')) || (e.remark !== undefined && e.remark !== (r.plan?.current.remark ?? '')))
  })
  const needsRemark = dirty.filter((r) => lateBy(r) > 0 && !remarkOf(r).trim())
  const counts = {
    total: rows.length,
    planned: rows.filter((r) => r.plan).length,
    late: rows.filter((r) => lateBy(r) > 0).length,
  }
  const set = (k: string, p: { date?: string; remark?: string }) => setEdit((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }))
  const fillWindowEnd = () => {
    const next = { ...edit }
    for (const r of shown) if (!dateOf(r) && r.win) next[key(r.i)] = { ...next[key(r.i)], date: r.win.end }
    setEdit(next)
  }
  const submit = () => {
    if (needsRemark.length) { toast(`Add a remark for the ${needsRemark.length} date${needsRemark.length === 1 ? '' : 's'} after the planned window.`); return }
    const n = submitVendorPlan({
      items: dirty.map((r) => ({ templateRowId: r.i.row.id, partNo: r.i.part.partNo, date: dateOf(r), remark: remarkOf(r) })),
      by: role, actorName: isVendor ? FIXED_VENDOR_NAME : undefined,
    })
    setEdit({})
    toast(n ? `Plan submitted: ${n} planned date${n === 1 ? '' : 's'}.` : 'Nothing changed.')
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
              {([['all', 'All'], ['unplanned', 'Not planned'], ['late', 'After window']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setShow(id)} aria-pressed={show === id}
                  className={`rounded-md px-2.5 py-1 text-[10.5px] font-medium ${show === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{label}</button>
              ))}
            </div>
          </>
        )}
        <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{chosen.length} part{chosen.length === 1 ? '' : 's'} selected{isVendor ? ` · ${scoped.length} released to you` : ''}</span>
      </section>

      {chosen.length === 0 ? (
        <div className="epmp-card px-6 py-12 text-center text-[12px] text-[var(--color-muted)]">
          Select one or more <strong>parts</strong> to list their activities with the planned window calculated from the MRD, then enter your planned date against each.
          {isVendor && scoped.length === 0 && <div className="mt-2">No parts are released to you and acknowledged yet (My Parts).</div>}
        </div>
      ) : (
        <section className="epmp-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[var(--color-text)]">Planning · {shown.length} activit{shown.length === 1 ? 'y' : 'ies'}</span>
            <span className="text-[10.5px] text-[var(--color-muted)]">{counts.planned} of {counts.total} planned{counts.late ? ` · ${counts.late} after the window` : ''}</span>
            {canEdit && (
              <span className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={fillWindowEnd} title="Fill the empty dates with the end of the planned window">Use window end for blanks</Button>
                {dirty.length > 0 && <button type="button" onClick={() => setEdit({})} className="text-[10.5px] font-semibold text-[var(--color-muted)] hover:underline">Discard</button>}
                <Button variant="primary" size="sm" disabled={dirty.length === 0} onClick={submit}><Icon name="check" size={13} className="mr-1" />Submit plan ({dirty.length})</Button>
              </span>
            )}
          </div>
          <div className="max-h-[calc(100vh-290px)] overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-3 py-2">Part</th>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Trial</th>
                  <th className="px-3 py-2">MRD reference</th>
                  <th className="px-3 py-2">Planned window (system)</th>
                  <th className="px-3 py-2">My planned date</th>
                  <th className="px-3 py-2">Remark</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const k = key(r.i)
                  const d = dateOf(r)
                  const late = lateBy(r)
                  const changed = dirty.includes(r)
                  return (
                    <tr key={k} className={`border-t border-[var(--color-border)] ${changed ? 'bg-[#fffbeb]' : ''}`}>
                      <td className="px-3 py-2"><span className="font-mono">{r.i.part.partNo}</span><div className="text-[10px] text-[var(--color-muted)]">{r.i.part.partName} · {r.i.part.model}</div></td>
                      <td className="px-3 py-2">{r.i.activity.name}</td>
                      <td className="px-3 py-2"><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">{trialLabelOf(r.i.row.milestoneId)}</span></td>
                      <td className="whitespace-nowrap px-3 py-2">{r.mrd ? fmtDate(r.mrd) : <span className="text-[var(--color-muted)]">Awaiting MRD</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.win ? <>{fmtDate(r.win.start)} → <strong>{fmtDate(r.win.end)}</strong></> : <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td className="px-3 py-2">
                        <input type="date" value={d} disabled={!canEdit} aria-label={`Planned date for ${r.i.activity.name} on ${r.i.part.partNo}`}
                          onChange={(e) => set(k, { date: e.target.value })}
                          className={`h-8 rounded-lg border px-2 text-[11px] ${late > 0 ? 'border-amber-300 bg-amber-50' : 'border-[var(--color-border)] bg-white'}`} />
                        {r.plan && r.plan.history.length > 0 && (
                          <div className="mt-0.5 text-[9.5px] text-[var(--color-muted)]" title={r.plan.history.map((h) => `${fmtDate(h.date)} by ${h.by}`).join('\n')}>
                            was <span className="line-through">{fmtDate(r.plan.history.at(-1)!.date)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input value={remarkOf(r)} disabled={!canEdit} onChange={(e) => set(k, { remark: e.target.value })}
                          placeholder={late > 0 ? 'Why after the window? (required)' : 'Optional'} aria-label="Remark"
                          className={`h-8 w-full min-w-[160px] rounded-lg border px-2 text-[11px] ${late > 0 && !remarkOf(r).trim() ? 'border-red-300' : 'border-[var(--color-border)]'}`} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[10.5px]">
                        {!d ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">Not planned</span>
                          : late > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{late} d after window</span>
                            : <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Within window</span>}
                        {changed ? <div className="mt-0.5 text-[9.5px] text-amber-700">Not submitted</div>
                          : r.plan ? <div className="mt-0.5 text-[9.5px] text-[var(--color-muted)]">Submitted {fmtDate(r.plan.current.at.slice(0, 10))} · {r.plan.current.by}</div> : null}
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">No vendor activities here.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted)]">
            Planned window = the system dates from the MRD reference and the activity's offsets. Your planned date is your commitment; a date after the window needs a remark. Vendor: {chosen.length ? [...new Set(rows.map((r) => vendorLabel(r.i.part.vendorName, r.i.part.vendorCode)))].join(', ') : '—'}.
          </p>
        </section>
      )}
    </div>
  )
}

