/**
 * My Workspace → Calendar: the role's activities by planned end date, coloured by status, in a Week or Month view.
 * Clicking a day lists its activities with an Open form button (the week view also lists them in each day's column).
 * Activities still awaiting an MRD have no date and are left out.
 */
import { useMemo, useState } from 'react'
import { Button } from '../../components'
import { Icon as FbIcon } from '../../components/Icon'
import { workBucket, WORK_BUCKETS, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { DEMO_TODAY } from '../scope'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
/** Monday of the week containing `d`. */
const weekStart = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
const fmtShort = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
const WEEK_ITEMS = 6
type CalMode = 'week' | 'month'

export function CalendarTab({ instances, onOpen }: { instances: FilteredInstance[]; onOpen: (i: FilteredInstance) => void }) {
  const [mode, setMode] = useState<CalMode>('month')
  // The date the view is centred on: its month (Month view) or its week (Week view).
  const [anchor, setAnchor] = useState(DEMO_TODAY)
  const ym = { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 }
  const [day, setDay] = useState<string | null>(DEMO_TODAY)

  // Activities by planned end date.
  const byDay = useMemo(() => {
    const map = new Map<string, FilteredInstance[]>()
    for (const i of instances) {
      if (i.dates.status !== 'resolved') continue
      map.set(i.dates.end, [...(map.get(i.dates.end) ?? []), i])
    }
    return map
  }, [instances])
  const undated = instances.filter((i) => i.dates.status !== 'resolved').length

  const first = new Date(Date.UTC(ym.y, ym.m, 1))
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Monday-first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, k) => k + 1)]
  while (cells.length % 7) cells.push(null)
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const wk = weekStart(anchor)
  const weekDays = Array.from({ length: 7 }, (_, k) => addDays(wk, k))
  const weekLabel = `${fmtShort(weekDays[0], { day: 'numeric', month: 'short' })} – ${fmtShort(weekDays[6], { day: 'numeric', month: 'short', year: 'numeric' })}`
  const shift = (n: number) =>
    setAnchor((a) => {
      if (mode === 'week') return addDays(a, 7 * n)
      const d = new Date(Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1 + n, 1))
      return d.toISOString().slice(0, 10)
    })
  const inView = mode === 'week' ? (d: string) => d >= weekDays[0] && d <= weekDays[6] : (d: string) => d.startsWith(`${ym.y}-${pad(ym.m + 1)}`)
  const viewCount = [...byDay.entries()].filter(([d]) => inView(d)).reduce((n, [, xs]) => n + xs.length, 0)

  const dayItems = day ? byDay.get(day) ?? [] : []

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
      <section className="epmp-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label={mode === 'week' ? 'Previous week' : 'Previous month'} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">‹</button>
          <h3 className="m-0 min-w-[170px] text-center text-[13px] font-semibold text-[var(--color-text)]">{mode === 'week' ? weekLabel : monthLabel}</h3>
          <button type="button" onClick={() => shift(1)} aria-label={mode === 'week' ? 'Next week' : 'Next month'} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">›</button>
          <button type="button" onClick={() => { setAnchor(DEMO_TODAY); setDay(DEMO_TODAY) }}
            className="ml-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10.5px] font-semibold text-[#344054] hover:bg-[var(--color-surface)]">Today</button>
          <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">{viewCount} activit{viewCount === 1 ? 'y' : 'ies'} due this {mode}</span>
          <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="group" aria-label="Calendar view">
            {(['week', 'month'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); if (day) setAnchor(day) }} aria-pressed={mode === m}
                className={`rounded-md px-2.5 py-1 text-[10.5px] font-semibold ${mode === m ? 'bg-[var(--color-primary)] text-white' : 'text-[#344054] hover:bg-[var(--color-surface)]'}`}>
                {m === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>
        {mode === 'week' ? (
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((date) => {
              const items = byDay.get(date) ?? []
              const isToday = date === DEMO_TODAY
              const isSel = date === day
              return (
                <div key={date} className={`flex min-h-[340px] min-w-0 flex-col rounded-lg border ${isSel ? 'border-[var(--color-primary)] bg-secondary/40' : 'border-[var(--color-border)] bg-white'}`}>
                  <button type="button" onClick={() => setDay(date)} aria-label={`${date}: ${items.length} activities`}
                    className="flex items-center justify-between gap-1 border-b border-[var(--color-border)] px-2 py-1.5 text-left hover:bg-[var(--color-surface)]">
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">{fmtShort(date, { weekday: 'short' })}</span>
                    <span className={`text-[11.5px] font-semibold ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-white' : 'text-[#344054]'}`}>{Number(date.slice(8))}</span>
                  </button>
                  <div className="flex flex-col gap-1 p-1">
                    {items.slice(0, WEEK_ITEMS).map((i) => {
                      const b = workBucket(i)!
                      return (
                        <button key={`${i.row.id}-${i.part.partNo}`} type="button" onClick={() => onOpen(i)}
                          title={`${i.activity.name} · ${i.part.partNo} · ${i.part.model} · ${b}`}
                          className="rounded border-l-[3px] bg-[var(--color-surface)] px-1.5 py-1 text-left hover:brightness-95"
                          style={{ borderLeftColor: WORK_BUCKET_COLORS[b] }}>
                          <div className="truncate text-[10.5px] font-medium text-[var(--color-text)]">{i.activity.name}</div>
                          <div className="truncate text-[10px] text-[var(--color-muted)]"><span className="font-mono">{i.part.partNo}</span> · {i.part.model}</div>
                        </button>
                      )
                    })}
                    {items.length > WEEK_ITEMS && (
                      <button type="button" onClick={() => setDay(date)} className="px-1.5 py-0.5 text-left text-[10px] font-semibold text-[var(--color-accent)] hover:underline">
                        +{items.length - WEEK_ITEMS} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (<>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, k) => {
            if (d === null) return <div key={k} className="min-h-[72px]" />
            const date = iso(ym.y, ym.m, d)
            const items = byDay.get(date) ?? []
            const counts = WORK_BUCKETS.map((b) => [b, items.filter((i) => workBucket(i) === b).length] as const).filter(([, n]) => n > 0)
            const isToday = date === DEMO_TODAY
            const isSel = date === day
            return (
              <button key={k} type="button" onClick={() => setDay(date)} aria-label={`${date}: ${items.length} activities`}
                className={`flex min-h-[72px] flex-col items-stretch rounded-lg border p-1.5 text-left transition-colors ${isSel ? 'border-[var(--color-primary)] bg-secondary' : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]'}`}>
                <span className={`mb-1 text-[10.5px] font-semibold ${isToday ? 'inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-[var(--color-primary)] text-white' : 'text-[#344054]'}`}>{d}</span>
                <span className="flex flex-wrap gap-1">
                  {counts.map(([b, n]) => (
                    <span key={b} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: `${WORK_BUCKET_COLORS[b]}1a`, color: WORK_BUCKET_COLORS[b] }} title={`${n} ${b}`}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{n}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        </>)}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-muted)]">
          {WORK_BUCKETS.map((b) => (
            <span key={b} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}</span>
          ))}
          <span className="ml-auto">By planned end date{undated ? ` · ${undated} awaiting MRD (no date)` : ''}</span>
        </div>
      </section>

      <section className="epmp-card flex min-h-0 flex-col p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--color-text)]">
          <FbIcon name="calendar-month" size={14} />
          {day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Pick a day'}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-primary">{dayItems.length}</span>
        </h3>
        {dayItems.length === 0 ? (
          <p className="py-8 text-center text-[11.5px] text-[var(--color-muted)]">No activities due on this day.</p>
        ) : (
          <div className="max-h-[520px] divide-y divide-[var(--color-border)] overflow-y-auto">
            {dayItems.map((i) => {
              const b = workBucket(i)!
              return (
                <div key={`${i.row.id}-${i.part.partNo}`} className="flex items-center gap-3 py-2.5">
                  <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} title={b} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium text-[var(--color-text)]">{i.activity.name}</div>
                    <div className="truncate text-[10.5px] text-[var(--color-muted)]">
                      <span className="font-mono">{i.part.partNo}</span> · {i.part.model} · {i.row.milestoneId} · {b}
                    </div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => onOpen(i)}>Open form</Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
