/**
 * Model timeline: a small icon placed next to a model name. Clicking it opens a Gantt of the model's MRDs:
 * one row per trial (PP, MPP, Pilot, SOP …) with a bar for its run-up (from the previous trial) and a diamond on its
 * date, the trial's MRD sub-types (Weld, Jig …) as dots beneath it, and a red line for today.
 */
import { useMemo, useState } from 'react'
import { Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'
import { trialLabelOf } from '../trialLabel'

const DAY = 86_400_000
const num = (d: string) => Date.parse(`${d}T00:00:00Z`)
/** 'ActualQVDate' → 'Actual QV Date'. */
const words = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

/** The icon button; `className` adds spacing where it sits. */
export function ModelTimelineButton({ model, className = '' }: { model: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-model-timeline={model} aria-label={`Timeline of ${model}`} title={`${model}: MRD timeline`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded text-[var(--color-accent)] align-[-3px] hover:bg-[var(--color-secondary)] ${className}`}>
        {/* Gantt glyph: three offset bars */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h9M8 12h10M6 18h8" />
        </svg>
      </button>
      {open && <ModelTimeline model={model} onClose={() => setOpen(false)} />}
    </>
  )
}

interface Row { key: string; label: string; date: string; sub: boolean; from?: string }

function ModelTimeline({ model, onClose }: { model: string; onClose: () => void }) {
  const { models, milestones } = useQAStore()
  const rec = models.find((m) => m.name === model)
  const rows = useMemo<Row[]>(() => {
    const mrds = rec?.mrds ?? {}
    const out: Row[] = []
    const ms = milestones.filter((m) => mrds[m.id])
    ms.forEach((m, k) => {
      out.push({ key: m.id, label: trialLabelOf(m.id), date: mrds[m.id], sub: false, from: k > 0 ? mrds[ms[k - 1].id] : undefined })
      const subs = Object.entries(mrds)
        .filter(([key, d]) => d && key.startsWith(`${m.id}:`))
        .map(([key, d]) => ({ key, label: words(key.slice(m.id.length + 1)), date: d, sub: true }))
        .sort((a, b) => a.date.localeCompare(b.date))
      out.push(...subs)
    })
    // Dates that belong to no listed trial (e.g. an extra MRD type) still show, after the trials.
    const known = new Set(out.map((r) => r.key))
    for (const [key, d] of Object.entries(mrds)) {
      if (!d || known.has(key) || ms.some((m) => key.startsWith(`${m.id}:`))) continue
      out.push({ key, label: words(key), date: d, sub: true })
    }
    return out
  }, [rec, milestones])

  const range = useMemo(() => {
    const ds = rows.flatMap((r) => [r.date, r.from]).filter((d): d is string => !!d).concat(DEMO_TODAY)
    const lo = new Date(Math.min(...ds.map(num))), hi = new Date(Math.max(...ds.map(num)))
    const from = Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1)
    const to = Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 1, 1)
    return { from, to }
  }, [rows])
  const LEFT = 150
  const px = 6
  const width = Math.max(520, Math.round(((range.to - range.from) / DAY) * px))
  const x = (d: string) => Math.round(((num(d) - range.from) / DAY) * px)
  const months: { label: string; left: number }[] = []
  for (let d = new Date(range.from); d.getTime() < range.to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push({ label: d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), left: Math.round(((d.getTime() - range.from) / DAY) * px) })
  }
  const todayX = x(DEMO_TODAY)
  const next = rows.find((r) => !r.sub && r.date >= DEMO_TODAY)

  return (
    <Modal open onClose={onClose} size="lg" title={`${model} · MRD timeline`}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[var(--color-muted)]">No MRDs are set for {model} yet (Models &amp; MRDs).</p>
      ) : (
        <div data-model-timeline-chart>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[10.5px] text-[#475467]">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-indigo-600" />Trial MRD</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-5 rounded-sm bg-indigo-200" />Run-up from the previous trial</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500" />MRD sub-type</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-px bg-red-500" />Today {fmtDate(DEMO_TODAY)}</span>
            {next && <span className="ml-auto font-semibold text-[#344054]">Upcoming: {next.label} · {fmtDate(next.date)}</span>}
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--color-border)]">
            <div className="relative" style={{ width: LEFT + width }}>
              <div className="sticky top-0 z-20 flex border-b border-[var(--color-border)] bg-[var(--color-table-head)]">
                <div className="sticky left-0 z-30 flex-none border-r border-[var(--color-border)] bg-[var(--color-table-head)] px-3 py-1.5 text-[10.5px] font-medium text-[#344054]" style={{ width: LEFT }}>MRD</div>
                <div className="relative h-[28px]" style={{ width }}>
                  {months.map((m) => <div key={m.left} className="absolute top-0 border-l border-[#c9d6ee] px-1.5 pt-1.5 text-[10px] font-semibold text-[#344054]" style={{ left: m.left }}>{m.label}</div>)}
                </div>
              </div>
              {rows.map((r) => {
                const dx = x(r.date) + Math.round(px / 2)
                const bl = r.from ? x(r.from) + Math.round(px / 2) : null
                return (
                  <div key={r.key} className={`flex border-b border-[var(--color-border)] ${r.sub ? 'bg-white' : 'bg-[#f8f7ff]'}`} style={{ height: r.sub ? 26 : 32 }}>
                    <div className={`sticky left-0 z-10 flex flex-none items-center border-r border-[var(--color-border)] px-3 text-[11px] ${r.sub ? 'bg-white pl-6 text-[#475467]' : 'bg-[#f8f7ff] font-semibold text-[#101828]'}`} style={{ width: LEFT }}>
                      {r.label}
                    </div>
                    <div className="relative" style={{ width }} title={`${r.label}: ${fmtDate(r.date)}`}>
                      {months.map((m) => <div key={m.left} className="absolute inset-y-0 border-l border-[#eef2f7]" style={{ left: m.left }} />)}
                      {bl !== null && dx > bl && <div className="absolute rounded-sm bg-indigo-200" style={{ left: bl, width: dx - bl, top: 12, height: 8 }} />}
                      {r.sub
                        ? <div className="absolute h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white" style={{ left: dx - 5, top: 8 }} />
                        : <div className="absolute h-3 w-3 rotate-45 bg-indigo-600 ring-2 ring-white" style={{ left: dx - 6, top: 10 }} />}
                      <span className={`absolute whitespace-nowrap text-[10px] font-semibold ${r.sub ? 'text-sky-700' : 'text-indigo-700'}`} style={{ left: dx + 9, top: r.sub ? 6 : 9 }}>{fmtDate(r.date)}</span>
                    </div>
                  </div>
                )
              })}
              {todayX >= 0 && todayX <= width && <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500" style={{ left: LEFT + todayX }} aria-hidden="true" />}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
