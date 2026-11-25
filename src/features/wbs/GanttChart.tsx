/**
 * Gantt chart of the WBS tree (Part → Milestone → Activity → Task): one row per node with its planned start → end as a bar on
 * a time axis. A milestone has one date and no start, so it shows as a diamond with a dashed vertical line through its rows. Part bars span their children (summary bars); activity bars are coloured by status.
 * Rows follow the WBS table's expand / collapse. Zoom: Week (days visible), Month or Quarter. A red line marks today.
 */
import { useMemo, useState } from 'react'
import { Card } from '../../components'
import { fmtDate } from '../scope'
import type { WbsNode } from './WbsPage'

type Zoom = 'week' | 'month' | 'quarter'
const PX_PER_DAY: Record<Zoom, number> = { week: 22, month: 6, quarter: 2.2 }
const LEFT_W = 400
const ROW_H = 30
const DAY = 86_400_000

const BAR: Record<string, { fill: string; text: string }> = {
  Completed: { fill: '#10b981', text: '#065f46' },
  Ongoing: { fill: '#3b82f6', text: '#1e3a8a' },
  Open: { fill: '#94a3b8', text: '#334155' },
}
const KIND_TAG: Record<WbsNode['kind'], string> = {
  part: 'bg-sky-100 text-sky-700',
  milestone: 'bg-indigo-100 text-indigo-700',
  activity: 'bg-slate-100 text-slate-600',
  task: 'bg-violet-100 text-violet-700',
}

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export function GanttChart({ rows, collapsed, onToggle, today }: {
  rows: WbsNode[]
  collapsed: Set<string>
  onToggle: (id: string) => void
  today: string
}) {
  const [zoom, setZoom] = useState<Zoom>('month')
  const px = PX_PER_DAY[zoom]

  // Time range: all planned dates (and today), padded to whole months.
  const range = useMemo(() => {
    const ds = rows.flatMap((n) => [n.start, n.end]).filter((d): d is string => !!d).concat(today)
    const min = new Date(Math.min(...ds.map(toMs)))
    const max = new Date(Math.max(...ds.map(toMs)))
    const from = Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1)
    const to = Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1)
    return { from, to, days: Math.round((to - from) / DAY) }
  }, [rows, today])
  const x = (d: string) => Math.round(((toMs(d) - range.from) / DAY) * px)
  const width = Math.max(600, Math.round(range.days * px))

  // Header ticks: months always; days (week zoom) or week starts (month zoom) underneath.
  const months = useMemo(() => {
    const out: { label: string; left: number; w: number }[] = []
    const d = new Date(range.from)
    while (d.getTime() < range.to) {
      const start = d.getTime()
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      out.push({
        label: d.toLocaleString('en-GB', { month: zoom === 'quarter' ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }),
        left: Math.round(((start - range.from) / DAY) * px), w: Math.round(((next - start) / DAY) * px),
      })
      d.setTime(next)
    }
    return out
  }, [range, px, zoom])
  const minor = useMemo(() => {
    if (zoom === 'quarter') return []
    const out: { label: string; left: number }[] = []
    for (let t = range.from; t < range.to; t += DAY) {
      const d = new Date(t)
      if (zoom === 'week' || d.getUTCDay() === 1) out.push({ label: String(d.getUTCDate()), left: Math.round(((t - range.from) / DAY) * px) })
    }
    return out
  }, [range, px, zoom])

  const todayX = x(today)
  const undated = rows.filter((n) => n.kind !== 'milestone' && (!n.start || !n.end)).length

  return (
    <Card flush>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5" role="group" aria-label="Zoom">
          {(['week', 'month', 'quarter'] as Zoom[]).map((z) => (
            <button key={z} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z}
              className={`rounded-md px-2.5 py-1 text-[10.5px] font-medium capitalize ${zoom === z ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{z}</button>
          ))}
        </div>
        <span className="flex items-center gap-3 text-[10.5px] text-[#475467]">
          {Object.entries(BAR).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: v.fill }} />{k}</span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-[#1e1b4b]" />Part (summary)</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-indigo-600" />Milestone date (one date)</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-[#3b82f6] ring-2 ring-[#2563eb] ring-offset-1" />Current task</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-px bg-red-500" />Today {fmtDate(today)}</span>
        </span>
        {undated > 0 && <span className="ml-auto text-[10px] text-[var(--color-muted)]">{undated} row{undated === 1 ? '' : 's'} without planned dates (awaiting MRD)</span>}
      </div>

      <div className="max-h-[calc(100vh-320px)] overflow-auto" role="grid" aria-label="Gantt chart">
        <div className="relative" style={{ width: LEFT_W + width }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-[var(--color-border)] bg-[#dce8fb]">
            <div className="sticky left-0 z-30 flex-none border-r border-[var(--color-border)] bg-[#dce8fb] px-3 py-2 text-[10.5px] font-medium text-[#344054]" style={{ width: LEFT_W }}>
              WBS · Part / Milestone / Activity / Task
            </div>
            <div className="relative" style={{ width, height: zoom === 'quarter' ? 26 : 40 }}>
              {months.map((m) => (
                <div key={m.left} className="absolute top-0 truncate border-l border-[#b8cdf0] px-1.5 pt-1 text-[10px] font-semibold text-[#344054]" style={{ left: m.left, width: m.w }}>{m.label}</div>
              ))}
              {minor.map((t) => (
                <div key={t.left} className="absolute bottom-0.5 text-[9px] tabular-nums text-[#475467]" style={{ left: t.left + 2 }}>{t.label}</div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {rows.map((n) => {
            const hasKids = !!n.children?.length
            const open = !collapsed.has(n.id)
            const summary = n.kind === 'part'
            const isTask = n.kind === 'task'
            const color = BAR[n.status] ?? BAR.Open
            const left = n.start ? x(n.start) : 0
            const isMs = n.kind === 'milestone'
            const barW = !isMs && n.start && n.end ? Math.max(summary ? 4 : 6, x(iso(toMs(n.end) + DAY)) - left) : 0
            const msX = n.msDate ? x(n.msDate) + Math.round(px / 2) : null
            return (
              <div key={n.id} role="row" className={`flex border-b border-[var(--color-border)] ${n.kind === 'part' ? 'bg-[#f5f7ff]' : n.kind === 'milestone' ? 'bg-[#f8f7ff]' : 'bg-white'}`} style={{ height: ROW_H }}>
                <div role="rowheader" className={`sticky left-0 z-10 flex flex-none items-center gap-1.5 border-r border-[var(--color-border)] px-2 ${n.kind === 'part' ? 'bg-[#f5f7ff]' : 'bg-white'}`} style={{ width: LEFT_W }}>
                  <span className="w-[84px] flex-none whitespace-nowrap font-mono text-[9.5px] text-[var(--color-muted)]">WBS-{n.id}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: n.depth * 12 }}>
                    {hasKids ? (
                      <button type="button" onClick={() => onToggle(n.id)} aria-label={`${open ? 'Collapse' : 'Expand'} ${n.label}`} aria-expanded={open}
                        className="flex h-4 w-4 flex-none items-center justify-center text-[var(--color-muted)]">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: open ? 'rotate(90deg)' : 'none' }}><path d="M3.5 2.5 6.5 5 3.5 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    ) : <span className="h-4 w-4 flex-none" />}
                    <span className={`flex-none rounded px-1 py-px text-[8.5px] font-medium capitalize ${KIND_TAG[n.kind]}`}>{n.kind}</span>
                    <span className={`truncate text-[11px] ${n.kind === 'part' ? 'font-semibold text-[#101828]' : 'text-[#344054]'}`} title={n.label}>{n.label}</span>
                  </span>
                </div>
                <div className="relative" style={{ width }}>
                  {/* Month grid lines */}
                  {months.map((m) => <div key={m.left} className="absolute inset-y-0 border-l border-[#eef2f7]" style={{ left: m.left }} />)}
                  {/* The milestone's date: a dashed vertical line through every row of its group */}
                  {msX !== null && !summary && <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-indigo-400" style={{ left: msX }} aria-hidden="true" />}
                  {isMs ? (
                    n.msDate ? (
                      <>
                        <div title={`${n.label}: ${fmtDate(n.msDate)} (milestone date)`} className="absolute h-3 w-3 rotate-45 bg-indigo-600 ring-2 ring-white" style={{ left: msX! - 6, top: ROW_H / 2 - 6 }} />
                        <span className="absolute whitespace-nowrap text-[10px] font-semibold text-indigo-700" style={{ left: msX! + 10, top: ROW_H / 2 - 7 }}>{fmtDate(n.msDate)}</span>
                      </>
                    ) : <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9.5px] italic text-[var(--color-muted)]">Milestone date not set</span>
                  ) : barW > 0 ? (
                    <div title={`${n.label}: ${fmtDate(n.start!)} → ${fmtDate(n.end!)} · ${n.status}${n.effort ? ` · ${n.effort} d` : ''}`}
                      className={`absolute flex items-center overflow-hidden whitespace-nowrap ${summary ? 'rounded-sm' : 'rounded-md'}`}
                      style={{
                        left, width: barW,
                        top: summary ? ROW_H / 2 - 4 : isTask ? 9 : 6, height: summary ? 8 : isTask ? ROW_H - 18 : ROW_H - 12,
                        background: summary ? '#1e1b4b' : color.fill,
                        opacity: summary ? 0.85 : 1,
                        boxShadow: n.current ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : undefined,
                      }}>
                      {!summary && barW > 70 && <span className="px-1.5 text-[9.5px] font-medium text-white">{isTask ? n.label : `${fmtDate(n.start!)} → ${fmtDate(n.end!)}`}</span>}
                    </div>
                  ) : (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9.5px] italic text-[var(--color-muted)]">No planned dates</span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Today line */}
          {todayX >= 0 && todayX <= width && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500" style={{ left: LEFT_W + todayX }} aria-hidden="true" />
          )}
        </div>
      </div>
    </Card>
  )
}
