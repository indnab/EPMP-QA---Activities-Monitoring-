/**
 * Workspace → My Screen: a blank canvas with the My Work tiles as buttons along the top. Clicking a tile adds a
 * dashboard panel for it: a summary (activities, parts, models, vendors) and a breakdown, by Model first. Clicking a
 * bar drills one level down (Model → Trial → Vendor → Part → Activity list); the breadcrumb goes back up, and the
 * "Group by" picks another breakdown at any level. In the activity list a row opens the activity form.
 * The panels (and where each is drilled to) are remembered in this browser. The page filters apply.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon as FbIcon } from '../../components/Icon'
import { pendencyOf, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'
import { trialLabelOf } from '../trialLabel'
import { mineBucket, useModelStages } from './OverviewTab'
import type { PartRecord } from '../../domain'
import type { MineKey } from './OverviewTab'

type Dim = 'model' | 'trial' | 'vendor' | 'part' | 'activity' | 'status' | 'dept'
const DIM_LABEL: Record<Dim, string> = { model: 'Model', trial: 'Trial', vendor: 'Vendor', part: 'Part', activity: 'Activity', status: 'Status', dept: 'Department' }
/** Default drill path. */
const PATH: Dim[] = ['model', 'trial', 'vendor', 'part']

type Ctx = { mine: MineKey | null; bucket: WorkBucket | null; stage: 'under' | 'developed' | 'past' | undefined }
interface TileDef {
  id: string; group: string; title: string; color: string; icon: string
  test: (i: FilteredInstance, ctx: Ctx) => boolean
  /** What the count on the button counts (default: activities). */
  counts?: 'models' | 'vendors' | 'parts'
  /** Opens already drilled to this (e.g. one model). */
  drill?: { dim: Dim; value: string }[]
  /** First breakdown (default: the drill path). */
  groupBy?: Dim
}
const UNDER = 'Scope · Under Development'
const DEV = 'Scope · Developed (< SOP + 3 months)'
const scopeTiles = (group: string, stage: 'under' | 'developed', color: string, withVendors: boolean): TileDef[] => [
  { id: `${stage}.models`, group, title: 'Unique models', color, icon: 'grid', counts: 'models', groupBy: 'model', test: (_i, c) => c.stage === stage },
  ...(withVendors ? [{ id: `${stage}.vendors`, group, title: 'Unique vendors', color, icon: 'users', counts: 'vendors' as const, groupBy: 'vendor' as Dim, test: (_i: FilteredInstance, c: Ctx) => c.stage === stage }] : []),
  { id: `${stage}.parts`, group, title: 'Unique parts', color, icon: 'tools', counts: 'parts', groupBy: 'part', test: (_i, c) => c.stage === stage },
  { id: `${stage}.ng`, group, title: 'Unique NG parts', color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', counts: 'parts', test: (_i, c) => c.stage === stage && c.bucket === 'NG' },
]
const STATIC_TILES: TileDef[] = [
  { id: 'all', group: 'Scope', title: 'All activities', color: '#2153f5', icon: 'list', test: () => true },
  { id: 'ngparts', group: 'Scope', title: 'NG parts', color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', counts: 'parts', test: (_i, c) => c.bucket === 'NG' },
  ...scopeTiles(UNDER, 'under', '#2153f5', true),
  ...scopeTiles(DEV, 'developed', '#10b981', false),
  { id: 'upcoming', group: 'Status', title: 'Upcoming', color: WORK_BUCKET_COLORS.Upcoming, icon: 'calendar-month', test: (_i, c) => c.bucket === 'Upcoming' },
  { id: 'completed', group: 'Status', title: 'Completed', color: WORK_BUCKET_COLORS.Completed, icon: 'check-circle', test: (_i, c) => c.bucket === 'Completed' },
  { id: 'overdue', group: 'Status', title: 'Overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' },
  { id: 'ng', group: 'Status', title: 'NG / Rework', color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', test: (_i, c) => c.bucket === 'NG' },
  { id: 'od.picUpdate', group: 'Overdue by owner', title: 'PIC data entry overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' && c.mine === 'picUpdate' },
  { id: 'od.vendorUpdate', group: 'Overdue by owner', title: 'Vendor data entry overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' && c.mine === 'vendorUpdate' },
  { id: 'od.approvePIC', group: 'Overdue by owner', title: 'PIC approval overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' && c.mine === 'approvePIC' },
  { id: 'od.approveSIC', group: 'Overdue by owner', title: 'SIC approval overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' && c.mine === 'approveSIC' },
  { id: 'od.approveDPM', group: 'Overdue by owner', title: 'DPM approval overdue', color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle', test: (_i, c) => c.bucket === 'Delayed' && c.mine === 'approveDPM' },
  { id: 'm.picUpdate', group: 'Pending with', title: 'PIC data entry pending', color: '#6d28d9', icon: 'pen', test: (_i, c) => c.mine === 'picUpdate' },
  { id: 'm.vendorUpdate', group: 'Pending with', title: 'Awaiting Vendor update', color: '#f97316', icon: 'clipboard', test: (_i, c) => c.mine === 'vendorUpdate' },
  { id: 'm.approvePIC', group: 'Pending with', title: 'Awaiting PIC approval', color: '#0891b2', icon: 'check', test: (_i, c) => c.mine === 'approvePIC' },
  { id: 'm.approveSIC', group: 'Pending with', title: 'Awaiting SIC approval', color: '#8b5cf6', icon: 'check', test: (_i, c) => c.mine === 'approveSIC' },
  { id: 'm.approveDPM', group: 'Pending with', title: 'Awaiting DPM approval', color: '#6366f1', icon: 'check', test: (_i, c) => c.mine === 'approveDPM' },
]

/** One panel on the canvas: a tile plus where it is drilled to. */
interface Panel { key: string; tile: string; drill: { dim: Dim; value: string }[]; groupBy?: Dim | 'list' }
const useScreen = create<{ panels: Panel[]; setPanels: (p: Panel[]) => void }>()(
  persist((set) => ({ panels: [], setPanels: (panels) => set({ panels }) }), { name: 'qa-tracker-my-screen', version: 1 })
)

const keyOf = (i: FilteredInstance, d: Dim): string =>
  d === 'model' ? i.part.model
    : d === 'trial' ? i.row.milestoneId
      : d === 'vendor' ? i.part.vendorCode || i.part.vendorName
        : d === 'part' ? i.part.partNo
          : d === 'activity' ? i.activity.name
            : d === 'dept' ? i.part.department || 'Other'
              : workBucket(i) ?? 'Not applicable'
const labelOf = (d: Dim, v: string, items: FilteredInstance[]): string => {
  if (d === 'trial') return trialLabelOf(v)
  if (d === 'vendor') { const p = items.find((i) => (i.part.vendorCode || i.part.vendorName) === v)?.part; return p ? `${p.vendorCode}: ${p.vendorName}` : v }
  if (d === 'part') { const p = items.find((i) => i.part.partNo === v)?.part; return p ? `${p.partNo}: ${p.partName}` : v }
  return v
}

export function MyScreen({ instances, parts, onOpen }: { instances: FilteredInstance[]; parts: PartRecord[]; onOpen: (i: FilteredInstance) => void }) {
  const { picAssignments, partReleases, partAcks } = useQAStore()
  const { panels, setPanels } = useScreen()
  const stageOf = useModelStages(parts)
  // One button per model (opens that model's dashboard, by trial).
  const TILES = useMemo<TileDef[]>(() => [
    ...STATIC_TILES,
    ...[...new Set(instances.map((i) => i.part.model))].sort().map((m): TileDef => ({
      id: `model:${m}`, group: 'Models', title: m, color: stageOf.get(m) === 'developed' ? '#10b981' : '#2153f5', icon: 'grid',
      drill: [{ dim: 'model', value: m }], test: (i) => i.part.model === m,
    })),
  ], [instances, stageOf])
  // Status bucket, "who acts next" and the model's development stage per item, once.
  const tagged = useMemo(() => instances.map((i) => {
    const pend = pendencyOf(i, { picAssignments, releases: partReleases, acks: partAcks, today: DEMO_TODAY })
    return { i, ctx: { mine: mineBucket(pend, i.status), bucket: workBucket(i), stage: stageOf.get(i.part.model) } }
  }), [instances, picAssignments, partReleases, partAcks, stageOf])
  const itemsOf = (tileId: string) => {
    const t = TILES.find((x) => x.id === tileId)
    return t ? tagged.filter((x) => t.test(x.i, x.ctx)).map((x) => x.i) : []
  }
  const counts = useMemo(() => Object.fromEntries(TILES.map((t) => {
    const items = tagged.filter((x) => t.test(x.i, x.ctx)).map((x) => x.i)
    const n = t.counts === 'models' ? new Set(items.map((i) => i.part.model)).size
      : t.counts === 'vendors' ? new Set(items.map((i) => i.part.vendorCode || i.part.vendorName)).size
        : t.counts === 'parts' ? new Set(items.map((i) => i.part.partNo)).size
          : items.length
    return [t.id, n]
  })), [tagged, TILES])

  const add = (tile: string) => {
    const t = TILES.find((x) => x.id === tile)
    setPanels([{ key: `${tile}-${Date.now().toString(36)}`, tile, drill: t?.drill ?? [], groupBy: t?.groupBy }, ...panels])
  }
  const update = (key: string, p: Partial<Panel>) => setPanels(panels.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const remove = (key: string) => setPanels(panels.filter((x) => x.key !== key))
  const groups = [...new Set(TILES.map((t) => t.group))]

  return (
    <div>
      {/* Tiles as buttons */}
      <section className="epmp-card mb-3 p-3" aria-label="Tiles">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-text)]">Add to my screen</h3>
          <span className="text-[10.5px] text-[var(--color-muted)]">Click a tile to open its dashboard below; click bars to drill down.</span>
          {panels.length > 0 && (
            <button type="button" onClick={() => setPanels([])} className="ml-auto text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">Clear screen</button>
          )}
        </div>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[150px] flex-none text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--color-muted)]">{g}</span>
              {TILES.filter((t) => t.group === g).map((t) => (
                <button key={t.id} type="button" onClick={() => add(t.id)} data-screen-tile={t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[10.5px] font-medium text-[#344054] hover:border-[#bfdbfe] hover:bg-[var(--color-surface)]">
                  <FbIcon name={t.icon} size={12} style={{ color: t.color }} />{t.title}
                  <span className="rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ color: t.color, background: `${t.color}14` }}>{counts[t.id]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Canvas */}
      {panels.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white/50 text-center">
          <FbIcon name="grid" size={28} className="mb-2 text-[var(--color-muted)]" />
          <p className="text-[12.5px] font-semibold text-[#344054]">Your screen is empty</p>
          <p className="mt-1 max-w-md text-[11px] text-[var(--color-muted)]">Click any tile above to add its dashboard here. Each one breaks down by Model, then Trial, Vendor and Part; click a bar to go one level deeper.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {panels.map((p) => (
            <ScreenPanel key={p.key} panel={p} tile={TILES.find((t) => t.id === p.tile)} items={itemsOf(p.tile)} onChange={(x) => update(p.key, x)} onRemove={() => remove(p.key)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function ScreenPanel({ panel, tile: given, items: all, onChange, onRemove, onOpen }: {
  panel: Panel
  tile: TileDef | undefined
  items: FilteredInstance[]
  onChange: (p: Partial<Panel>) => void
  onRemove: () => void
  onOpen: (i: FilteredInstance) => void
}) {
  // A model tile whose model is no longer in view still shows (empty).
  const tile: TileDef = given ?? { id: panel.tile, group: '', title: panel.tile.replace(/^model:/, ''), color: '#2153f5', icon: 'grid', test: () => false }
  const items = all.filter((i) => panel.drill.every((d) => keyOf(i, d.dim) === d.value))
  const used = panel.drill.map((d) => d.dim)
  const free = (Object.keys(DIM_LABEL) as Dim[]).filter((d) => !used.includes(d))
  const nextDefault = PATH.find((d) => !used.includes(d))
  // At the bottom of the path (or after choosing "List"), show the activities themselves.
  const groupBy: Dim | 'list' = panel.groupBy === 'list' ? 'list' : panel.groupBy && !used.includes(panel.groupBy) ? panel.groupBy : nextDefault ?? 'list'
  const bars = useMemo(() => {
    if (groupBy === 'list') return []
    const m = new Map<string, FilteredInstance[]>()
    for (const i of items) { const k = keyOf(i, groupBy); m.set(k, [...(m.get(k) ?? []), i]) }
    return [...m.entries()].map(([k, xs]) => ({ k, label: labelOf(groupBy, k, xs), n: xs.length, parts: new Set(xs.map((x) => x.part.partNo)).size, xs }))
      .sort((a, b) => b.n - a.n)
  }, [items, groupBy])
  const max = Math.max(1, ...bars.map((b) => b.n))
  const stat = (label: string, v: number) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5">
      <div className="text-[9.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="text-[15px] font-bold tabular-nums" style={{ color: tile.color }}>{v}</div>
    </div>
  )
  const uniq = (f: (i: FilteredInstance) => string) => new Set(items.map(f)).size

  return (
    <section className="epmp-card flex min-h-[280px] flex-col p-3" aria-label={tile.title} data-screen-panel={panel.tile}>
      <div className="mb-2 flex items-center gap-2">
        <FbIcon name={tile.icon} size={14} style={{ color: tile.color }} />
        <h3 className="text-[12.5px] font-semibold text-[var(--color-text)]">{tile.title}</h3>
        <button type="button" onClick={onRemove} aria-label={`Remove ${tile.title}`} title="Remove from my screen"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"><FbIcon name="close" size={13} /></button>
      </div>

      {/* Breadcrumb */}
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[10.5px]" aria-label="Drill path">
        <button type="button" onClick={() => onChange({ drill: tile.drill ?? [], groupBy: tile.groupBy })} className={panel.drill.length ? 'text-[var(--color-accent)] hover:underline' : 'font-semibold text-[#101828]'}>All</button>
        {panel.drill.map((d, n) => (
          <span key={n} className="inline-flex items-center gap-1">
            <span className="text-[var(--color-muted)]">›</span>
            <button type="button" onClick={() => onChange({ drill: panel.drill.slice(0, n + 1), groupBy: undefined })}
              className={n === panel.drill.length - 1 ? 'font-semibold text-[#101828]' : 'text-[var(--color-accent)] hover:underline'}>
              <span className="text-[var(--color-muted)]">{DIM_LABEL[d.dim]}:</span> {labelOf(d.dim, d.value, all)}
            </button>
          </span>
        ))}
      </nav>

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {stat('Activities', items.length)}
        {stat('Parts', uniq((i) => i.part.partNo))}
        {stat('Models', uniq((i) => i.part.model))}
        {stat('Vendors', uniq((i) => i.part.vendorCode || i.part.vendorName))}
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10.5px] font-semibold text-[#344054]">{groupBy === 'list' ? 'Activities' : `By ${DIM_LABEL[groupBy]}`}</span>
        <label className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
          Group by
          <select value={groupBy} onChange={(e) => onChange({ groupBy: e.target.value as Dim | 'list' })}
            className="h-7 rounded-md border border-[var(--color-border)] bg-white px-1.5 text-[10.5px] text-[#344054]">
            {free.map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
            <option value="list">— List activities —</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <p className="flex-1 py-6 text-center text-[11px] text-[var(--color-muted)]">Nothing here for the current filters.</p>
      ) : groupBy === 'list' ? (
        <ActivityList items={items} onOpen={onOpen} />
      ) : (
        <ul className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {bars.map((b) => (
            <li key={b.k}>
              <button type="button" onClick={() => onChange({ drill: [...panel.drill, { dim: groupBy, value: b.k }], groupBy: undefined })}
                title={`Drill into ${b.label}`} className="group flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-[var(--color-surface)]">
                <span className="w-[38%] min-w-0 truncate text-[10.5px] text-[#344054]" title={b.label}>{b.label}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-[#f1f5f9]">
                  {/* Stacked by status */}
                  <span className="absolute inset-y-0 left-0 flex" style={{ width: `${(b.n / max) * 100}%` }}>
                    {(['Upcoming', 'Completed', 'Delayed', 'NG'] as WorkBucket[]).map((s) => {
                      const c = b.xs.filter((x) => workBucket(x) === s).length
                      return c ? <span key={s} title={`${s}: ${c}`} style={{ width: `${(c / b.n) * 100}%`, background: WORK_BUCKET_COLORS[s] }} /> : null
                    })}
                  </span>
                </span>
                <span className="w-[74px] flex-none text-right text-[10px] tabular-nums text-[#475467]"><strong className="text-[#101828]">{b.n}</strong> · {b.parts} part{b.parts === 1 ? '' : 's'}</span>
                <FbIcon name="chevron-down" size={11} className="-rotate-90 text-[var(--color-muted)] opacity-0 group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {groupBy !== 'list' && items.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[9.5px] text-[var(--color-muted)]">
          {(['Upcoming', 'Completed', 'Delayed', 'NG'] as WorkBucket[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: WORK_BUCKET_COLORS[s] }} />{s === 'Delayed' ? 'Overdue' : s}</span>
          ))}
          <span className="ml-auto">Click a bar to drill down</span>
        </p>
      )}
    </section>
  )
}

function ActivityList({ items, onOpen }: { items: FilteredInstance[]; onOpen: (i: FilteredInstance) => void }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-[10.5px]">
        <thead className="sticky top-0">
          <tr className="text-left"><th className="px-2 py-1.5">Part</th><th className="px-2 py-1.5">Activity</th><th className="px-2 py-1.5">Trial</th><th className="px-2 py-1.5">Planned end</th><th className="px-2 py-1.5">Status</th></tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const b = workBucket(i)
            return (
              <tr key={`${i.row.id}|${i.part.partNo}`} onClick={() => onOpen(i)} className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]" title="Open the activity form">
                <td className="px-2 py-1.5"><span className="font-mono">{i.part.partNo}</span> <span className="text-[var(--color-muted)]">{i.part.partName}</span></td>
                <td className="px-2 py-1.5">{i.activity.name}</td>
                <td className="px-2 py-1.5">{trialLabelOf(i.row.milestoneId)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{i.dates.status === 'resolved' ? fmtDate(i.dates.end) : '—'}</td>
                <td className="px-2 py-1.5">{b ? <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold text-white" style={{ background: WORK_BUCKET_COLORS[b] }}>{b === 'Delayed' ? 'Overdue' : b}</span> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
