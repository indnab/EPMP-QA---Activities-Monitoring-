/**
 * My Workspace → Calendar: the role's activities on a month grid by planned end date, coloured by status. Clicking a
 * day lists its activities with an Open form button. Activities still awaiting an MRD have no date and are left out.
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

export function CalendarTab({ instances, onOpen }: { instances: FilteredInstance[]; onOpen: (i: FilteredInstance) => void }) {
  const [ym, setYm] = useState(() => ({ y: Number(DEMO_TODAY.slice(0, 4)), m: Number(DEMO_TODAY.slice(5, 7)) - 1 }))
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
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })
  const monthCount = [...byDay.entries()].filter(([d]) => d.startsWith(`${ym.y}-${pad(ym.m + 1)}`)).reduce((n, [, xs]) => n + xs.length, 0)

  const dayItems = day ? byDay.get(day) ?? [] : []

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
      <section className="epmp-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">‹</button>
          <h3 className="m-0 min-w-[150px] text-center text-[14px] font-semibold text-[var(--color-text)]">{monthLabel}</h3>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">›</button>
          <button type="button" onClick={() => { setYm({ y: Number(DEMO_TODAY.slice(0, 4)), m: Number(DEMO_TODAY.slice(5, 7)) - 1 }); setDay(DEMO_TODAY) }}
            className="ml-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[#344054] hover:bg-[var(--color-surface)]">Today</button>
          <span className="ml-auto text-[11px] text-[var(--color-muted)]">{monthCount} activit{monthCount === 1 ? 'y' : 'ies'} due this month</span>
        </div>
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
                <span className={`mb-1 text-[11px] font-semibold ${isToday ? 'inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-[var(--color-primary)] text-white' : 'text-[#344054]'}`}>{d}</span>
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
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-muted)]">
          {WORK_BUCKETS.map((b) => (
            <span key={b} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}</span>
          ))}
          <span className="ml-auto">By planned end date{undated ? ` · ${undated} awaiting MRD (no date)` : ''}</span>
        </div>
      </section>

      <section className="epmp-card flex min-h-0 flex-col p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
          <FbIcon name="calendar-month" size={14} />
          {day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Pick a day'}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{dayItems.length}</span>
        </h3>
        {dayItems.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[var(--color-muted)]">No activities due on this day.</p>
        ) : (
          <div className="max-h-[520px] divide-y divide-[var(--color-border)] overflow-y-auto">
            {dayItems.map((i) => {
              const b = workBucket(i)!
              return (
                <div key={`${i.row.id}-${i.part.partNo}`} className="flex items-center gap-3 py-2.5">
                  <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} title={b} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-[var(--color-text)]">{i.activity.name}</div>
                    <div className="truncate text-[11px] text-[var(--color-muted)]">
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
