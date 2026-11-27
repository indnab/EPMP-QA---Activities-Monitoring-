/**
 * Workspace → My Parts: a blank canvas with the My Work tiles as buttons along the top. Clicking a tile adds a
 * dashboard panel for it: a summary (activities, parts, models, vendors) and a breakdown, by Model first. Clicking a
 * bar drills one level down (Model → Trial → Vendor → Part → Activity list); the breadcrumb goes back up, and the
 * "Group by" picks another breakdown at any level. In the activity list a row opens the activity form.
 * The panels (and where each is drilled to) are remembered in this browser. The page filters apply.
 */
import { useBundleTag, useMainPartCls } from '../bundleHooks'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon as FbIcon } from '../../components/Icon'
import { pendencyOf, taskOf, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'
import { trialLabelOf } from '../trialLabel'
import { trialStatusFor } from '../../mock/partIntakeFields'
import { ActivityUpdatePanel } from '../activityupdate/ActivityUpdatePage'
import { ColumnFilter } from '../ColumnFilter'
import { mineBucket, useModelStages } from './OverviewTab'
import { isReturnedToPicBySic, isReturnedToVendor } from './workQueue'
import { usePersonaStore } from '../../store/personaStore'
import { ACK_SLA_DAYS, PLAN_SLA_DAYS, RELEASE_SLA_DAYS, usePlanningSla } from '../vendorplanning/planningSla'
import type { PartRecord } from '../../domain'
import type { MineKey } from './OverviewTab'

type Dim = 'model' | 'trial' | 'vendor' | 'part' | 'activity' | 'status' | 'dept'
const DIM_LABEL: Record<Dim, string> = { model: 'Model', trial: 'Trial', vendor: 'Vendor', part: 'Part', activity: 'Activity', status: 'Status', dept: 'Department' }

type Ctx = {
  mine: MineKey | null; bucket: WorkBucket | null; stage: 'under' | 'developed' | 'past' | undefined
  /** Returned to the vendor (by the PIC or SIC) / to the PIC by the SIC or DPM; a vendor delay reason waits for review. */
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
  /** Where the panel was before each drill (newest last), for the Back button. */
  back?: { drill: { dim: Dim; value: string }[]; groupBy?: Dim | 'list'; detail?: DetailKind }[]
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

/** What the Priorities tab lists, and how a pick filters the page (the page owns the filters). */
export interface PriorityProps {
  /** Every activity of the filters in force except Model, Part and Vendor (so the lists stay whole while one is picked). */
  instances: FilteredInstance[]
  selModels: string[]; selParts: string[]; selVendors: string[]
  onModel: (model: string) => void
  onPart: (partNo: string) => void
  onVendor: (code: string) => void
}

export function MyScreen({ instances, parts, onOpen, filters = [], trials, delayKeys, priority }: {
  priority?: PriorityProps
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
    // "Returned to vendor" is the PIC's tile; "Returned to PIC" (approvals the SIC or DPM sent back) follows it for the PIC and for those who return them.
    ...STATIC_TILES.filter((t) => (t.id !== 'r.toVendor' || currentPersona === 'PIC') && (t.id !== 'r.toPic' || currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM') && (t.id !== 't.release' || currentPersona !== 'Vendor')),
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
  const [leftTab, setLeftTab] = useState<'tiles' | 'priorities'>('tiles')
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
        <div className="mb-2 flex items-center gap-1 rounded-lg bg-[#eef0f4] p-0.5" role="tablist" aria-label="Left panel">
          {([['tiles', 'Overview'], ['priorities', 'Priorities']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={leftTab === id} onClick={() => setLeftTab(id)}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold ${leftTab === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{label}</button>
          ))}
        </div>
        {leftTab === 'priorities' ? (
          priority ? <PriorityLists {...priority} stageOf={stageOf} /> : null
        ) : (<>
        <div className="mb-1.5 flex items-center gap-2 px-1">
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
        </>)}
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
  // The tile's details list; once drilled into one model / vendor / part, it lists the next level down.
  const baseKind = tile.detail ?? tile.counts ?? 'activities'
  const kindDim = { models: 'model', vendors: 'vendor', parts: 'part' } as const
  const detailKind: DetailKind = panel.detail ? panel.detail : baseKind === 'none' ? 'activities'
    : baseKind !== 'activities' && used.includes(kindDim[baseKind]) ? (used.includes('part') ? 'activities' : 'parts')
      : baseKind

  // Every move (drill in, a number, the breadcrumb) remembers where the panel was, so Back returns there.
  const go = (to: Partial<Panel>) =>
    onChange({ ...to, back: [...(panel.back ?? []), { drill: panel.drill, groupBy: panel.groupBy, detail: panel.detail }].slice(-20) })
  const backTo = panel.back?.at(-1)
  const goBack = () => { if (backTo) onChange({ ...backTo, back: panel.back!.slice(0, -1) }) }
  return (
    <section className="epmp-card @container flex min-h-[280px] min-w-0 flex-col p-3" aria-label={tile.title} data-screen-panel={panel.tile}>
      <div className="mb-2 flex items-center gap-2">
        <FbIcon name={tile.icon} size={14} style={{ color: tile.color }} />
        <h3 className="text-[12.5px] font-semibold text-[var(--color-text)]">{tile.title}</h3>
        {backTo && (
          <button type="button" onClick={goBack} data-panel-back title="Back to where you drilled in from"
            className="ml-2 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#344054] hover:bg-[var(--color-surface)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </button>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove ${tile.title}`} title="Remove from my screen"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"><FbIcon name="close" size={13} /></button>
      </div>
      {note && <div className="-mt-1 mb-2">{note}</div>}

      {/* Breadcrumb */}
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[10.5px]" aria-label="Drill path">
        <button type="button" onClick={() => go({ drill: tile.drill ?? [], groupBy: tile.groupBy, detail: undefined })} className={panel.drill.length ? 'text-[var(--color-accent)] hover:underline' : 'font-semibold text-[#101828]'}>All</button>
        {panel.drill.map((d, n) => (
          <span key={n} className="inline-flex items-center gap-1">
            <span className="text-[var(--color-muted)]">›</span>
            <button type="button" onClick={() => go({ drill: panel.drill.slice(0, n + 1), groupBy: undefined, detail: undefined })}
              className={n === panel.drill.length - 1 ? 'font-semibold text-[#101828]' : 'text-[var(--color-accent)] hover:underline'}>
              <span className="text-[var(--color-muted)]">{DIM_LABEL[d.dim]}:</span> {labelOf(d.dim, d.value, all)}
            </button>
          </span>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="flex-1 py-6 text-center text-[11px] text-[var(--color-muted)]">Nothing here for the current filters.</p>
      ) : (
        <TileDetails kind={detailKind} items={items} color={tile.color} onOpen={onOpen} trials={trials}
          onPick={(picks, detail) => go({ drill: [...panel.drill.filter((d) => !picks.some((x) => x.dim === d.dim)), ...picks], groupBy: undefined, detail })} />
      )}
    </section>
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
  const { partReleases, partAcks, models: modelRecs } = useQAStore()
  // The model's next trial (PP, MPP, Pilot, SOP) whose date has not passed (the trial only; no date shown).
  const upcoming = (model: string): { label: string; date?: string } => {
    const mrds = modelRecs.find((m) => m.name === model)?.mrds
    const t = trialStatusFor(mrds, DEMO_TODAY)
    return t === 'Completed' || t === '—' ? { label: t === 'Completed' ? 'All trials done' : '—' } : { label: trialLabelOf(t), date: mrds?.[t] }
  }
  const upcomingCell = (model: string) => {
    const u = upcoming(model)
    return (
      <span key="u" className="whitespace-nowrap">
        {u.date ? <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">{u.label}</span> : <span className="text-[var(--color-muted)]">{u.label}</span>}
      </span>
    )
  }
  const mainCls = useMainPartCls()
  const bundleTag = useBundleTag()
  const onDrill = (dim: Dim, value: string) => onPick([{ dim, value }])
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState(true)
  // Second tab: Activity Update on the ticked rows (or everything listed when none is ticked).
  const [tab, setTab] = useState<'details' | 'update'>('details')
  const [maxed, setMaxed] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const LIMIT = 8
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  /** `vals` = what each column sorts on (numbers sort numerically); `ftext` = what its filter box matches (default: vals). */
  type Row = { key: string; cells: React.ReactNode[]; vals: (string | number)[]; ftext?: string[]; onClick: () => void; title: string; xs: FilteredInstance[] }
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
        head: ['Model', 'Upcoming trial', 'Parts', 'Vendors', 'Activities', 'Completed', 'Overdue', 'NG'],
        rows: group((i) => i.part.model).map(([m, xs]) => { const s = stats(xs); return {
          xs, key: m, title: `Drill into ${m}`, onClick: () => onDrill('model', m),
          cells: [<strong key="m" className="text-[#101828]">{m}</strong>, upcomingCell(m), ...numbers('model', m, m, s, [
            { label: 'its parts', n: new Set(xs.map((i) => i.part.partNo)).size, detail: 'parts' },
            { label: 'its vendors', n: new Set(xs.map((i) => i.part.vendorCode)).size, detail: 'vendors' },
          ])],
          vals: [m, upcoming(m).label, new Set(xs.map((i) => i.part.partNo)).size, new Set(xs.map((i) => i.part.vendorCode)).size, s.n, pct(s.done, s.n), s.od, s.ng],
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
          vals: [`${p.vendorCode} ${p.vendorName}`, new Set(xs.map((i) => i.part.partNo)).size, [...new Set(xs.map((i) => i.part.model))].join(', '), s.n, pct(s.done, s.n), s.od, s.ng],
          sort: s.od * 1000 + s.ng } }).sort(bySort),
      }
    }
    if (kind === 'parts') {
      return {
        head: ['Part', 'Model', 'Upcoming trial', 'Vendor', 'Activities', 'Completed', 'Overdue', 'NG'],
        rows: group((i) => i.part.partNo).map(([no, xs]) => { const s = stats(xs); const p = xs[0].part; return {
          xs, key: no, title: `Drill into ${no}`, onClick: () => onDrill('part', no),
          cells: [<span key="p"><span className={`font-mono text-[#101828] ${mainCls(no)}`}>{no}</span> <span className="text-[var(--color-muted)]">{p.partName}{bundleTag(no)}</span></span>,
            link(p.model, `${p.model}: its parts`, () => onPick([{ dim: 'model', value: p.model }], 'parts')),
            upcomingCell(p.model),
            link(`${p.vendorCode}: ${p.vendorName}`, `${p.vendorName}: its parts`, () => onPick([{ dim: 'vendor', value: p.vendorCode || p.vendorName }], 'parts')),
            ...numbers('part', no, no, s, [])],
          vals: [`${no} ${p.partName}`, p.model, upcoming(p.model).label, `${p.vendorCode}: ${p.vendorName}`, s.n, pct(s.done, s.n), s.od, s.ng],
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
          vals: [`${i.part.partNo} ${i.part.model}`, i.activity.name, trialLabelOf(i.row.milestoneId), i.dates.status === 'resolved' ? i.dates.end : '', taskOf(i, { releases: partReleases, acks: partAcks }) ?? '', b ? (b === 'Delayed' ? 'Overdue' : b) : ''],
          ftext: [`${i.part.partNo} ${i.part.model} ${i.part.partName}`, i.activity.name, trialLabelOf(i.row.milestoneId), i.dates.status === 'resolved' ? `${fmtDate(i.dates.end)} ${i.dates.end}` : '', taskOf(i, { releases: partReleases, acks: partAcks }) ?? '', b ? (b === 'Delayed' ? 'Overdue' : b) : ''],
          cells: [
            <span key="p"><span className={`font-mono text-[#101828] ${mainCls(i.part.partNo)}`}>{i.part.partNo}</span> <span className="text-[var(--color-muted)]">{i.part.model}</span></span>,
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
  // Sort by a column header (click: ascending, again: descending, again: back to the default order) and filter each
  // column with its box. Both are remembered per kind of list.
  const [sortBy, setSortBy] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [colFilter, setColFilter] = useState<Record<string, string[]>>({})
  const cid = (c: number) => `${kind}:${c}`
  const listed = useMemo(() => {
    const active = head.map((_, c) => [c, colFilter[cid(c)] ?? []] as const).filter(([, vs]) => vs.length)
    let out = active.length ? rows.filter((r) => active.every(([c, vs]) => vs.includes(String(r.vals[c] ?? '')))) : rows
    const c = sortBy && sortBy.col.startsWith(`${kind}:`) ? Number(sortBy.col.split(':')[1]) : -1
    if (c >= 0 && sortBy) {
      const dir = sortBy.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const x = a.vals[c], y = b.vals[c]
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir
      })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, head, colFilter, sortBy, kind])
  const clickSort = (c: number) => setSortBy((cur) => (!cur || cur.col !== cid(c) ? { col: cid(c), dir: 'asc' } : cur.dir === 'asc' ? { col: cid(c), dir: 'desc' } : null))
  const hasColFilter = head.some((_, c) => (colFilter[cid(c)] ?? []).length > 0)
  // The values each column holds, for its drop-down filter (dates show as dd Mon yyyy).
  const optionsOf = (c: number) => [...new Set(rows.map((r) => String(r.vals[c] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const optLabel = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : v)
  const shown = all ? listed : listed.slice(0, LIMIT)
  const noun = { models: 'model', vendors: 'vendor', parts: 'part', activities: 'activit' }[kind]
  const plural = (n: number) => (kind === 'activities' ? (n === 1 ? 'activity' : 'activities') : `${noun}${n === 1 ? '' : 's'}`)
  // Ticks that still match a listed row; the update tab works on those rows' activities, else on all listed.
  const tickedRows = listed.filter((r) => picked.has(r.key))
  const chosen = useMemo(() => {
    const src = tickedRows.length ? tickedRows.flatMap((r) => r.xs) : listed.flatMap((r) => r.xs)
    const seen = new Set<string>()
    return src.filter((i) => { const k = `${i.row.id}|${i.part.partNo}`; if (seen.has(k)) return false; seen.add(k); return true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickedRows.length, picked, listed])
  const allTicked = listed.length > 0 && tickedRows.length === listed.length
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white" data-tile-details={kind}>
      <div className="flex items-center gap-1 pr-2" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => { setTab('details'); setOpen(true) }} data-details-tab
          className={`epmp-3d-btn-light my-1 ml-2 inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#101828] ${tab === 'details' ? 'is-on' : ''}`}>
          {kind[0].toUpperCase() + kind.slice(1)} <span className="rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ color, background: `${color}1f` }}>{listed.length}</span>
        </button>
        {/* Activity Update stands out as a raised blue button with white text (pressed in while open); fixed size, never wraps. */}
        <button type="button" role="tab" aria-selected={tab === 'update'} onClick={() => { setTab('update'); setOpen(true) }} data-update-tab
          className={`epmp-3d-btn my-1 ml-1 inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[10.5px] font-semibold uppercase tracking-wide text-white ${tab === 'update' ? 'is-on' : ''}`}>
          Activity Update <span className="rounded-full bg-white/25 px-1.5 text-[10.5px] font-bold tabular-nums text-white">{chosen.length}</span>
        </button>
        <span className="ml-auto hidden min-w-0 truncate text-[9.5px] text-[var(--color-muted)] sm:inline">
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
            <ActivityUpdatePanel instances={chosen} partCount={new Set(chosen.map((i) => i.part.partNo)).size} trials={trials} fill={maxed} />
          </MaximizeHost>
        </div>
      )}
      {open && tab === 'details' && (
        <>
          <div className="max-h-[300px] overflow-auto border-t border-[var(--color-border)]">
            <table className="w-full text-[10.5px]">
              <thead className="sticky top-0"><tr className="text-left">
                <th className="w-7 px-2.5 py-1.5"><input type="checkbox" aria-label="Tick all" checked={allTicked} onChange={() => setPicked(allTicked ? new Set() : new Set(listed.map((r) => r.key)))} /></th>
                {head.map((h, c) => {
                  const on = sortBy?.col === cid(c)
                  return (
                    <th key={h} className="px-2.5 py-1.5" aria-sort={on ? (sortBy!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => clickSort(c)} title={`Sort by ${h}`} className="inline-flex items-center gap-1 font-medium hover:text-[var(--color-primary)]">
                        {h}<span className={on ? 'text-[var(--color-primary)]' : 'text-[#98a2b3]'} aria-hidden="true">{on ? (sortBy!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    </th>
                  )
                })}
              </tr>
              <tr className="text-left">
                <th className="px-2.5 pb-1.5">{hasColFilter && <button type="button" onClick={() => setColFilter({})} title="Clear the column filters" className="text-[10px] font-semibold text-[var(--color-accent)] hover:underline">Clear</button>}</th>
                {head.map((h, c) => (
                  <th key={h} className="px-2.5 pb-1.5 font-normal">
                    <ColumnFilter label={h} options={optionsOf(c)} selected={colFilter[cid(c)] ?? []} format={optLabel} minWidth={64}
                      onChange={(next) => setColFilter((f) => ({ ...f, [cid(c)]: next }))} />
                  </th>
                ))}
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
          {listed.length > LIMIT && (
            <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-[var(--color-border)] px-2.5 py-1 text-left text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
              {all ? `Show first ${LIMIT}` : `Show all ${listed.length} ${plural(listed.length)}`}
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
  // While full screen, the floating AI button and chat are hidden (see index.css).
  useEffect(() => {
    document.body.classList.toggle('epmp-max-open', max)
    return () => document.body.classList.remove('epmp-max-open')
  }, [max])
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

/**
 * The Priorities tab: priority models, parts and vendors. Each is ranked by what needs attention first (delayed and NG
 * activities), with its done / delayed / NG counts. Picking one filters the page to it; picking it again clears it.
 */
function PriorityLists({ instances, selModels, selParts, selVendors, onModel, onPart, onVendor, stageOf }: PriorityProps & { stageOf: Map<string, string> }) {
  type Item = { key: string; title: string; sub: string; done: number; delayed: number; ng: number; badge?: string }
  const rank = (keyOf: (i: FilteredInstance) => string, make: (xs: FilteredInstance[], k: string) => { title: string; sub: string; badge?: string }): Item[] => {
    const m = new Map<string, FilteredInstance[]>()
    for (const i of instances) { const k = keyOf(i); if (k) m.set(k, [...(m.get(k) ?? []), i]) }
    return [...m.entries()].map(([k, xs]) => ({
      key: k, ...make(xs, k),
      done: xs.filter((i) => i.status === 'Approved').length,
      delayed: xs.filter((i) => workBucket(i) === 'Delayed').length,
      ng: xs.filter((i) => workBucket(i) === 'NG').length,
    })).sort((a, b) => (b.delayed + b.ng) - (a.delayed + a.ng) || b.delayed - a.delayed || a.title.localeCompare(b.title))
  }
  const models = useMemo(() => rank((i) => i.part.model, (xs, k) => ({ title: k, sub: `${new Set(xs.map((x) => x.part.partNo)).size} parts`, badge: stageOf.get(k) === 'developed' ? 'Developed' : 'Under dev.' })), [instances, stageOf]) // eslint-disable-line react-hooks/exhaustive-deps
  const partsL = useMemo(() => rank((i) => i.part.partNo, (xs) => ({ title: xs[0].part.partNo, sub: `${xs[0].part.partName} · ${xs[0].part.model}` })), [instances]) // eslint-disable-line react-hooks/exhaustive-deps
  const vendors = useMemo(() => rank((i) => i.part.vendorCode || i.part.vendorName, (xs) => ({ title: xs[0].part.vendorName || xs[0].part.vendorCode, sub: `${xs[0].part.vendorCode} · ${new Set(xs.map((x) => x.part.partNo)).size} parts` })), [instances]) // eslint-disable-line react-hooks/exhaustive-deps
  // One page size (3 or 6 per page) for the three lists.
  const [pageSize, setPageSize] = useState<3 | 6>(3)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-[var(--color-muted)]">
        <span>Per page</span>
        <div className="inline-flex rounded-md bg-[#eef0f4] p-0.5" role="group" aria-label="Items per page">
          {([3, 6] as const).map((n) => (
            <button key={n} type="button" onClick={() => setPageSize(n)} aria-pressed={pageSize === n}
              className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${pageSize === n ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{n}</button>
          ))}
        </div>
      </div>
      <PrioritySection title="Priority Models" items={models} sel={selModels} onPick={onModel} pageSize={pageSize} />
      <PrioritySection title="Priority Parts" items={partsL} sel={selParts} onPick={onPart} pageSize={pageSize} />
      <PrioritySection title="Priority Vendors" items={vendors} sel={selVendors} onPick={onVendor} pageSize={pageSize} />
    </div>
  )
}
function PrioritySection({ title, items, sel, onPick, pageSize }: {
  title: string
  items: { key: string; title: string; sub: string; done: number; delayed: number; ng: number; badge?: string }[]
  sel: string[]; onPick: (key: string) => void; pageSize: number
}) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const shown = items.slice(cur * pageSize, cur * pageSize + pageSize)
  return (
    <section aria-label={title}>
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-wide text-[#344054]">{title}</h4>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold tabular-nums text-primary">{items.length}</span>
        <span className="ml-auto text-[9.5px] text-[var(--color-muted)]">delayed / NG first</span>
      </div>
      {items.length === 0 ? <p className="px-1 py-2 text-[10.5px] text-[var(--color-muted)]">Nothing here for the current filters.</p> : (
        <ul className="space-y-1">
          {shown.map((it) => {
            const on = sel.includes(it.key)
            const hot = it.delayed + it.ng > 0
            return (
              <li key={it.key}>
                <button type="button" onClick={() => onPick(it.key)} aria-pressed={on} data-priority-item={it.key} title={`${it.title} · ${it.sub}`}
                  className={`w-full rounded-lg border px-2 py-1 text-left transition-colors ${on ? 'border-[#bfdbfe] bg-secondary' : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]'}`}
                  style={{ boxShadow: `inset 3px 0 0 ${hot ? '#dc2626' : '#10b981'}` }}>
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#101828]">{it.title}</span>
                    {it.badge && <span className="flex-none rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-semibold text-blue-700">{it.badge}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-[9.5px] text-[var(--color-muted)]">
                    <span className="min-w-0 flex-1 truncate">{it.sub}</span>
                    <span className="flex-none"><strong className="text-emerald-600">{it.done}</strong> done</span>
                    <span className="flex-none"><strong className="text-amber-500">{it.delayed}</strong> late</span>
                    <span className="flex-none"><strong className="text-red-600">{it.ng}</strong> NG</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > pageSize && (
        <div className="mt-1 flex items-center justify-between px-1 text-[10.5px] text-[var(--color-muted)]">
          <button type="button" onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label={`Previous ${title} page`}
            className="rounded px-1.5 py-0.5 font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)] disabled:opacity-30">‹ Prev</button>
          <span className="tabular-nums" aria-live="polite">{cur * pageSize + 1}–{Math.min(items.length, cur * pageSize + pageSize)} of {items.length}</span>
          <button type="button" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label={`Next ${title} page`}
            className="rounded px-1.5 py-0.5 font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)] disabled:opacity-30">Next ›</button>
        </div>
      )}
    </section>
  )
}
