/**
 * Workspace → My Screen: a blank canvas with the My Work tiles as buttons along the top. Clicking a tile adds a
 * dashboard panel for it: a summary (activities, parts, models, vendors) and a breakdown, by Model first. Clicking a
 * bar drills one level down (Model → Trial → Vendor → Part → Activity list); the breadcrumb goes back up, and the
 * "Group by" picks another breakdown at any level. In the activity list a row opens the activity form.
 * The panels (and where each is drilled to) are remembered in this browser. The page filters apply.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon as FbIcon } from '../../components/Icon'
import { pendencyOf, taskOf, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'
import { trialLabelOf } from '../trialLabel'
import { ActivityUpdatePanel } from '../activityupdate/ActivityUpdatePage'
import { mineBucket, useModelStages } from './OverviewTab'
import { isReturnedToPicBySic, isReturnedToVendor } from './workQueue'
import { usePersonaStore } from '../../store/personaStore'
import { ACK_SLA_DAYS, PLAN_SLA_DAYS, RELEASE_SLA_DAYS, usePlanningSla } from '../vendorplanning/planningSla'
import type { PartRecord } from '../../domain'
import type { MineKey } from './OverviewTab'

type Dim = 'model' | 'trial' | 'vendor' | 'part' | 'activity' | 'status' | 'dept'
const DIM_LABEL: Record<Dim, string> = { model: 'Model', trial: 'Trial', vendor: 'Vendor', part: 'Part', activity: 'Activity', status: 'Status', dept: 'Department' }
/** Default drill path. */
const PATH: Dim[] = ['model', 'trial', 'vendor', 'part']

type Ctx = {
  mine: MineKey | null; bucket: WorkBucket | null; stage: 'under' | 'developed' | 'past' | undefined
  /** Returned to the vendor (by the PIC or SIC) / to the PIC by the SIC; a vendor delay reason waits for review. */
  toVendor: boolean; toPic: boolean; delayReview: boolean
  /** The part's timelines: release > 7 d, acknowledgement > 3 d, vendor planned dates pending / past ack + 15 d. */
  relOD: boolean; ackOD: boolean; planPend: boolean; planExc: boolean
}
interface TileDef {
  id: string; group: string; title: string; color: string; icon: string
  test: (i: FilteredInstance, ctx: Ctx) => boolean
  /** What the count on the button counts (default: activities). */
  counts?: 'models' | 'vendors' | 'parts'
  /** Opens already drilled to this (e.g. one model). */
  drill?: { dim: Dim; value: string }[]
  /** What the details list at the top shows (default: what the tile counts; 'none' = no list). */
  detail?: 'models' | 'vendors' | 'parts' | 'activities' | 'none'
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
  { id: 'all', group: 'Scope', title: 'All activities', color: '#2153f5', icon: 'list', detail: 'none', test: () => true },
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
  { id: 't.release', group: 'Part timelines', title: `Release overdue (> ${RELEASE_SLA_DAYS} d)`, color: '#b45309', icon: 'clipboard', counts: 'parts', test: (_i, c) => c.relOD },
  { id: 't.ack', group: 'Part timelines', title: `Ack overdue (> ${ACK_SLA_DAYS} d)`, color: '#dc2626', icon: 'clipboard', counts: 'parts', test: (_i, c) => c.ackOD },
  { id: 't.planPending', group: 'Part timelines', title: 'Vendor planned dates pending', color: '#ea580c', icon: 'calendar-month', counts: 'parts', test: (_i, c) => c.planPend },
  { id: 't.planExceeded', group: 'Part timelines', title: `Planning time exceeded (ack + ${PLAN_SLA_DAYS} d)`, color: '#991b1b', icon: 'exclamation-circle', counts: 'parts', test: (_i, c) => c.planExc },
  { id: 'r.toVendor', group: 'Returned & reviews', title: 'Returned to vendor', color: '#ea580c', icon: 'reply', test: (_i, c) => c.toVendor },
  { id: 'r.toPic', group: 'Returned & reviews', title: 'Returned to PIC', color: '#ea580c', icon: 'reply', test: (_i, c) => c.toPic },
  { id: 'r.delay', group: 'Returned & reviews', title: 'Delay reviews', color: '#2563eb', icon: 'calendar-month', test: (_i, c) => c.delayReview },
]

/** One panel on the canvas: a tile plus where it is drilled to. */
type DetailKind = 'models' | 'vendors' | 'parts' | 'activities'
interface Panel {
  key: string; tile: string; drill: { dim: Dim; value: string }[]; groupBy?: Dim | 'list'
  /** Set by clicking a number in the details list: what the list shows next (e.g. that model's parts). */
  detail?: DetailKind
}
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
  if (d === 'status') return v === 'Delayed' ? 'Overdue' : v === 'NG' ? 'NG / Rework' : v
  if (d === 'vendor') { const p = items.find((i) => (i.part.vendorCode || i.part.vendorName) === v)?.part; return p ? `${p.vendorCode}: ${p.vendorName}` : v }
  if (d === 'part') { const p = items.find((i) => i.part.partNo === v)?.part; return p ? `${p.partNo}: ${p.partName}` : v }
  return v
}

export function MyScreen({ instances, parts, onOpen, filters = [], trials, delayKeys }: {
  instances: FilteredInstance[]
  parts: PartRecord[]
  onOpen: (i: FilteredInstance) => void
  /** The page filters in force, e.g. ["Model: Swift", "Status: NG"]. Any filter shows the Insights panel automatically. */
  filters?: string[]
  /** Trials picked in the page filters (Activity Update fills those). */
  trials?: string[]
  /** Activities (`rowId|partNo`) whose vendor delay reason waits for review. */
  delayKeys?: Set<string>
}) {
  const { currentPersona } = usePersonaStore()
  const slaRows = usePlanningSla()
  const slaOf = useMemo(() => new Map(slaRows.map((s) => [s.part.partNo, s])), [slaRows])
  const { picAssignments, partReleases, partAcks } = useQAStore()
  const { panels, setPanels } = useScreen()
  const stageOf = useModelStages(parts)
  // One button per model (opens that model's dashboard, by trial).
  const TILES = useMemo<TileDef[]>(() => [
    // Same tiles as My Work: "Returned to vendor" is the PIC's, "Returned to PIC" the SIC's.
    ...STATIC_TILES.filter((t) => (t.id !== 'r.toVendor' || currentPersona === 'PIC') && (t.id !== 'r.toPic' || currentPersona === 'SIC') && (t.id !== 't.release' || currentPersona !== 'Vendor')),
    ...[...new Set(instances.map((i) => i.part.model))].sort().map((m): TileDef => ({
      id: `model:${m}`, group: 'Models', title: m, detail: 'parts', color: stageOf.get(m) === 'developed' ? '#10b981' : '#2153f5', icon: 'grid',
      drill: [{ dim: 'model', value: m }], test: (i) => i.part.model === m,
    })),
  ], [instances, stageOf, currentPersona])
  // Status bucket, "who acts next" and the model's development stage per item, once.
  const tagged = useMemo(() => instances.map((i) => {
    const pend = pendencyOf(i, { picAssignments, releases: partReleases, acks: partAcks, today: DEMO_TODAY })
    return { i, ctx: {
      mine: mineBucket(pend, i.status), bucket: workBucket(i), stage: stageOf.get(i.part.model),
      toVendor: isReturnedToVendor(i), toPic: isReturnedToPicBySic(i), delayReview: !!delayKeys?.has(`${i.row.id}|${i.part.partNo}`),
      relOD: !!slaOf.get(i.part.partNo)?.releaseOverdue, ackOD: !!slaOf.get(i.part.partNo)?.ackOverdue,
      planPend: !!slaOf.get(i.part.partNo)?.planPending, planExc: !!slaOf.get(i.part.partNo)?.planExceeded,
    } }
  }), [instances, picAssignments, partReleases, partAcks, stageOf, delayKeys, slaOf])
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
  // Clicking a tile opens its dashboard; clicking it again (while it's open) closes it.
  const pick = (tile: string) => {
    if (panels.some((p) => p.tile === tile)) { setPanels(panels.filter((p) => p.tile !== tile)); return }
    add(tile)
    setTimeout(() => document.getElementById('my-screen-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  // Insights for the filters: shown by itself whenever a filter is selected (and on an empty screen); it starts
  // again from the top whenever the filters change.
  const filterSig = filters.join('|')
  const [auto, setAuto] = useState<Panel>({ key: 'auto', tile: 'all', drill: [] })
  useEffect(() => { setAuto({ key: 'auto', tile: 'all', drill: [] }) }, [filterSig])
  const [autoHidden, setAutoHidden] = useState<string | null>(null)
  const showAuto = (filters.length > 0 || panels.length === 0) && autoHidden !== filterSig

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
        <p className="mb-2 px-1 text-[10px] text-[var(--color-muted)]">Click a tile to open its dashboard on the right; click it again to close it.</p>
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
                      <button key={t.id} type="button" onClick={() => pick(t.id)} data-screen-tile={t.id} aria-pressed={on} title={on ? 'Click to close this dashboard' : 'Click to open its dashboard'}
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
        {showAuto && (
          <div className="mb-3">
            <ScreenPanel panel={auto} items={tagged.map((x) => x.i)} onChange={(x) => setAuto((a) => ({ ...a, ...x }))}
              onRemove={() => setAutoHidden(filterSig)} onOpen={onOpen} trials={trials}
              tile={{ id: 'all', group: '', title: filters.length ? 'Insights · your filters' : 'Insights · all my activities', color: '#2153f5', icon: 'chart-mixed', test: () => true }}
              note={filters.length
                ? <span className="flex flex-wrap gap-1">{filters.map((f) => <span key={f} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary">{f}</span>)}</span>
                : <span className="text-[10.5px] text-[var(--color-muted)]">Select any filter above and the insights follow it; click a tile on the left to add more dashboards.</span>} />
          </div>
        )}
        {panels.length === 0 && !showAuto ? (
          <div className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white/50 px-6 text-center">
            <FbIcon name="grid" size={28} className="mb-2 text-[var(--color-muted)]" />
            <p className="text-[12.5px] font-semibold text-[#344054]">Your screen is empty</p>
            <p className="mt-1 max-w-md text-[11px] text-[var(--color-muted)]">Click any tile on the left to open its dashboard here. Each breaks down by Model, then Trial, Vendor and Part; click a bar to go one level deeper.</p>
          </div>
        ) : panels.length === 0 ? null : (
          <div className={`grid grid-cols-1 gap-3 ${panels.length > 1 ? 'min-[1800px]:grid-cols-2' : ''}`}>
            {panels.map((p) => (
              <ScreenPanel key={p.key} panel={p} tile={TILES.find((t) => t.id === p.tile)} items={itemsOf(p.tile)} onChange={(x) => update(p.key, x)} onRemove={() => remove(p.key)} onOpen={onOpen} trials={trials} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ScreenPanel({ panel, tile: given, items: all, onChange, onRemove, onOpen, note, trials }: {
  panel: Panel
  tile: TileDef | undefined
  /** Shown under the title (e.g. the filters behind the automatic Insights panel). */
  note?: React.ReactNode
  items: FilteredInstance[]
  onChange: (p: Partial<Panel>) => void
  onRemove: () => void
  onOpen: (i: FilteredInstance) => void
  trials?: string[]
}) {
  // A model tile whose model is no longer in view still shows (empty).
  const tile: TileDef = given ?? { id: panel.tile, group: '', title: panel.tile.replace(/^model:/, ''), color: '#2153f5', icon: 'grid', test: () => false }
  const items = all.filter((i) => panel.drill.every((d) => keyOf(i, d.dim) === d.value))
  const used = panel.drill.map((d) => d.dim)
  const free = (Object.keys(DIM_LABEL) as Dim[]).filter((d) => !used.includes(d))
  // Next breakdown on the path, skipping one the filters already narrow to a single value (e.g. one model picked).
  const open = PATH.filter((d) => !used.includes(d))
  const nextDefault = open.find((d) => new Set(items.map((i) => keyOf(i, d))).size > 1) ?? open[0]
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
  // The tile's details list; once drilled into one model / vendor / part, it lists the next level down.
  const baseKind = tile.detail ?? tile.counts ?? 'activities'
  const kindDim = { models: 'model', vendors: 'vendor', parts: 'part' } as const
  const detailKind: DetailKind = panel.detail ? panel.detail : baseKind === 'none' ? 'activities'
    : baseKind !== 'activities' && used.includes(kindDim[baseKind]) ? (used.includes('part') ? 'activities' : 'parts')
      : baseKind

  return (
    <section className="epmp-card @container flex min-h-[280px] min-w-0 flex-col p-3" aria-label={tile.title} data-screen-panel={panel.tile}>
      <div className="mb-2 flex items-center gap-2">
        <FbIcon name={tile.icon} size={14} style={{ color: tile.color }} />
        <h3 className="text-[12.5px] font-semibold text-[var(--color-text)]">{tile.title}</h3>
        <button type="button" onClick={onRemove} aria-label={`Remove ${tile.title}`} title="Remove from my screen"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"><FbIcon name="close" size={13} /></button>
      </div>
      {note && <div className="-mt-1 mb-2">{note}</div>}

      {/* Breadcrumb */}
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[10.5px]" aria-label="Drill path">
        <button type="button" onClick={() => onChange({ drill: tile.drill ?? [], groupBy: tile.groupBy, detail: undefined })} className={panel.drill.length ? 'text-[var(--color-accent)] hover:underline' : 'font-semibold text-[#101828]'}>All</button>
        {panel.drill.map((d, n) => (
          <span key={n} className="inline-flex items-center gap-1">
            <span className="text-[var(--color-muted)]">›</span>
            <button type="button" onClick={() => onChange({ drill: panel.drill.slice(0, n + 1), groupBy: undefined, detail: undefined })}
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
        <TileDetails kind="activities" items={items} color={tile.color} onOpen={onOpen} trials={trials}
          onPick={(picks, detail) => onChange({ drill: [...panel.drill.filter((d) => !picks.some((x) => x.dim === d.dim)), ...picks], groupBy: undefined, detail })} />
      ) : (
        <>
          <TileDetails kind={detailKind} items={items} color={tile.color} onOpen={onOpen} trials={trials}
            onPick={(picks, detail) => onChange({ drill: [...panel.drill.filter((d) => !picks.some((x) => x.dim === d.dim)), ...picks], groupBy: undefined, detail })} />
          <PanelInsights items={items} groupBy={groupBy} onDrill={(k) => onChange({ drill: [...panel.drill, { dim: groupBy, value: k }], groupBy: undefined })} />
          <PanelChart items={items} bars={bars} dimLabel={DIM_LABEL[groupBy]}
            onDrill={(k) => onChange({ drill: [...panel.drill, { dim: groupBy, value: k }], groupBy: undefined })} />
        </>
      )}
    </section>
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

// ── Insights: findings, KPIs and the analysis charts ─────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000
const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`)
const dstr = (t: number) => new Date(t).toISOString().slice(0, 10)
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** When an activity was approved (its last "Approved" history entry). */
const approvedOn = (i: FilteredInstance) => [...(i.entry?.history ?? [])].reverse().find((h) => h.action === 'Approved')?.timestamp.slice(0, 10)
const plannedEnd = (i: FilteredInstance) => (i.dates.status === 'resolved' ? i.dates.end : undefined)
type Tone = 'risk' | 'watch' | 'good' | 'info'
const TONE: Record<Tone, string> = {
  risk: 'border-red-200 bg-red-50 text-red-900',
  watch: 'border-amber-200 bg-amber-50 text-amber-900',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}

/**
 * What the selection says: rule-based findings (schedule adherence, where overdue and NG concentrate, the bottleneck
 * task, upcoming load, the oldest overdue item), KPIs, and four charts: progress vs plan over time, where open work
 * waits (current task), overdue ageing, and what falls due in the coming weeks. Findings about a group drill into it.
 */
function PanelInsights({ items, groupBy, onDrill }: {
  items: FilteredInstance[]
  /** The breakdown in use (findings name its groups). */
  groupBy: Dim
  onDrill: (key: string) => void
}) {
  const { partReleases, partAcks } = useQAStore()
  const today = DEMO_TODAY
  const t0 = dnum(today)
  const a = useMemo(() => {
    const bucket = (i: FilteredInstance) => workBucket(i)
    const open = items.filter((i) => !i.notApplicable && i.status !== 'Approved')
    const done = items.filter((i) => i.status === 'Approved')
    const overdue = items.filter((i) => bucket(i) === 'Delayed')
    const ng = items.filter((i) => bucket(i) === 'NG')
    const dueByToday = items.filter((i) => { const e = plannedEnd(i); return e && e <= today })
    const doneOfDue = dueByToday.filter((i) => i.status === 'Approved').length
    const late = (i: FilteredInstance) => { const e = plannedEnd(i); return e ? Math.round((t0 - dnum(e)) / DAY_MS) : 0 }
    const avgLate = overdue.length ? Math.round(overdue.reduce((n, i) => n + late(i), 0) / overdue.length) : 0
    const in30 = open.filter((i) => { const e = plannedEnd(i); return e && e > today && dnum(e) <= t0 + 30 * DAY_MS })
    // Approved on time = approved on or before the planned end.
    const onTime = done.filter((i) => { const e = plannedEnd(i), d = approvedOn(i); return e && d && d <= e }).length

    // By the panel's breakdown.
    const groups = new Map<string, FilteredInstance[]>()
    for (const i of items) { const k = keyOf(i, groupBy); groups.set(k, [...(groups.get(k) ?? []), i]) }
    const g = [...groups.entries()].map(([k, xs]) => ({
      k, label: labelOf(groupBy, k, xs), n: xs.length,
      overdue: xs.filter((i) => bucket(i) === 'Delayed').length, ng: xs.filter((i) => bucket(i) === 'NG').length,
      done: xs.filter((i) => i.status === 'Approved').length,
    }))

    // Where open work waits now (the flow task).
    const tasks = new Map<string, { n: number; overdue: number }>()
    for (const i of open) {
      const t = taskOf(i, { releases: partReleases, acks: partAcks }) ?? 'Not started'
      const r = tasks.get(t) ?? { n: 0, overdue: 0 }
      r.n += 1
      if (bucket(i) === 'Delayed') r.overdue += 1
      tasks.set(t, r)
    }
    const taskRows = [...tasks.entries()].map(([task, r]) => ({ task, onTime: r.n - r.overdue, overdue: r.overdue, n: r.n })).sort((x, y) => y.n - x.n).slice(0, 8)

    // Overdue ageing.
    const ages = [
      { band: '1–7 d', min: 1, max: 7 }, { band: '8–14 d', min: 8, max: 14 }, { band: '15–30 d', min: 15, max: 30 }, { band: '> 30 d', min: 31, max: 1e9 },
    ].map((b) => ({ band: b.band, n: overdue.filter((i) => { const d = late(i); return d >= b.min && d <= b.max }).length }))

    // Coming weeks: open activities by the week their planned end falls in (overdue shown as "Late").
    const weeks = Array.from({ length: 6 }, (_, w) => {
      const from = t0 + w * 7 * DAY_MS, to = from + 7 * DAY_MS
      return { week: `w/c ${shortDate(dstr(from))}`, n: open.filter((i) => { const e = plannedEnd(i); return e && dnum(e) > from && dnum(e) <= to }).length }
    })

    // Progress vs plan: cumulative planned (by planned end) and completed (by approval date), weekly.
    const ends = items.map(plannedEnd).filter((d): d is string => !!d)
    const firsts = [...ends, ...done.map(approvedOn).filter((d): d is string => !!d)]
    let curve: { date: string; planned: number; completed: number | null }[] = []
    if (firsts.length) {
      const start = Math.min(...firsts.map(dnum)) - 7 * DAY_MS
      const end = Math.max(...ends.map(dnum), t0) + 7 * DAY_MS
      const doneDates = done.map(approvedOn).filter((d): d is string => !!d).map(dnum)
      const endNums = ends.map(dnum)
      for (let t = start; t <= end; t += 7 * DAY_MS) {
        curve.push({
          date: shortDate(dstr(t)),
          planned: endNums.filter((x) => x <= t).length,
          completed: t <= t0 + 6 * DAY_MS ? doneDates.filter((x) => x <= Math.min(t, t0)).length : null,
        })
      }
      if (curve.length > 40) curve = curve.filter((_, k) => k % Math.ceil(curve.length / 40) === 0 || k === curve.length - 1)
    }

    // Findings.
    const pct = (x: number, y: number) => (y ? Math.round((x / y) * 100) : 0)
    const findings: { tone: Tone; text: string; drill?: string }[] = []
    if (dueByToday.length) {
      const p = pct(doneOfDue, dueByToday.length)
      findings.push({ tone: p >= 80 ? 'good' : p >= 50 ? 'watch' : 'risk', text: `Schedule: ${doneOfDue} of ${dueByToday.length} activities due by today are completed (${p}%).` })
    }
    const topOver = [...g].sort((x, y) => y.overdue - x.overdue)[0]
    if (topOver && topOver.overdue > 0 && g.length > 1) {
      findings.push({ tone: 'risk', drill: topOver.k, text: `${topOver.label} holds ${topOver.overdue} of ${overdue.length} overdue activities (${pct(topOver.overdue, overdue.length)}%).` })
    }
    const ngRated = g.filter((x) => x.n >= 5).map((x) => ({ ...x, rate: x.ng / x.n })).sort((x, y) => y.rate - x.rate)[0]
    if (ngRated && ngRated.ng > 0 && g.length > 1) {
      findings.push({ tone: ngRated.rate >= 0.2 ? 'risk' : 'watch', drill: ngRated.k, text: `Highest NG rate: ${ngRated.label} at ${pct(ngRated.ng, ngRated.n)}% (${ngRated.ng} of ${ngRated.n}).` })
    }
    const bottleneck = taskRows[0]
    if (bottleneck) findings.push({ tone: bottleneck.overdue > 0 ? 'watch' : 'info', text: `Most open work waits at ${bottleneck.task}: ${bottleneck.n} activities${bottleneck.overdue ? `, ${bottleneck.overdue} of them overdue` : ''}.` })
    if (in30.length) {
      const peak = [...weeks].sort((x, y) => y.n - x.n)[0]
      findings.push({ tone: 'info', text: `${in30.length} activities fall due in the next 30 days${peak?.n ? `; the busiest week is ${peak.week.replace('w/c ', 'starting ')} (${peak.n})` : ''}.` })
    }
    const oldest = [...overdue].sort((x, y) => late(y) - late(x))[0]
    if (oldest) findings.push({ tone: 'risk', text: `Oldest overdue: ${oldest.activity.name} on ${oldest.part.partNo} (${oldest.part.model}), ${late(oldest)} days past its planned end.` })
    if (!overdue.length && items.length) findings.push({ tone: 'good', text: 'Nothing is overdue in this selection.' })

    return {
      n: items.length, done: done.length, overdue: overdue.length, ng: ng.length, avgLate, in30: in30.length,
      adherence: pct(doneOfDue, dueByToday.length), dueByToday: dueByToday.length, onTime, completion: pct(done.length, items.length),
      onTimeRate: pct(onTime, done.length), taskRows, ages, weeks, curve, findings: findings.slice(0, 6),
    }
  }, [items, groupBy, partReleases, partAcks, today, t0])
  const todayTick = useMemo(() => {
    // The weekly point closest to today, for the reference line.
    const c = a.curve.findIndex((p) => p.completed === null)
    return c > 0 ? a.curve[c - 1].date : a.curve.at(-1)?.date
  }, [a.curve])

  const kpi = (label: string, value: string, sub: string, color: string) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2">
      <div className="text-[9.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="text-[17px] font-bold leading-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9.5px] text-[var(--color-muted)]">{sub}</div>
    </div>
  )
  const card = (title: string, children: React.ReactNode, hint?: string) => (
    <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-white p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</span>
        {hint && <span className="ml-auto text-[9.5px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  )
  const tip = { contentStyle: { fontSize: 11, borderRadius: 8 }, cursor: { fill: '#f1f5f9' } }

  return (
    <div className="mb-3 space-y-3">
      {/* Findings */}
      {a.findings.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 @[700px]:grid-cols-2">
          {a.findings.map((f, k) => {
            const body = <><span className="mr-1 font-semibold">{f.tone === 'risk' ? 'Risk' : f.tone === 'watch' ? 'Watch' : f.tone === 'good' ? 'Good' : 'Note'}:</span>{f.text}</>
            return f.drill ? (
              <button key={k} type="button" onClick={() => onDrill(f.drill!)} title="Drill into it"
                className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-snug hover:brightness-95 ${TONE[f.tone]}`}>{body} <span className="font-semibold underline">Drill in →</span></button>
            ) : (
              <div key={k} className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${TONE[f.tone]}`}>{body}</div>
            )
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-1.5 @[520px]:grid-cols-3 @[860px]:grid-cols-6">
        {kpi('Completion', `${a.completion}%`, `${a.done} of ${a.n} approved`, '#10b981')}
        {kpi('Schedule adherence', `${a.adherence}%`, `of ${a.dueByToday} due by today`, a.adherence >= 80 ? '#10b981' : a.adherence >= 50 ? '#d97706' : '#dc2626')}
        {kpi('On-time approvals', `${a.onTimeRate}%`, `${a.onTime} of ${a.done} by planned end`, '#2153f5')}
        {kpi('Overdue', String(a.overdue), a.overdue ? `avg ${a.avgLate} days late` : 'none late', WORK_BUCKET_COLORS.Delayed)}
        {kpi('NG / rework', String(a.ng), `${a.n ? Math.round((a.ng / a.n) * 100) : 0}% of activities`, WORK_BUCKET_COLORS.NG)}
        {kpi('Due in 30 days', String(a.in30), 'open, not yet late', '#6d28d9')}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 @[860px]:grid-cols-2">
        {card('Progress vs plan', a.curve.length ? (
          <div className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={a.curve} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="date" fontSize={9.5} stroke="#98a2b3" tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis fontSize={9.5} stroke="#98a2b3" allowDecimals={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Area type="monotone" dataKey="planned" name="Planned (due)" stroke="#94a3b8" fill="#e2e8f0" strokeDasharray="4 3" isAnimationActive={false} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#10b981" fill="#10b98133" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                {todayTick && <ReferenceLine x={todayTick} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 9.5, fill: '#ef4444' }} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-8 text-center text-[11px] text-[var(--color-muted)]">No planned dates yet.</p>, 'cumulative · gap = behind plan')}

        {card('Where open work waits', a.taskRows.length ? (
          <div style={{ height: Math.max(150, a.taskRows.length * 24 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.taskRows} layout="vertical" margin={{ top: 2, right: 10, left: 0, bottom: 0 }} barCategoryGap={5}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" fontSize={9.5} stroke="#98a2b3" allowDecimals={false} tickLine={false} />
                <YAxis type="category" dataKey="task" width={124} fontSize={10} stroke="#475467" tickLine={false} axisLine={false} interval={0} />
                <Tooltip {...tip} />
                <Bar dataKey="onTime" name="On time" stackId="t" fill="#3b82f6" maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="overdue" name="Overdue" stackId="t" fill={WORK_BUCKET_COLORS.Delayed} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-8 text-center text-[11px] text-[var(--color-muted)]">No open work.</p>, 'current task in the flow')}

        {card('Overdue ageing', (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.ages} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="band" fontSize={10} stroke="#98a2b3" tickLine={false} />
                <YAxis fontSize={9.5} stroke="#98a2b3" allowDecimals={false} tickLine={false} />
                <Tooltip {...tip} />
                <Bar dataKey="n" name="Overdue activities" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} label={{ position: 'top', fontSize: 10, fill: '#344054' }}>
                  {a.ages.map((x, k) => <Cell key={x.band} fill={['#fbbf24', '#f59e0b', '#ea580c', '#dc2626'][k]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ), 'days past planned end')}

        {card('Coming due', (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.weeks} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="week" fontSize={9.5} stroke="#98a2b3" tickLine={false} interval={0} />
                <YAxis fontSize={9.5} stroke="#98a2b3" allowDecimals={false} tickLine={false} />
                <Tooltip {...tip} />
                <Bar dataKey="n" name="Open activities due" fill="#6d28d9" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} label={{ position: 'top', fontSize: 10, fill: '#344054' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ), 'next 6 weeks, by planned end')}
      </div>
    </div>
  )
}

/**
 * The tile's own details, first in its panel: which models, which parts, which vendors (with their numbers), or for
 * an activity tile the activities themselves. A row drills the panel into it (an activity row opens its form).
 */
function TileDetails({ kind, items, color, onPick, onOpen, trials }: {
  kind: 'models' | 'vendors' | 'parts' | 'activities'
  items: FilteredInstance[]
  color: string
  /** Narrow the panel (and optionally say what the list shows next). */
  onPick: (picks: { dim: Dim; value: string }[], detail?: DetailKind) => void
  onOpen: (i: FilteredInstance) => void
  trials?: string[]
}) {
  const { partReleases, partAcks } = useQAStore()
  const onDrill = (dim: Dim, value: string) => onPick([{ dim, value }])
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState(true)
  // Second tab: Activity Update on the ticked rows (or everything listed when none is ticked).
  const [tab, setTab] = useState<'details' | 'update'>('details')
  const [maxed, setMaxed] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const LIMIT = 8
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  type Row = { key: string; cells: React.ReactNode[]; onClick: () => void; title: string; xs: FilteredInstance[] }
  const { head, rows } = useMemo((): { head: string[]; rows: Row[] } => {
    const group = (f: (i: FilteredInstance) => string) => {
      const m = new Map<string, FilteredInstance[]>()
      for (const i of items) { const k = f(i); m.set(k, [...(m.get(k) ?? []), i]) }
      return [...m.entries()]
    }
    const stats = (xs: FilteredInstance[]) => {
      const done = xs.filter((i) => i.status === 'Approved').length
      return {
        n: xs.length, done, od: xs.filter((i) => workBucket(i) === 'Delayed').length, ng: xs.filter((i) => workBucket(i) === 'NG').length,
        bar: (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#eef2f7]"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct(done, xs.length)}%` }} /></span>
            <span className="tabular-nums">{pct(done, xs.length)}%</span>
          </span>
        ),
      }
    }
    // Every number opens what it counts: e.g. a model's Parts → that model's parts; its Overdue → those activities.
    const link = (v: React.ReactNode, title: string, go: () => void, cls = '') => (
      <button type="button" title={title} onClick={(e) => { e.stopPropagation(); go() }}
        className={`rounded px-1 tabular-nums underline decoration-dotted underline-offset-2 hover:bg-[#eef4ff] hover:text-[var(--color-primary)] ${cls}`}>{v}</button>
    )
    const numbers = (dim: Dim, value: string, name: string, s: ReturnType<typeof stats>, first: { label: string; n: React.ReactNode; detail: DetailKind }[]) => [
      ...first.map((f) => link(f.n, `${name}: ${f.label}`, () => onPick([{ dim, value }], f.detail))),
      link(s.n, `${name}: all activities`, () => onPick([{ dim, value }], 'activities')),
      <span key="c" className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {link(s.bar, `${name}: completed activities`, () => onPick([{ dim, value }, { dim: 'status', value: 'Completed' }], 'activities'))}
      </span>,
      s.od ? link(s.od, `${name}: overdue activities`, () => onPick([{ dim, value }, { dim: 'status', value: 'Delayed' }], 'activities'), 'font-semibold text-amber-600') : <span key="o" className="px-1 tabular-nums">0</span>,
      s.ng ? link(s.ng, `${name}: NG / rework activities`, () => onPick([{ dim, value }, { dim: 'status', value: 'NG' }], 'activities'), 'font-semibold text-red-600') : <span key="n" className="px-1 tabular-nums">0</span>,
    ]
    const bySort = (a: Row, b: Row) => (b as Row & { sort: number }).sort - (a as Row & { sort: number }).sort
    if (kind === 'models') {
      return {
        head: ['Model', 'Parts', 'Vendors', 'Activities', 'Completed', 'Overdue', 'NG'],
        rows: group((i) => i.part.model).map(([m, xs]) => { const s = stats(xs); return {
          xs, key: m, title: `Drill into ${m}`, onClick: () => onDrill('model', m),
          cells: [<strong key="m" className="text-[#101828]">{m}</strong>, ...numbers('model', m, m, s, [
            { label: 'its parts', n: new Set(xs.map((i) => i.part.partNo)).size, detail: 'parts' },
            { label: 'its vendors', n: new Set(xs.map((i) => i.part.vendorCode)).size, detail: 'vendors' },
          ])],
          sort: s.od * 1000 + s.ng } }).sort(bySort),
      }
    }
    if (kind === 'vendors') {
      return {
        head: ['Vendor', 'Parts', 'Models', 'Activities', 'Completed', 'Overdue', 'NG'],
        rows: group((i) => i.part.vendorCode || i.part.vendorName).map(([v, xs]) => { const s = stats(xs); const p = xs[0].part; return {
          xs, key: v, title: `Drill into ${p.vendorName}`, onClick: () => onDrill('vendor', v),
          cells: [<span key="v"><span className="font-mono text-[10px] text-[var(--color-muted)]">{p.vendorCode}</span> <strong className="text-[#101828]">{p.vendorName}</strong></span>, ...numbers('vendor', v, p.vendorName, s, [
            { label: 'its parts', n: new Set(xs.map((i) => i.part.partNo)).size, detail: 'parts' },
            { label: 'its models', n: [...new Set(xs.map((i) => i.part.model))].join(', '), detail: 'models' },
          ])],
          sort: s.od * 1000 + s.ng } }).sort(bySort),
      }
    }
    if (kind === 'parts') {
      return {
        head: ['Part', 'Model', 'Vendor', 'Activities', 'Completed', 'Overdue', 'NG'],
        rows: group((i) => i.part.partNo).map(([no, xs]) => { const s = stats(xs); const p = xs[0].part; return {
          xs, key: no, title: `Drill into ${no}`, onClick: () => onDrill('part', no),
          cells: [<span key="p"><span className="font-mono text-[#101828]">{no}</span> <span className="text-[var(--color-muted)]">{p.partName}</span></span>,
            link(p.model, `${p.model}: its parts`, () => onPick([{ dim: 'model', value: p.model }], 'parts')),
            link(`${p.vendorCode}: ${p.vendorName}`, `${p.vendorName}: its parts`, () => onPick([{ dim: 'vendor', value: p.vendorCode || p.vendorName }], 'parts')),
            ...numbers('part', no, no, s, [])],
          sort: s.od * 1000 + s.ng } }).sort(bySort),
      }
    }
    // Activities: the items themselves, most late first.
    const late = (i: FilteredInstance) => (i.dates.status === 'resolved' ? Math.round((Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${i.dates.end}T00:00:00Z`)) / 86_400_000) : -999)
    return {
      head: ['Part', 'Activity', 'Trial', 'Planned end', 'Task now', 'Status'],
      rows: [...items].sort((a, b) => late(b) - late(a)).map((i) => {
        const b = workBucket(i)
        const d = late(i)
        return {
          xs: [i], key: `${i.row.id}|${i.part.partNo}`, title: 'Open the activity form', onClick: () => onOpen(i),
          cells: [
            <span key="p"><span className="font-mono text-[#101828]">{i.part.partNo}</span> <span className="text-[var(--color-muted)]">{i.part.model}</span></span>,
            i.activity.name, trialLabelOf(i.row.milestoneId),
            <span key="e" className="whitespace-nowrap">{i.dates.status === 'resolved' ? fmtDate(i.dates.end) : '—'}{b === 'Delayed' && d > 0 ? <span className="ml-1 font-semibold text-amber-600">+{d} d</span> : null}</span>,
            taskOf(i, { releases: partReleases, acks: partAcks }) ?? '—',
            b ? <span key="s" className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold text-white" style={{ background: WORK_BUCKET_COLORS[b] }}>{b === 'Delayed' ? 'Overdue' : b}</span> : '—',
          ],
        }
      }),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, items, onPick, onOpen, partReleases, partAcks])
  const shown = all ? rows : rows.slice(0, LIMIT)
  const noun = { models: 'model', vendors: 'vendor', parts: 'part', activities: 'activit' }[kind]
  const plural = (n: number) => (kind === 'activities' ? (n === 1 ? 'activity' : 'activities') : `${noun}${n === 1 ? '' : 's'}`)
  // Ticks that still match a listed row; the update tab works on those rows' activities, else on all listed.
  const tickedRows = rows.filter((r) => picked.has(r.key))
  const chosen = useMemo(() => {
    const src = tickedRows.length ? tickedRows.flatMap((r) => r.xs) : items
    const seen = new Set<string>()
    return src.filter((i) => { const k = `${i.row.id}|${i.part.partNo}`; if (seen.has(k)) return false; seen.add(k); return true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickedRows.length, picked, rows, items])
  const allTicked = rows.length > 0 && tickedRows.length === rows.length
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const tabCls = (on: boolean) => `px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide ${on ? 'text-[#101828]' : 'text-[var(--color-muted)] hover:text-[#344054]'}`
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white" data-tile-details={kind}>
      <div className="flex items-center gap-1 pr-2" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => { setTab('details'); setOpen(true) }} className={`${tabCls(tab === 'details')} pl-3`}>
          Which {kind} <span className="ml-1 rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ color, background: `${color}14` }}>{rows.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'update'} onClick={() => { setTab('update'); setOpen(true) }} className={tabCls(tab === 'update')}>
          Activity Update <span className="ml-1 rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ color, background: `${color}14` }}>{chosen.length}</span>
        </button>
        <span className="ml-auto hidden text-[9.5px] text-[var(--color-muted)] sm:inline">
          {tab === 'update' ? (tickedRows.length ? `for the ${tickedRows.length} ticked ${plural(tickedRows.length)}` : 'for everything listed (tick rows to choose)') : kind === 'activities' ? 'tick rows to update them, or click a row to open it' : 'tick rows to update them, click a name to drill in, a number to list it'}
        </span>
        {tab === 'update' && open && (
          <button type="button" onClick={() => setMaxed(true)} aria-label="Maximize Activity Update" title="Maximize (full screen)" data-export-ignore="true"
            className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} className="rounded p-1 hover:bg-[var(--color-surface)]">
          <FbIcon name="chevron-down" size={12} className={open ? '' : '-rotate-90'} />
        </button>
      </div>
      {open && tab === 'update' && (
        <div className="border-t border-[var(--color-border)] p-2.5" data-screen-update>
          <MaximizeHost max={maxed} onRestore={() => setMaxed(false)} title={`Activity Update · ${chosen.length} ${chosen.length === 1 ? 'activity' : 'activities'}`}>
            <ActivityUpdatePanel instances={chosen} partCount={new Set(chosen.map((i) => i.part.partNo)).size} trials={trials} />
          </MaximizeHost>
        </div>
      )}
      {open && tab === 'details' && (
        <>
          <div className="max-h-[300px] overflow-auto border-t border-[var(--color-border)]">
            <table className="w-full text-[10.5px]">
              <thead className="sticky top-0"><tr className="text-left">
                <th className="w-7 px-2.5 py-1.5"><input type="checkbox" aria-label="Tick all" checked={allTicked} onChange={() => setPicked(allTicked ? new Set() : new Set(rows.map((r) => r.key)))} /></th>
                {head.map((h) => <th key={h} className="px-2.5 py-1.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} onClick={r.onClick} title={r.title} className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Tick ${r.key}`} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />
                    </td>
                    {r.cells.map((c, k) => <td key={k} className="px-2.5 py-1.5 text-[#344054]">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > LIMIT && (
            <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-[var(--color-border)] px-2.5 py-1 text-left text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
              {all ? `Show first ${LIMIT}` : `Show all ${rows.length} ${plural(rows.length)}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Shows its children in place, or over the whole screen when `max` (Restore or Esc to go back). The children's DOM
 * node is moved to <body> while maximized (a fixed overlay inside the panel would be clipped), so what was typed stays.
 */
function MaximizeHost({ max, onRestore, title, children }: { max: boolean; onRestore: () => void; title: string; children: React.ReactNode }) {
  const [host] = useState(() => document.createElement('div'))
  const slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (max) {
      host.className = 'epmp-shell fixed inset-0 z-[60] overflow-auto p-5'
      document.body.appendChild(host)
    } else {
      host.className = ''
      slot.current?.appendChild(host)
    }
  }, [max, host])
  useEffect(() => () => { host.remove() }, [host])
  useEffect(() => {
    if (!max) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) onRestore() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [max, onRestore])
  return (
    <>
      <div ref={slot} />
      {createPortal(
        <>
          {max && (
            <div className="sticky top-0 z-20 -mx-5 -mt-5 mb-3 flex items-center gap-2 bg-white/80 px-5 py-2 backdrop-blur" data-export-ignore="true">
              <span className="text-[12px] font-semibold text-[var(--color-text)]">{title}</span>
              <span className="text-[10.5px] text-[var(--color-muted)]">· full screen</span>
              <button type="button" onClick={onRestore} title="Back to the page (Esc)" data-restore-update
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-[#344054] hover:bg-[var(--color-surface)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg> Restore
              </button>
            </div>
          )}
          {children}
        </>,
        host
      )}
    </>
  )
}
