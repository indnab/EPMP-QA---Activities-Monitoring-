/**
 * My Work → Overview, top right: two expandable panels, "MRDs planned" and "Activities planned", each with date-range
 * tags (Next 7 / 30 / 90 days, All). One opens at a time, below the page header.
 */
import { useMemo, useState } from 'react'
import { Button } from '../../components'
import { Icon as FbIcon } from '../../components/Icon'
import type { PartRecord } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { plannedDateFields } from '../../domain/wbsTree'
import { pendencyOf, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'

export type UpcomingPanel = 'mrds' | 'activities' | null

const RANGES = [
  { id: '7', label: 'Next 7 days', days: 7 },
  { id: '30', label: 'Next 30 days', days: 30 },
  { id: '90', label: 'Next 90 days', days: 90 },
  { id: 'all', label: 'All', days: null },
] as const
type RangeId = (typeof RANGES)[number]['id']

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const inRange = (date: string, range: RangeId) => {
  const r = RANGES.find((x) => x.id === range)!
  return r.days === null ? true : date >= DEMO_TODAY && date <= addDays(DEMO_TODAY, r.days)
}
const daysFrom = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DEMO_TODAY}T00:00:00Z`)) / 86400000)
const relLabel = (date: string) => {
  const d = daysFrom(date)
  return d === 0 ? 'Today' : d > 0 ? `in ${d} d` : `${-d} d ago`
}

/** The two toggle buttons (top right of the Overview). */
export function UpcomingButtons({ open, onToggle, mrdCount, activityCount }: { open: UpcomingPanel; onToggle: (p: Exclude<UpcomingPanel, null>) => void; mrdCount: number; activityCount: number }) {
  const btn = (id: Exclude<UpcomingPanel, null>, label: string, n: number) => (
    <button type="button" onClick={() => onToggle(id)} aria-expanded={open === id}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold ${open === id ? 'border-[var(--color-primary)] bg-[var(--color-secondary)] text-[var(--color-primary)]' : 'border-[var(--color-border)] bg-white text-[#344054] hover:bg-[var(--color-surface)]'}`}>
      <FbIcon name="calendar-month" size={13} />
      {label}
      <span className="rounded-full bg-[var(--color-surface)] px-1.5 text-[10px] text-[var(--color-muted)]">{n}</span>
      <FbIcon name={open === id ? 'chevron-up' : 'chevron-down'} size={12} />
    </button>
  )
  return (
    <div className="flex items-center gap-1.5" data-export-ignore="true">
      {btn('mrds', 'MRDs planned', mrdCount)}
      {btn('activities', 'Activities planned', activityCount)}
    </div>
  )
}

interface MrdRow { key: string; date: string; model: string; milestone: string; label: string }

/** Planned MRD dates of the role's models (their project's archetype decides which dates exist). */
export function useMrdRows(parts: PartRecord[]): MrdRow[] {
  const { models, projects, archetypes } = useQAStore()
  return useMemo(() => {
    const out: MrdRow[] = []
    for (const name of new Set(parts.map((p) => p.model))) {
      const m = models.find((x) => x.name === name)
      if (!m) continue
      const arc = archetypes.find((a) => a.id === projectOfModel(name, projects)?.archetypeId)
      for (const f of plannedDateFields(arc)) {
        const date = m.mrds[f.key]
        if (date) out.push({ key: `${name}|${f.key}`, date, model: name, milestone: f.milestoneName, label: f.label })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model))
  }, [parts, models, projects, archetypes])
}

/** Counts for the buttons (next 30 days). */
export function upcomingCounts(mrds: MrdRow[], instances: FilteredInstance[]) {
  return {
    mrds: mrds.filter((r) => inRange(r.date, '30')).length,
    activities: instances.filter((i) => i.dates.status === 'resolved' && inRange(i.dates.end, '30')).length,
  }
}

function RangeTags({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r.id} type="button" onClick={() => onChange(r.id)} aria-pressed={value === r.id}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${value === r.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-border)] bg-white text-[#344054] hover:bg-[var(--color-surface)]'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}

/** The open panel's contents. */
export function UpcomingPanelBody({ panel, mrds, instances, onOpen, onClose }: {
  panel: Exclude<UpcomingPanel, null>
  mrds: MrdRow[]
  instances: FilteredInstance[]
  onOpen: (i: FilteredInstance) => void
  onClose: () => void
}) {
  const [range, setRange] = useState<RangeId>('30')
  const { picAssignments, partReleases, partAcks } = useQAStore()
  const mrdRows = mrds.filter((r) => inRange(r.date, range))
  const actRows = useMemo(
    () => instances
      .filter((i) => i.dates.status === 'resolved' && inRange(i.dates.end, range))
      .sort((a, b) => (a.dates.status === 'resolved' && b.dates.status === 'resolved' ? a.dates.end.localeCompare(b.dates.end) : 0)),
    [instances, range]
  )
  const th = 'px-3 py-2 text-left text-[11px] font-medium text-[#344054] whitespace-nowrap'
  const td = 'px-3 py-2 text-[12px]'
  return (
    <section className="epmp-card mb-3 p-4" aria-label={panel === 'mrds' ? 'MRDs planned' : 'Activities planned'}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="m-0 text-[13px] font-semibold text-[var(--color-text)]">{panel === 'mrds' ? 'MRDs planned' : 'Activities planned'}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{panel === 'mrds' ? mrdRows.length : actRows.length}</span>
        <RangeTags value={range} onChange={setRange} />
        <button type="button" onClick={onClose} aria-label="Close panel" className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)]">
          <FbIcon name="close" size={14} />
        </button>
      </div>
      <div className="max-h-[320px] overflow-auto rounded-lg border border-[var(--color-border)]">
        {panel === 'mrds' ? (
          mrdRows.length === 0 ? <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">No MRDs in this range.</p> : (
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--color-surface)]"><tr><th className={th}>Date</th><th className={th}>Model</th><th className={th}>Milestone</th><th className={th}>Planned date</th></tr></thead>
              <tbody>
                {mrdRows.map((r) => (
                  <tr key={r.key} className="border-t border-[var(--color-border)]">
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(r.date)} <span className="text-[10.5px] text-[var(--color-muted)]">· {relLabel(r.date)}</span></td>
                    <td className={`${td} font-medium text-[#101828]`}>{r.model}</td>
                    <td className={td}><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">{r.milestone}</span></td>
                    <td className={td}>{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : actRows.length === 0 ? <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">No activities planned in this range.</p> : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--color-surface)]"><tr><th className={th}>Planned end</th><th className={th}>Activity</th><th className={th}>Part</th><th className={th}>Model</th><th className={th}>Status</th><th className={th}>Pending with</th><th className={th} /></tr></thead>
            <tbody>
              {actRows.map((i) => {
                const b = workBucket(i)!
                const pend = pendencyOf(i, { picAssignments, releases: partReleases, acks: partAcks, today: DEMO_TODAY })
                const end = i.dates.status === 'resolved' ? i.dates.end : ''
                return (
                  <tr key={`${i.row.id}|${i.part.partNo}`} className="border-t border-[var(--color-border)]">
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(end)} <span className="text-[10.5px] text-[var(--color-muted)]">· {relLabel(end)}</span></td>
                    <td className={`${td} text-[#101828]`}>{i.activity.name} <span className="rounded bg-secondary px-1 py-0.5 text-[9.5px] font-semibold text-primary">{i.row.milestoneId}</span></td>
                    <td className={`${td} whitespace-nowrap font-mono text-[11px]`}>{i.part.partNo}</td>
                    <td className={td}>{i.part.model}</td>
                    <td className={td}><span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium" style={{ color: WORK_BUCKET_COLORS[b] }}><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{pend ? pend.name : '—'}</td>
                    <td className={`${td} text-right`}><Button variant="primary" size="sm" onClick={() => onOpen(i)}>Open form</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
