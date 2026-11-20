/**
 * Workspace → My Screen: a blank canvas with the My Work tiles as buttons along the top. Clicking a tile adds a
 * dashboard panel for it: a summary (activities, parts, models, vendors) and a breakdown, by Model first. Clicking a
 * bar drills one level down (Model → Trial → Vendor → Part → Activity list); the breadcrumb goes back up, and the
 * "Group by" picks another breakdown at any level. In the activity list a row opens the activity form.
 * The panels (and where each is drilled to) are remembered in this browser. The page filters apply.
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

  const openIds = new Set(panels.map((p) => p.tile))
  // A tile already on the screen moves to the top instead of opening twice.
  const pick = (tile: string) => {
    const at = panels.find((p) => p.tile === tile)
    if (at) setPanels([at, ...panels.filter((p) => p !== at)])
    else add(tile)
    setTimeout(() => document.getElementById('my-screen-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Left: the tiles as buttons */}
      <aside className="epmp-card p-2.5 lg:sticky lg:top-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto" aria-label="Tiles">
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <h3 className="text-[12px] font-semibold text-[var(--color-text)]">Tiles</h3>
          {panels.length > 0 && (
            <button type="button" onClick={() => setPanels([])} className="ml-auto text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">Clear screen</button>
          )}
        </div>
        <p className="mb-2 px-1 text-[10px] text-[var(--color-muted)]">Click a tile to open its dashboard on the right.</p>
        {groups.map((g) => {
          const open = !closedGroups.has(g)
          return (
            <div key={g} className="mb-1.5">
              <button type="button" aria-expanded={open}
                onClick={() => setClosedGroups((prev) => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n })}
                className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-[9.5px] font-semibold uppercase leading-tight tracking-wide text-[var(--color-muted)] hover:bg-[var(--color-surface)]">
                <FbIcon name="chevron-down" size={11} className={open ? '' : '-rotate-90'} />{g}
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {TILES.filter((t) => t.group === g).map((t) => {
                    const on = openIds.has(t.id)
                    return (
                      <button key={t.id} type="button" onClick={() => pick(t.id)} data-screen-tile={t.id} aria-pressed={on}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ${on ? 'border-[#bfdbfe] bg-secondary font-semibold text-[#101828]' : 'border-transparent text-[#344054] hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]'}`}
                        style={on ? { boxShadow: `inset 3px 0 0 ${t.color}` } : undefined}>
                        <FbIcon name={t.icon} size={12} style={{ color: t.color }} />
                        <span className="min-w-0 flex-1 truncate" title={t.title}>{t.title}</span>
                        <span className="flex-none rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ color: t.color, background: `${t.color}14` }}>{counts[t.id]}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </aside>

      {/* Right: the interactive dashboard */}
      <div id="my-screen-canvas" className="min-w-0 scroll-mt-2">
        {panels.length === 0 ? (
          <div className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white/50 px-6 text-center">
            <FbIcon name="grid" size={28} className="mb-2 text-[var(--color-muted)]" />
            <p className="text-[12.5px] font-semibold text-[#344054]">Your screen is empty</p>
            <p className="mt-1 max-w-md text-[11px] text-[var(--color-muted)]">Click any tile on the left to open its dashboard here. Each breaks down by Model, then Trial, Vendor and Part; click a bar to go one level deeper.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-3 ${panels.length > 1 ? 'min-[1800px]:grid-cols-2' : ''}`}>
            {panels.map((p) => (
              <ScreenPanel key={p.key} panel={p} tile={TILES.find((t) => t.id === p.tile)} items={itemsOf(p.tile)} onChange={(x) => update(p.key, x)} onRemove={() => remove(p.key)} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
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
  const stat = (label: string, v: number) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5">
      <div className="text-[9.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="text-[15px] font-bold tabular-nums" style={{ color: tile.color }}>{v}</div>
    </div>
  )
  const uniq = (f: (i: FilteredInstance) => string) => new Set(items.map(f)).size

  return (
    <section className="epmp-card @container flex min-h-[280px] min-w-0 flex-col p-3" aria-label={tile.title} data-screen-panel={panel.tile}>
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
        <PanelChart items={items} bars={bars} dimLabel={DIM_LABEL[groupBy]}
          onDrill={(k) => onChange({ drill: [...panel.drill, { dim: groupBy, value: k }], groupBy: undefined })} />
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

const STATUSES: WorkBucket[] = ['Upcoming', 'Completed', 'Delayed', 'NG']
const statusName = (b: WorkBucket) => (b === 'Delayed' ? 'Overdue' : b)
const TOP = 12

/**
 * The panel's chart: a status donut (with % complete in the middle) beside a stacked bar chart of the breakdown.
 * Both resize with the panel; side by side when the panel is wide, stacked when narrow. Long lists show the top 12
 * with "Show all". Clicking a bar (or its label) drills into it.
 */
function PanelChart({ items, bars, dimLabel, onDrill }: {
  items: FilteredInstance[]
  bars: { k: string; label: string; n: number; parts: number; xs: FilteredInstance[] }[]
  dimLabel: string
  onDrill: (key: string) => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? bars : bars.slice(0, TOP)
  const tickOf = (b: { label: string; n: number }) => `${b.label} (${b.n})`
  const data = shown.map((b) => ({
    key: b.k, name: tickOf(b), total: b.n, parts: b.parts, label: b.label,
    ...Object.fromEntries(STATUSES.map((s) => [s, b.xs.filter((x) => workBucket(x) === s).length])),
  }))
  const mix = STATUSES.map((s) => ({ s, n: items.filter((i) => workBucket(i) === s).length })).filter((x) => x.n > 0)
  const done = items.filter((i) => workBucket(i) === 'Completed').length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const longest = Math.max(...shown.map((b) => tickOf(b).length), 4)
  const labelW = Math.min(220, Math.max(70, longest * 6.2 + 10))
  const height = Math.max(150, shown.length * 30 + 36)
  const trim = (t: string) => (t.length * 6.2 > labelW - 8 ? `${t.slice(0, Math.floor((labelW - 14) / 6.2))}…` : t)

  return (
    <div className="grid grid-cols-1 gap-3 @[620px]:grid-cols-[200px_minmax(0,1fr)]">
      {/* Status mix */}
      <div className="flex flex-col items-center rounded-lg border border-[var(--color-border)] bg-white p-2">
        <div className="self-start text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Status mix</div>
        <div className="relative h-[150px] w-full max-w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={mix} dataKey="n" nameKey="s" innerRadius="62%" outerRadius="92%" paddingAngle={mix.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {mix.map((m) => <Cell key={m.s} fill={WORK_BUCKET_COLORS[m.s]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v as number, statusName(n as WorkBucket)]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold leading-none text-[#101828]">{pct}%</span>
            <span className="mt-0.5 text-[9.5px] text-[var(--color-muted)]">completed</span>
          </div>
        </div>
        <ul className="mt-1 grid w-full grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          {STATUSES.map((s) => {
            const n = items.filter((i) => workBucket(i) === s).length
            return (
              <li key={s} className="flex items-center gap-1 text-[#475467]">
                <span className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: WORK_BUCKET_COLORS[s] }} />
                <span className="truncate">{statusName(s)}</span><span className="ml-auto font-semibold tabular-nums text-[#101828]">{n}</span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Breakdown */}
      <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-white p-2">
        <div className="mb-1 flex items-center gap-2 text-[10px]">
          <span className="font-semibold uppercase tracking-wide text-[var(--color-muted)]">Activities by {dimLabel}</span>
          <span className="ml-auto text-[var(--color-muted)]">Click a bar to drill down</span>
        </div>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 2, right: 12, left: 0, bottom: 2 }} barCategoryGap={6}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
              <XAxis type="number" allowDecimals={false} fontSize={10} stroke="#98a2b3" tickLine={false} />
              <YAxis type="category" dataKey="name" width={labelW} fontSize={10.5} stroke="#475467" tickLine={false} axisLine={false}
                tickFormatter={trim} interval={0} style={{ cursor: 'pointer' }}
                onClick={(t: unknown) => { const v = (t as { value?: string })?.value; const row = data.find((d) => d.name === v); if (row) onDrill(row.key) }} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ fontSize: 11, borderRadius: 8 }}
                formatter={(v, n) => [v as number, statusName(n as WorkBucket)]}
                labelFormatter={(l, p) => { const r = p?.[0]?.payload as { total?: number; parts?: number } | undefined; return `${(p?.[0]?.payload as { label?: string } | undefined)?.label ?? l}${r ? ` · ${r.total} activities, ${r.parts} part${r.parts === 1 ? '' : 's'}` : ''}` }} />
              {STATUSES.map((st, k) => (
                <Bar key={st} dataKey={st} stackId="s" maxBarSize={26} fill={WORK_BUCKET_COLORS[st]} cursor="pointer" isAnimationActive={false}
                  radius={k === STATUSES.length - 1 ? [0, 4, 4, 0] : 0}
                  onClick={(d: unknown) => { const key = (d as { payload?: { key?: string } })?.payload?.key; if (key) onDrill(key) }} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {bars.length > TOP && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">
            {all ? `Show top ${TOP}` : `Show all ${bars.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
