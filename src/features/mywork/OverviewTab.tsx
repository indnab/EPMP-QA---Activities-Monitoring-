/**
 * My Workspace → Overview building blocks: compact KPI segments (Parts, Activities, Models) that sit beside the
 * "Workspace by" chart, and the model-wise cards (priority models face up, the rest behind "More models").
 * Every number opens the matching list.
 *
 * Development stage of a model, from its SOP date (its archetype's last milestone date): before SOP = under
 * development; SOP to SOP + 3 months = developed; after SOP + 3 months it drops out of these counts.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon as FbIcon } from '../../components/Icon'
import type { PartRecord } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { milestoneRows } from '../../domain/wbsTree'
import { bucketTotals, pendencyOf, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import { isReturnedToPicBySic, isReturnedToVendor, returnedTo } from './workQueue'
import { usePersonaStore } from '../../store/personaStore'
import { CollapseButton, useCollapsed } from '../collapse'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY } from '../scope'
import { ExportSection } from '../export/ExportSection'
import { Grip, sortableCls, useSortable } from '../sortable'
import type { ReactNode } from 'react'

/** Roles an activity can be pending at (see engine.pendencyOf). */
export const PEND_ROLES = ['PIC', 'SIC', 'Vendor', 'DPM'] as const
export type PendRole = (typeof PEND_ROLES)[number]

/** "My Pending Activities" buckets: who has to act next on an open activity. */
export const MINE_KEYS = ['picUpdate', 'vendorUpdate', 'approvePIC', 'approveSIC', 'approveDPM'] as const
export type MineKey = (typeof MINE_KEYS)[number]
/**
 * Who has to act next on an open activity: data entry by the PIC or the Vendor, or an MSIL approval (a submitted
 * activity waiting at the PIC, SIC or DPM step of its flow). Together they are every open activity.
 */
export function mineBucket(p: { role: string } | null, status: string): MineKey | null {
  if (!p) return null
  if (status === 'Submitted') return p.role === 'SIC' ? 'approveSIC' : p.role === 'DPM' ? 'approveDPM' : 'approvePIC'
  return p.role === 'Vendor' ? 'vendorUpdate' : p.role === 'PIC' ? 'picUpdate' : null
}

export type OverviewGo = (
  t: 'overview' | 'actions' | 'worklist' | 'insights' | 'calendar',
  payload?: { bucket?: WorkBucket; focus?: string; group?: string; seg?: 'enter' | 'approve' | 'sentback'; ret?: 'vendor' | 'pic'; pend?: PendRole; mine?: MineKey }
) => void

/** Compact KPI tile: label on top, number below. */
function KpiCard({ title, value, color, icon, onClick, hint }: { title: string; value: number; color: string; icon: string; onClick?: () => void; hint?: string }) {
  const body = (
    <>
      <span className="flex min-w-0 items-start gap-1.5 text-[10.5px] font-medium leading-[14px] text-[#475467]">
        <FbIcon name={icon} size={12} style={{ color }} className="mt-px flex-none" />
        <span className="min-w-0 break-words">{title}</span>
      </span>
      <span className="pl-[18px] text-[16px] font-bold leading-none tabular-nums" style={{ color }}>{value}</span>
    </>
  )
  const cls = 'flex min-h-[58px] min-w-0 flex-col justify-between gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} title={hint ?? title} data-export-stat={title} data-export-stat-value={value}
      className={`${cls} transition-colors hover:border-[#bfdbfe] hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={hint ?? title} data-export-stat={title} data-export-stat-value={value}>{body}</div>
  )
}

interface Tile {
  id: string
  title: string
  value: number
  color: string
  icon: string
  onClick?: () => void
  hint?: string
  /** Sub-heading the tile sits under inside its card (tiles of a group stay together). */
  group?: string
}

/** Which KPI tiles are hidden (remembered on this screen as the default). */
/** Which KPI tiles are hidden, and the order the user dragged them into, per card (remembered on this screen). */
const useHiddenTiles = create<{
  hidden: string[]
  set: (ids: string[]) => void
  order: Record<string, string[]>
  setOrder: (segment: string, ids: string[]) => void
}>()(
  persist(
    (set) => ({
      hidden: [],
      set: (hidden) => set({ hidden }),
      order: {},
      setOrder: (segment, ids) => set((st) => ({ order: { ...st.order, [segment]: ids } })),
    }),
    { name: 'qa-tracker-hidden-tiles', version: 1 }
  )
)

/** Tiles in the saved order; tiles not in it (e.g. new ones) keep their place after the ordered ones. */
function inSavedOrder(tiles: Tile[], order: string[] | undefined): Tile[] {
  if (!order?.length) return tiles
  const pos = new Map(order.map((id, n) => [id, n]))
  return tiles.map((t, n) => ({ t, k: pos.get(t.id) ?? order.length + n })).sort((a, b) => a.k - b.k).map((x) => x.t)
}

/** Gear menu listing a card's tiles with a tick each; unticked tiles are hidden. */
function TilePicker({ title, tiles }: { title: string; tiles: Tile[] }) {
  const { hidden, set } = useHiddenTiles()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const ids = tiles.map((t) => t.id)
  const shownCount = ids.filter((id) => !hidden.includes(id)).length
  const toggle = (id: string) => set(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id])
  return (
    <div ref={ref} className="relative" data-export-ignore="true">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} aria-label={`Choose ${title} tiles`}
        title="Choose which tiles to show"
        className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold normal-case tracking-normal hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${shownCount < ids.length ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}>
        <FbIcon name="cog" size={13} />{shownCount < ids.length && <span>{shownCount}/{ids.length}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[10.5px] font-normal normal-case tracking-normal text-[#344054] shadow-lg">
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Show {title} tiles</div>
          {tiles.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-surface)]">
              <input type="checkbox" checked={!hidden.includes(t.id)} onChange={() => toggle(t.id)} />
              <FbIcon name={t.icon} size={11} style={{ color: t.color }} />
              <span>{t.title}</span>
            </label>
          ))}
          <div className="mt-1 flex gap-1 border-t border-[var(--color-border)] pt-1">
            <button type="button" onClick={() => set(hidden.filter((x) => !ids.includes(x)))} className="flex-1 rounded px-2 py-1 text-left font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]">Show all</button>
            <button type="button" onClick={() => set([...new Set([...hidden, ...ids])])} className="flex-1 rounded px-2 py-1 text-right font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)]">Hide all</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Segment({ id, title, icon, tiles: given, className = '', grip }: { id: string; title: string; icon: string; tiles: Tile[]; className?: string; grip?: ReactNode }) {
  const [collapsed, toggle] = useCollapsed(id)
  const { hidden, order, setOrder } = useHiddenTiles()
  const tiles = inSavedOrder(given, order[id])
  const visible = tiles.filter((t) => !hidden.includes(t.id))
  // Drag a tile onto another to move it there (the new order is remembered).
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const drop = (target: string) => {
    if (!dragId || dragId === target) return
    const ids = tiles.map((t) => t.id).filter((x) => x !== dragId)
    ids.splice(ids.indexOf(target), 0, dragId)
    setOrder(id, ids)
  }
  return (
    <section className={`epmp-card p-3 ${collapsed ? '' : 'h-full'} ${className}`}>
      <h3 className={`flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#344054] ${collapsed ? '' : 'mb-2'}`}>
        {grip}<FbIcon name={icon} size={12} />{title}
        <span className="ml-auto flex items-center gap-0.5">
          {order[id]?.length ? (
            <button type="button" onClick={() => setOrder(id, [])} title="Back to the default order" data-export-ignore="true"
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">Reset order</button>
          ) : null}
          <TilePicker title={title} tiles={tiles} />
          <CollapseButton collapsed={collapsed} onToggle={toggle} label={title} />
        </span>
      </h3>
      {!collapsed && (visible.length === 0 ? (
        <p className="py-2 text-[10.5px] text-[var(--color-muted)]">All tiles hidden. Use <FbIcon name="cog" size={11} /> to show them.</p>
      ) : (
        <div className="space-y-2.5">
        {[...new Set(visible.map((t) => t.group ?? ''))].map((g) => (
        <div key={g}>
        {g && <h4 className="mb-1.5 text-[10px] font-semibold text-[var(--color-muted)]">{g}</h4>}
        <div className={TILE_GRID}>
          {visible.filter((t) => (t.group ?? '') === g).map(({ id: tid, group: _g, ...t }) => (
            <div key={tid} draggable title="Drag to reorder"
              onDragStart={(e) => { setDragId(tid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tid) }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(tid) } }}
              onDragLeave={() => setOverId((o) => (o === tid ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(tid); setOverId(null) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              className={`grid cursor-grab rounded-lg active:cursor-grabbing ${dragId === tid ? 'opacity-40' : ''} ${overId === tid && dragId !== tid ? 'ring-2 ring-[var(--color-primary)] ring-offset-1' : ''}`}>
              <KpiCard {...t} />
            </div>
          ))}
        </div>
        </div>
        ))}
        </div>
      ))}
    </section>
  )
}

/** Tiles flow into as many columns as fit, never narrower than 120px, so labels are never clipped. */
const TILE_GRID = 'grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]'

const addMonths = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}

/** Development stage per model (see the file comment). */
export function useModelStages(parts: PartRecord[]) {
  const { models, projects, archetypes } = useQAStore()
  return useMemo(() => {
    const out = new Map<string, 'under' | 'developed' | 'past'>()
    for (const name of new Set(parts.map((p) => p.model))) {
      const m = models.find((x) => x.name === name)
      const prj = projectOfModel(name, projects)
      const last = milestoneRows(archetypes.find((a) => a.id === prj?.archetypeId)).at(-1)
      const sop = (m && last && m.mrds[last.id]) || m?.mrds.SOP
      out.set(name, !sop || DEMO_TODAY <= sop ? 'under' : DEMO_TODAY <= addMonths(sop, 3) ? 'developed' : 'past')
    }
    return out
  }, [parts, models, projects, archetypes])
}

/** The Overdue tiles, by who has to act next (see mineBucket). */
export const OVERDUE_TILES: [MineKey, string][] = [
  ['picUpdate', 'PIC data entry overdue'],
  ['vendorUpdate', 'Vendor data entry overdue'],
  ['approvePIC', 'PIC approval overdue'],
  ['approveSIC', 'SIC approval overdue'],
  ['approveDPM', 'DPM approval overdue'],
]

/** Parts / Activities / Models KPI segments, compact, for the left of the "Workspace by" chart. */
export function OverviewKpis({ instances, parts, deletedParts, onShowDeleted, onScope, delayReviews, onGo }: {
  /** The role's activity instances (part × activity), after the page filters. */
  instances: FilteredInstance[]
  /** The role's parts, after the page filters. */
  parts: PartRecord[]
  /** Parts SAP / ENOVIA deleted (off the work screens), after the page filters. */
  deletedParts: number
  onShowDeleted: () => void
  /** Scope tile click: select these models / parts (and status) in the page filters and open Activity Update. */
  onScope: (pick: { models: string[]; parts: string[]; status?: WorkBucket }) => void
  delayReviews: number
  onGo: OverviewGo
}) {
  const { currentPersona } = usePersonaStore()
  const { picAssignments, partReleases, partAcks } = useQAStore()
  const stageOf = useModelStages(parts)
  // Parts and activities are counted up to SOP + 3 months.
  const counted = useMemo(() => instances.filter((i) => stageOf.get(i.part.model) !== 'past'), [instances, stageOf])
  const totals = useMemo(() => bucketTotals(counted), [counted])
  // Scope: unique models / vendors / parts, under development vs developed (up to SOP + 3 months).
  const scope = useMemo(() => {
    // Parts with at least one NG / rework activity (among the counted activities).
    const ngNos = new Set(counted.filter((i) => workBucket(i) === 'NG').map((i) => i.part.partNo))
    const of = (stage: 'under' | 'developed') => {
      const ps = parts.filter((p) => stageOf.get(p.model) === stage)
      const models = [...new Set(ps.map((p) => p.model))]
      const partNos = [...new Set(ps.map((p) => p.partNo))]
      const ng = partNos.filter((n) => ngNos.has(n))
      return {
        models: models.length,
        vendors: new Set(ps.map((p) => p.vendorCode || p.vendorName).filter(Boolean)).size,
        parts: partNos.length,
        ng: ng.length,
        // What a click selects in the page filters (then Activity Update opens on them).
        pickAll: { models, parts: partNos },
        pickNg: { models: [...new Set(ps.filter((p) => ngNos.has(p.partNo)).map((p) => p.model))], parts: ng, status: 'NG' as const },
      }
    }
    return { under: of('under'), developed: of('developed') }
  }, [parts, stageOf, counted])
  const act = useMemo(() => {
    const toVendor = counted.filter(isReturnedToVendor)
    // Where each open activity is pending right now.
    const mine: Record<MineKey, number> = { picUpdate: 0, vendorUpdate: 0, approvePIC: 0, approveSIC: 0, approveDPM: 0 }
    // Overdue (past the planned end, not approved), split by who has to act next.
    const overdue: Record<MineKey, number> = { picUpdate: 0, vendorUpdate: 0, approvePIC: 0, approveSIC: 0, approveDPM: 0 }
    for (const i of counted) {
      const pend = pendencyOf(i, { picAssignments, releases: partReleases, acks: partAcks, today: DEMO_TODAY })
      const m = mineBucket(pend, i.status)
      if (m) mine[m] += 1
      if (m && workBucket(i) === 'Delayed') overdue[m] += 1
    }
    return {
      mine,
      overdue,
      returnedToVendor: toVendor.length,
      returnedToVendorBy: { PIC: toVendor.filter((i) => returnedTo(i)?.by === 'PIC').length, SIC: toVendor.filter((i) => returnedTo(i)?.by === 'SIC').length },
      returnedToPic: counted.filter(isReturnedToPicBySic).length,
    }
  }, [counted, picAssignments, partReleases, partAcks])

  const cards: { id: string; title: string; icon: string; className: string; tiles: Tile[] }[] = [
    { id: 'ov-parts', title: 'Scope', icon: 'list', className: 'min-w-[280px] flex-[3_1_380px]', tiles: [
      { id: 'scope.under.models', group: 'Under Development', title: 'Total unique models', value: scope.under.models, color: '#2153f5', icon: 'grid', hint: 'Models before SOP', onClick: () => onScope(scope.under.pickAll) },
      { id: 'scope.under.vendors', group: 'Under Development', title: 'Total unique vendors', value: scope.under.vendors, color: '#2153f5', icon: 'users', hint: 'Vendors of parts of models before SOP', onClick: () => onScope(scope.under.pickAll) },
      { id: 'scope.under.parts', group: 'Under Development', title: 'Total unique parts', value: scope.under.parts, color: '#2153f5', icon: 'tools', hint: 'Parts of models before SOP', onClick: () => onScope(scope.under.pickAll) },
      { id: 'scope.under.ng', group: 'Under Development', title: 'Total unique NG parts', value: scope.under.ng, color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', hint: 'Parts with at least one NG / rework activity', onClick: () => onScope(scope.under.pickNg) },
      { id: 'scope.dev.models', group: 'Developed (< SOP + 3 months)', title: 'Total unique models', value: scope.developed.models, color: '#10b981', icon: 'grid', hint: 'Models past SOP, up to SOP + 3 months', onClick: () => onScope(scope.developed.pickAll) },
      { id: 'scope.dev.parts', group: 'Developed (< SOP + 3 months)', title: 'Total unique parts', value: scope.developed.parts, color: '#10b981', icon: 'check', hint: 'Parts of models past SOP, up to SOP + 3 months', onClick: () => onScope(scope.developed.pickAll) },
      { id: 'scope.dev.ng', group: 'Developed (< SOP + 3 months)', title: 'Total unique NG parts', value: scope.developed.ng, color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', hint: 'Parts with at least one NG / rework activity', onClick: () => onScope(scope.developed.pickNg) },
      { id: 'scope.deleted', group: 'Deleted in SAP / ENOVIA', title: 'Part Deleted', value: deletedParts, color: '#dc2626', icon: 'close-circle', onClick: onShowDeleted, hint: 'Parts deleted in SAP or ENOVIA (recalled from the vendor; listed in My Parts). Their data is kept and comes back if the part is activated again.' },
    ] },
    { id: 'ov-activities', title: 'Activities', icon: 'clipboard-list', className: 'min-w-[280px] flex-[6_1_560px]', tiles: [
      // Status
      { id: 'act.upcoming', title: 'Upcoming', value: totals.Upcoming, color: WORK_BUCKET_COLORS.Upcoming, icon: 'calendar-month', onClick: () => onGo('overview', { bucket: 'Upcoming' }) },
      { id: 'act.completed', title: 'Completed', value: totals.Completed, color: WORK_BUCKET_COLORS.Completed, icon: 'check-circle', onClick: () => onGo('overview', { bucket: 'Completed' }) },
      // Overdue (past the planned end, not approved), by who has to act next
      ...OVERDUE_TILES.map(([mk, title]) => ({
        id: `act.overdue.${mk}`, title, value: act.overdue[mk], color: WORK_BUCKET_COLORS.Delayed, icon: 'exclamation-circle',
        onClick: () => onGo('overview', { bucket: 'Delayed', mine: mk }), hint: `${title}: past the planned end and not approved`,
      })),
      { id: 'act.ng', title: 'NG / Rework', value: totals.NG, color: WORK_BUCKET_COLORS.NG, icon: 'close-circle', onClick: () => onGo('overview', { bucket: 'NG' }), hint: 'Sent back for rework (NG concerns)' },
      // Who has to act next (these three together are every open activity)
      { id: 'act.picUpdate', title: 'PIC data entry pending', value: act.mine.picUpdate, color: '#6d28d9', icon: 'pen', onClick: () => onGo('overview', { mine: 'picUpdate' }), hint: 'Open activities the PIC has to fill, release or redo' },
      { id: 'act.vendorUpdate', title: 'Awaiting Vendor update', value: act.mine.vendorUpdate, color: '#f97316', icon: 'clipboard', onClick: () => onGo('overview', { mine: 'vendorUpdate' }), hint: 'Open activities the vendor has to fill, acknowledge or redo' },
      // MSIL approval: submitted activities, by the step they wait at
      { id: 'act.approvePIC', title: 'Awaiting PIC approval', value: act.mine.approvePIC, color: '#0891b2', icon: 'check', onClick: () => onGo('overview', { mine: 'approvePIC' }), hint: 'MSIL approval: submitted, waiting at the PIC step' },
      { id: 'act.approveSIC', title: 'Awaiting SIC approval', value: act.mine.approveSIC, color: '#8b5cf6', icon: 'check', onClick: () => onGo('overview', { mine: 'approveSIC' }), hint: 'MSIL approval: submitted, waiting at the SIC step' },
      { id: 'act.approveDPM', title: 'Awaiting DPM approval', value: act.mine.approveDPM, color: '#6366f1', icon: 'check', onClick: () => onGo('overview', { mine: 'approveDPM' }), hint: 'MSIL approval: submitted, waiting at the DPM step' },
      // Returned / exceptions
      ...(currentPersona === 'PIC' ? [{ id: 'act.returnedToVendor', title: 'Returned to vendor', value: act.returnedToVendor, color: '#ea580c', icon: 'reply', onClick: () => onGo('overview', { ret: 'vendor' }), hint: `Activities returned to the vendor (by PIC ${act.returnedToVendorBy.PIC}, by SIC ${act.returnedToVendorBy.SIC})` }] : []),
      ...(currentPersona === 'SIC' ? [{ id: 'act.returnedToPic', title: 'Returned to PIC', value: act.returnedToPic, color: '#ea580c', icon: 'reply', onClick: () => onGo('overview', { ret: 'pic' }), hint: 'Activities you (SIC) returned to the PIC' }] : []),
      { id: 'act.delayReviews', title: 'Delay reviews', value: delayReviews, color: '#2563eb', icon: 'calendar-month', onClick: () => onGo('worklist'), hint: 'Vendor delay reasons waiting for review (in My Approvals)' },
    ] },
  ]
  const sort = useSortable('ov-kpi-cards', cards.map((c) => c.id))
  const byId = new Map(cards.map((c) => [c.id, c]))

  return (
    <ExportSection id="mw-ov-kpis" label="Overview – scope, activities" className="flex flex-wrap items-stretch gap-3">
      {sort.ids.map((cid) => {
        const c = byId.get(cid)!
        return (
          <div key={cid} {...sort.itemProps(cid)} className={`${c.className} ${sortableCls}`}>
            <Segment id={c.id} title={c.title} icon={c.icon} tiles={c.tiles} grip={<Grip {...sort.gripProps(cid, `${c.title} card`, 'horizontal')} className="-ml-1" />} />
          </div>
        )
      })}
    </ExportSection>
  )
}

/** Resets the dragged order of the KPI cards (used by "Reset layout"). */
export function useKpiCardsLayout() {
  const { customized, reset } = useSortable('ov-kpi-cards', [])
  return { customized, reset }
}

const PAGE_SIZES = [3, 6, 9] as const

/**
 * Model-wise cards: priority models (delayed or NG activities, most first), then the rest. One line (3 cards) shows
 * first; "More models" switches to pages of 3, 6 or 9 cards.
 */
export function PriorityModels({ instances, parts, className = '', selected = [], onPick }: {
  instances: FilteredInstance[]
  parts: PartRecord[]
  className?: string
  /** Models currently filtering the page (highlighted). */
  selected?: string[]
  /** Click on a card: filter the page's list to that model (click again to clear). */
  onPick: (model: string) => void
}) {
  const stageOf = useModelStages(parts)
  const [collapsed, toggle] = useCollapsed('ov-priority-models')
  const [paged, setPaged] = useState(false)
  const [pageSize, setPageSize] = useState<number>(6)
  const [page, setPage] = useState(0)
  const cards = useMemo(() => {
    const byModel = new Map<string, { parts: Set<string>; Upcoming: number; Completed: number; Delayed: number; NG: number }>()
    for (const p of parts) {
      if (stageOf.get(p.model) === 'past') continue
      if (!byModel.has(p.model)) byModel.set(p.model, { parts: new Set(), Upcoming: 0, Completed: 0, Delayed: 0, NG: 0 })
      byModel.get(p.model)!.parts.add(p.partNo)
    }
    for (const i of instances) {
      const t = byModel.get(i.part.model)
      const b = workBucket(i)
      if (t && b) t[b] += 1
    }
    const all = [...byModel.entries()].map(([model, t]) => ({
      model, stage: stageOf.get(model)!, parts: t.parts.size, completed: t.Completed, delayed: t.Delayed, ng: t.NG,
    }))
    const priority = all.filter((c) => c.delayed + c.ng > 0).sort((a, b) => b.delayed + b.ng - (a.delayed + a.ng) || a.model.localeCompare(b.model))
    const rest = all.filter((c) => c.delayed + c.ng === 0).sort((a, b) => b.parts - a.parts || a.model.localeCompare(b.model))
    return { priority, rest }
  }, [parts, instances, stageOf])
  const all = [...cards.priority, ...cards.rest]
  const size = paged ? pageSize : 3
  const pages = Math.max(1, Math.ceil(all.length / size))
  const cur = Math.min(page, pages - 1)
  const shown = all.slice(cur * size, cur * size + size)

  return (
    <ExportSection id="mw-ov-models" label="Overview – models" className={`epmp-card flex min-h-0 flex-col p-4 ${className}`}>
      <div className={`flex flex-wrap items-center gap-2 ${collapsed ? '' : 'mb-3'}`}>
        <h3 className="text-[12px] font-semibold text-[var(--color-text)]">Priority Models</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-primary">{cards.priority.length} of {all.length}</span>
        <span className="text-[10.5px] text-[var(--color-muted)]" title="Click a model to filter the list below.">Delayed or NG activities first · click a model to filter</span>
        <span className="ml-auto flex items-center gap-2">
          {!collapsed && paged && (
            <label className="flex items-center gap-1.5 text-[10.5px] text-[#344054]">
              Per page
              <select value={pageSize} aria-label="Models per page" onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
                className="h-7 rounded-md border border-[var(--color-border)] px-1.5 text-[10.5px]">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {!collapsed && all.length > 3 && (
            <button type="button" onClick={() => { setPaged((v) => !v); setPage(0) }} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
              <FbIcon name={paged ? 'chevron-up' : 'chevron-down'} size={13} />
              {paged ? 'Show one line' : `More models (${all.length - 3})`}
            </button>
          )}
          <CollapseButton collapsed={collapsed} onToggle={toggle} label="Priority Models" />
        </span>
      </div>
      {collapsed ? null : shown.length === 0 ? (
        <p className="py-6 text-center text-[11.5px] text-[var(--color-muted)]">No models in this view.</p>
      ) : (<>
        <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-3">
          {shown.map((t) => (
            <button key={t.model} type="button" onClick={() => onPick(t.model)} aria-pressed={selected.includes(t.model)}
              title={selected.includes(t.model) ? `Showing ${t.model} below · click to clear` : `Show ${t.model}'s activities below`}
              className={`rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${t.delayed + t.ng > 0 ? 'border-l-4 border-l-[#dc2626]' : ''} ${selected.includes(t.model) ? 'ring-2 ring-[var(--color-primary)]' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11.5px] font-semibold text-[var(--color-text)]">{t.model}</span>
                <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${t.stage === 'developed' ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-primary'}`}>
                  {t.stage === 'developed' ? 'Developed' : 'Under dev.'}
                </span>
              </div>
              <div className="mb-1 text-[10.5px] text-[var(--color-muted)]">{t.parts} part{t.parts === 1 ? '' : 's'}</div>
              <div className="flex justify-between text-[10.5px]">
                <span><span className="text-[var(--color-muted)]">Done </span><strong style={{ color: WORK_BUCKET_COLORS.Completed }}>{t.completed}</strong></span>
                <span><span className="text-[var(--color-muted)]">Delayed </span><strong style={{ color: WORK_BUCKET_COLORS.Delayed }}>{t.delayed}</strong></span>
                <span><span className="text-[var(--color-muted)]">NG </span><strong style={{ color: WORK_BUCKET_COLORS.NG }}>{t.ng}</strong></span>
              </div>
            </button>
          ))}
        </div>
        {paged && pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-[10.5px] text-[#344054]">
            <span className="mr-1 text-[var(--color-muted)]">{cur * size + 1}–{Math.min(all.length, cur * size + size)} of {all.length}</span>
            <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous models"
              className="inline-flex h-7 items-center rounded-md border border-[var(--color-border)] bg-white px-2 font-semibold disabled:opacity-40">‹ Prev</button>
            {Array.from({ length: pages }, (_, k) => (
              <button key={k} type="button" onClick={() => setPage(k)} aria-current={k === cur ? 'page' : undefined}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 font-semibold ${k === cur ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]'}`}>
                {k + 1}
              </button>
            ))}
            <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next models"
              className="inline-flex h-7 items-center rounded-md border border-[var(--color-border)] bg-white px-2 font-semibold disabled:opacity-40">Next ›</button>
          </div>
        )}
      </>)}
    </ExportSection>
  )
}
