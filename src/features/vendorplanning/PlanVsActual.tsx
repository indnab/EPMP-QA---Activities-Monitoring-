/**
 * Vendor Planning → "MSIL timeline" view. At the top, every MSIL timeline (the trial MRDs PP, MPP, Pilot, SOP and their
 * MRD sub-types) sits on one straight line per model, with dashed guides running down through the activities. Under it,
 * each vendor activity shows, on one line, its planned dates as a box (the vendor's plan, else the system window) and
 * what actually happened as a strip through it: from the first work recorded on it to its approval, or to today while it is still open.
 */
import { Fragment, useMemo, useState } from 'react'
import type { ActivityEntry } from '../../domain'
import { DEMO_TODAY, fmtDate } from '../scope'
import { trialLabelOf } from '../trialLabel'

export interface PvaRow {
  k: string
  part: { partNo: string; partName: string; model: string }
  activity: string
  milestoneId: string
  /** Planned: the vendor's plan (start → end), else the system window. */
  plan: { start: string; end: string; source: 'vendor' | 'window' } | null
  entry: ActivityEntry | undefined
}
export interface PvaModel { name: string; mrds: Record<string, string> }

const DAY = 86_400_000
const num = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const words = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
/** History lines about planning, not about doing the work. */
const PLAN_LINE = /planned date|own data|follows main part|draft entry initialized/i

/** What actually happened on an activity, from its entry: started (first work recorded) → done (approved) / open. */
export function actualOf(e: ActivityEntry | undefined, plannedStart?: string): { start: string; end: string; done: boolean; startKnown: boolean } | null {
  if (!e || e.feedOnly) return null
  const work = e.history.filter((h) => !PLAN_LINE.test(h.action)).map((h) => h.timestamp.slice(0, 10)).sort()
  const hasWork = work.length > 0 || Object.keys(e.values ?? {}).length > 0 || e.validationState !== 'Draft'
  if (!hasWork) return null
  const done = e.validationState === 'Approved'
  const approvedAt = done ? [...e.history].reverse().find((h) => /^approved/i.test(h.action))?.timestamp.slice(0, 10) ?? e.updatedAt?.slice(0, 10) : undefined
  const end = done ? approvedAt ?? DEMO_TODAY : DEMO_TODAY
  // The first work recorded; when the history holds only the finish, the bar starts at the planned start.
  const firstWork = work.find((d) => !done || d < (approvedAt ?? '9999'))
  const start = firstWork ?? plannedStart ?? end
  return { start: start > end ? end : start, end, done, startKnown: !!firstWork }
}

export function PlanVsActual({ rows, models, msOrder }: { rows: PvaRow[]; models: PvaModel[]; msOrder: (id: string) => number }) {
  const [zoom, setZoom] = useState<'week' | 'month'>('month')
  const px = zoom === 'week' ? 16 : 5
  const LEFT = 300

  // One straight line of MSIL dates per model: the trial MRDs and their sub-types.
  const lanes = useMemo(() => models.map((m) => {
    const marks = Object.entries(m.mrds).filter(([, d]) => !!d).map(([key, d]) => {
      const [ms, sub] = key.split(':')
      // A trial is a known milestone's own date; any other key (a sub-type, or an older MRD type such as 'Engine') is a dot.
      const trial = !sub && msOrder(ms) < 99
      return { key, date: d, trial, label: sub ? `${trialLabelOf(ms)} ${words(sub)}` : trial ? trialLabelOf(ms) : `${words(ms)} MRD`, ms }
    }).sort((a, b) => a.date.localeCompare(b.date) || msOrder(a.ms) - msOrder(b.ms))
    return { name: m.name, marks }
  }), [models, msOrder])

  const items = useMemo(() => rows.map((r) => ({ ...r, act: actualOf(r.entry, r.plan?.start) })), [rows])

  const range = useMemo(() => {
    const ds = [
      ...items.flatMap((r) => [r.plan?.start, r.plan?.end, r.act?.start, r.act?.end]),
      ...lanes.flatMap((l) => l.marks.map((m) => m.date)),
      DEMO_TODAY,
    ].filter((d): d is string => !!d)
    const lo = new Date(Math.min(...ds.map(num))), hi = new Date(Math.max(...ds.map(num)))
    return { from: Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1), to: Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 1, 1) }
  }, [items, lanes])
  const x = (d: string) => Math.round(((num(d) - range.from) / DAY) * px)
  const w = (a: string, b: string) => Math.max(4, x(iso(num(b) + DAY)) - x(a))
  const width = Math.max(600, Math.round(((range.to - range.from) / DAY) * px))
  const months: { label: string; left: number }[] = []
  for (let d = new Date(range.from); d.getTime() < range.to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push({ label: d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), left: Math.round(((d.getTime() - range.from) / DAY) * px) })
  }
  const todayX = x(DEMO_TODAY)
  // Trial MRDs of all lanes: dashed guides through the activity rows.
  const guides = [...new Map(lanes.flatMap((l) => l.marks.filter((m) => m.trial).map((m) => [`${m.date}|${m.label}`, m] as const))).values()]

  const counts = {
    done: items.filter((r) => r.act?.done).length,
    late: items.filter((r) => r.act && r.plan && r.act.end > r.plan.end).length,
    notStarted: items.filter((r) => !r.act).length,
  }

  return (
    <div data-pva>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-2 text-[10.5px] text-[#475467]">
        <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="Zoom">
          {(['week', 'month'] as const).map((z) => (
            <button key={z} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${zoom === z ? 'bg-white text-[#101828] shadow-sm' : ''}`}>{z}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-indigo-600" />Trial MRD</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500" />MRD sub-type</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3.5 w-7 rounded border border-blue-400 bg-blue-100" />Planned (box)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3.5 w-7 rounded border border-dashed border-blue-400 bg-blue-50" />Planned · system window (no vendor plan)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-7 rounded-full bg-emerald-500" />Actual strip · done</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-7 rounded-full bg-amber-400" />Actual · open</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-7 rounded-full bg-red-500" />Actual past the plan</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-px bg-red-500" />Today</span>
        <span className="ml-auto text-[var(--color-muted)]">{items.length} activities · {counts.done} done · {counts.late} past the plan · {counts.notStarted} not started</span>
      </div>
      <div className="max-h-[calc(100vh-330px)] overflow-auto" role="grid" aria-label="MSIL timeline and vendor activities">
        <div className="relative" style={{ width: LEFT + width }}>
          {/* Months */}
          <div className="sticky top-0 z-30 flex border-b border-[var(--color-border)] bg-[var(--color-table-head)]">
            <div className="sticky left-0 z-40 flex-none border-r border-[var(--color-border)] bg-[var(--color-table-head)] px-3 py-1.5 text-[10.5px] font-medium text-[#344054]" style={{ width: LEFT }}>MSIL timeline · Vendor activity</div>
            <div className="relative h-[28px]" style={{ width }}>
              {months.map((m) => <div key={m.left} className="absolute top-0 border-l border-[#c9d6ee] px-1.5 pt-1.5 text-[10px] font-semibold text-[#344054]" style={{ left: m.left }}>{m.label}</div>)}
            </div>
          </div>
          {/* MSIL timeline: one straight line per model, sticky under the months */}
          <div className="sticky top-[29px] z-20 border-b-2 border-indigo-200 bg-[#f8f7ff]" data-msil-lanes>
            {lanes.map((l) => (
              <div key={l.name} role="row" className="flex" style={{ height: 46 }}>
                <div className="sticky left-0 z-10 flex flex-none flex-col justify-center border-r border-[var(--color-border)] bg-[#f8f7ff] px-3" style={{ width: LEFT }}>
                  <span className="text-[11.5px] font-semibold text-[#101828]">{l.name}</span>
                  <span className="text-[9.5px] text-[var(--color-muted)]">MSIL timeline · {l.marks.filter((m) => m.trial).length} trials, {l.marks.filter((m) => !m.trial).length} MRD sub-types</span>
                </div>
                <div className="relative" style={{ width }}>
                  {/* the line */}
                  <div className="absolute left-0 right-0 h-[3px] rounded bg-indigo-300" style={{ top: 21 }} />
                  {l.marks.map((m, n) => {
                    const mx = x(m.date) + Math.round(px / 2)
                    return m.trial ? (
                      <Fragment key={m.key}>
                        <div title={`${l.name} · ${m.label}: ${fmtDate(m.date)}`} className="absolute h-3.5 w-3.5 rotate-45 bg-indigo-600 ring-2 ring-white" style={{ left: mx - 7, top: 16 }} data-msil-trial={m.label} />
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-indigo-800" style={{ left: mx, top: 1 }}>{m.label}</span>
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-[9px] text-indigo-700" style={{ left: mx, top: 32 }}>{fmtDate(m.date).replace(/ \d{4}$/, '')}</span>
                      </Fragment>
                    ) : (
                      <div key={m.key} title={`${l.name} · ${m.label}: ${fmtDate(m.date)}`} className="absolute h-2 w-2 rounded-full bg-sky-500 ring-1 ring-white" style={{ left: mx - 4, top: 19 + (n % 2 ? 0 : 0) }} data-msil-sub={m.label} />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Vendor activities: planned vs actual */}
          {items.map((r, n) => {
            const newPart = n === 0 || items[n - 1].part.partNo !== r.part.partNo
            const late = !!(r.act && r.plan && r.act.end > r.plan.end)
            const actCls = !r.act ? '' : late ? 'bg-red-500' : r.act.done ? 'bg-emerald-500' : 'bg-amber-400'
            const tip = [
              `${r.activity} (${trialLabelOf(r.milestoneId)})`,
              r.plan ? `Planned ${fmtDate(r.plan.start)} → ${fmtDate(r.plan.end)}${r.plan.source === 'window' ? ' (system window, no vendor plan)' : ''}` : 'Not planned',
              r.act ? `Actual ${r.act.startKnown ? fmtDate(r.act.start) : `${fmtDate(r.act.start)} (start not recorded, from the planned start)`} → ${r.act.done ? `${fmtDate(r.act.end)} (done)` : 'today (open)'}${late ? ' · past the planned end' : ''}` : 'Not started',
            ].join('\n')
            return (
              <Fragment key={r.k}>
                {newPart && (
                  <div className="flex border-b border-[var(--color-border)] bg-[#f5f7ff]" style={{ height: 26 }}>
                    <div className="sticky left-0 z-10 flex flex-none items-center gap-2 border-r border-[var(--color-border)] bg-[#f5f7ff] px-3" style={{ width: LEFT }}>
                      <span className="font-mono text-[11px] font-semibold text-[#101828]">{r.part.partNo}</span>
                      <span className="truncate text-[10px] text-[#475467]">{r.part.partName} · {r.part.model}</span>
                    </div>
                    <div className="relative" style={{ width }} />
                  </div>
                )}
                <div role="row" className="flex border-b border-[var(--color-border)] bg-white" style={{ height: 34 }} data-pva-row>
                  <div role="rowheader" className="sticky left-0 z-10 flex flex-none items-center gap-1.5 border-r border-[var(--color-border)] bg-white px-3" style={{ width: LEFT }}>
                    <span className="rounded bg-secondary px-1 py-px text-[9px] font-semibold text-primary">{trialLabelOf(r.milestoneId)}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[#344054]" title={r.activity}>{r.activity}</span>
                  </div>
                  <div className="relative" style={{ width }} title={tip}>
                    {months.map((m) => <div key={m.left} className="absolute inset-y-0 border-l border-[#eef2f7]" style={{ left: m.left }} />)}
                    {guides.map((g) => <div key={`${g.date}|${g.label}`} className="absolute inset-y-0 border-l border-dashed border-indigo-300" style={{ left: x(g.date) + Math.round(px / 2) }} />)}
                    {/* One line: the planned dates as a box (band), the actual as a strip through it. */}
                    {r.plan ? (
                      <div className={`absolute rounded-md border ${r.plan.source === 'vendor' ? 'border-blue-400 bg-blue-100' : 'border-dashed border-blue-400 bg-blue-50/70'}`}
                        style={{ left: x(r.plan.start), width: w(r.plan.start, r.plan.end), top: 5, height: 24 }} data-pva-plan />
                    ) : null}
                    {r.act ? (
                      <div className={`absolute rounded-full shadow-sm ring-1 ring-white ${actCls}`} style={{ left: x(r.act.start), width: w(r.act.start, r.act.end), top: 14, height: 6 }} data-pva-actual={r.act.done ? 'done' : 'open'} />
                    ) : null}
                    {!r.plan && !r.act && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9.5px] italic text-[var(--color-muted)]">Not planned · not started</span>}
                    {r.plan && !r.act && <span className="absolute whitespace-nowrap text-[9.5px] italic text-[var(--color-muted)]" style={{ left: x(r.plan.start) + w(r.plan.start, r.plan.end) + 6, top: 10 }}>not started</span>}
                  </div>
                </div>
              </Fragment>
            )
          })}
          {items.length === 0 && <p className="px-4 py-10 text-center text-[11.5px] text-[var(--color-muted)]">No vendor activities here.</p>}
          {todayX >= 0 && todayX <= width && <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: LEFT + todayX }} aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}
