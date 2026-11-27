/**
 * The filter bar shared by the Workspace pages and Part Intake: master search, quick range and PIC view, the primary
 * filters, a "More filters" window, and the minimize-to-an-icon switch.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon as FbIcon } from '../../components/Icon'
import { trialLabelOf } from '../trialLabel'
import { useCollapsed } from '../collapse'
import { PicViewSelect } from './picView'
import { QuickRangeControl } from './quickRange'
import { MARKETS, PART_ATTR_FIELDS, PartAttrFilters, isAllMarkets } from '../partAttrFilters'
import type { PartAttrSel } from '../partAttrFilters'
import { MasterSearch } from './MasterSearch'
import type { SearchFacet, SearchPick } from './MasterSearch'
import { MultiSelect } from '../intake/MultiSelect'
import { MoreFilters } from './MoreFilters'
import { EXTRA_KEYS, LABELS, extraCount } from './extraFilters'
import type { ExtraSel } from './extraFilters'
// ── Compact filter bar ─────────────────────────────────────────────────────

export interface LabeledOption { value: string; label: string }

export interface FilterBarProps {
  model: string[]; setModel: (v: string[]) => void; modelOptions: string[]
  dept: string[]; setDept: (v: string[]) => void; deptOptions: string[]
  vendorCode: string[]; setVendorCode: (v: string[]) => void; vendorOptions: LabeledOption[]
  milestone: string[]; setMilestone: (v: string[]) => void; milestoneOptions: string[]
  pic: string[]; setPic: (v: string[]) => void; picOptions: LabeledOption[]
  /** The PIC filter is hidden for the PIC, who picks whose work to see with the View dropdown at the top. */
  showPic?: boolean
  partNo: string[]; setPartNo: (v: string[]) => void; partOptions: LabeledOption[]
  activity: string[]; setActivity: (v: string[]) => void; activityOptions: string[]
  status: string[]; setStatus: (v: string[]) => void; statusOptions: string[]
  attrs: PartAttrSel; setAttrs: (v: PartAttrSel) => void
  /** Market (Domestic / Export); both ticked by default. */
  market: string[]; setMarket: (v: string[]) => void
  /** Status (work bucket) is an Insights concept; the Worklist hides it. */
  showStatus?: boolean
  hasFilters: boolean; clearFilters: () => void
  /** Shown at the start of the bar (e.g. the Back button). */
  leading?: React.ReactNode
  /** Master search: every part (not only the chosen models'), and how picks are applied / removed. */
  /** "More filters" window: Part / Vendor / People & departments fields. */
  extra: ExtraSel; setExtra: (v: ExtraSel) => void; extraOpts: Record<string, { value: string }[]>
  /** Part Allocation: only part-level filters (no Status, Trial, Activity or date range). */
  partLevelOnly?: boolean
  /** When minimized, the filter icon is placed in the element with this id (e.g. the page's top row) instead of a row of its own. */
  miniSlotId?: string
  /** Where the minimized state is remembered (default: shared by the Workspace pages). */
  collapseKey?: string
  allPartOptions: LabeledOption[]
  onSearchApply: (picks: SearchPick[]) => void
  onSearchRemove: (pick: SearchPick) => void
}

/**
 * Primary filters inline, the rest behind "More filters". Every filter is a multi-select (MultiSelect) so the
 * user can pick several values at once — nothing ticked means "All". Uses the shared MultiSelect for a look
 * that matches the Exception/Intake filter bars.
 */
export function CompactFilterBar(f: FilterBarProps) {
  const [more, setMore] = useState(false)
  const partLevel = !!f.partLevelOnly
  // Minimize: only the search box and a summary stay; remembered in this browser.
  const [mini, toggleMini] = useCollapsed(f.collapseKey ?? 'mw-filters')
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSlot(f.miniSlotId ? document.getElementById(f.miniSlotId) : null) }, [f.miniSlotId, mini])
  const active = [f.status, f.model, f.milestone, f.partNo, f.dept, f.vendorCode, f.activity, f.pic].filter((v) => v.length > 0).length
    + Object.values(f.attrs).filter((v) => v.length > 0).length + (isAllMarkets(f.market) ? 0 : 1) + extraCount(f.extra)
  const plain = (opts: string[]) => opts.map((o) => ({ value: o }))
  // Master search: every filter on the bar, searchable by value (several terms apply several filters).
  const facets: SearchFacet[] = [
    ...(f.showStatus && !partLevel ? [{ key: 'status', label: 'Status', options: plain(f.statusOptions), selected: f.status }] : []),
    { key: 'model', label: 'Model', options: plain(f.modelOptions), selected: f.model },
    ...(partLevel ? [] : [{ key: 'trial', label: 'Trial', options: f.milestoneOptions.map((id) => ({ value: id, label: trialLabelOf(id) })), selected: f.milestone }]),
    { key: 'part', label: 'Part', options: f.allPartOptions, selected: f.partNo },
    { key: 'vendor', label: 'Vendor', options: f.vendorOptions, selected: f.vendorCode },
    { key: 'dept', label: 'Dept', options: plain(f.deptOptions), selected: f.dept },
    ...PART_ATTR_FIELDS.map((af) => ({ key: af.key, label: af.label, options: plain(af.options), selected: f.attrs[af.key] })),
    { key: 'market', label: 'Market', options: plain([...MARKETS]), selected: isAllMarkets(f.market) ? [] : f.market },
    ...(partLevel ? [] : [{ key: 'activity', label: 'Activity', options: plain(f.activityOptions), selected: f.activity }]),
    ...(f.showPic ? [{ key: 'pic', label: 'PIC', options: f.picOptions, selected: f.pic }] : []),
    ...EXTRA_KEYS.filter((k) => (f.extraOpts[k]?.length ?? 0) > 0).map((k) => ({ key: `x:${k}`, label: k === 'status' ? 'Part status' : (LABELS[k] ?? k), options: f.extraOpts[k], selected: f.extra[k] ?? [] })),
  ]
  // Filters living in the "More filters" window that are in force.
  const moreCount = extraCount(f.extra) + (partLevel || f.activity.length === 0 ? 0 : 1) + (f.showPic && f.pic.length > 0 ? 1 : 0)
  // Minimized: just a small filter icon at the top right (with the number of filters in force).
  if (mini) {
    const icon = (
        <button type="button" onClick={toggleMini} aria-expanded="false" aria-label={`Show filters${active ? ` (${active} applied)` : ''}`} title="Show the filters"
          className="pointer-events-auto relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[#344054] shadow-md hover:bg-[var(--color-surface)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
          {active > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[9.5px] font-bold text-white">{active}</span>}
        </button>
    )
    // In the page's top row when it has a slot for it (no row of its own); otherwise on a row of its own.
    return slot ? createPortal(icon, slot) : <div className="pointer-events-none flex justify-end">{icon}</div>
  }
  return (
    <section className="epmp-card mb-3 px-3 py-2">
      {/* Date quick filter and whose work to show: part of the filters, for the whole page. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-2">
        <MasterSearch facets={facets} onApply={f.onSearchApply} onRemove={f.onSearchRemove} />
        {!partLevel && <QuickRangeControl />}
        <PicViewSelect />
        <button
          onClick={() => setMore(true)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-semibold ${moreCount ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[#344054]'} hover:bg-[#fafafa]`}
        >
          <FbIcon name="tools" size={12} /> More filters
          {moreCount > 0 && <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[9.5px] font-bold text-white">{moreCount}</span>}
        </button>
        {f.hasFilters && (
          <button onClick={f.clearFilters} className="text-[10.5px] font-medium text-[var(--color-primary)] hover:underline">Clear</button>
        )}
        <button type="button" onClick={toggleMini} aria-expanded="true" aria-label="Minimize filters" title="Minimize the filters to an icon"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[#344054] hover:bg-[var(--color-surface)]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>
        </button>
      </div>
      {<>
      <div className="flex flex-wrap items-center gap-2">
        {f.leading}
        {f.showStatus && !partLevel && <MultiSelect label="Status" options={plain(f.statusOptions)} selected={f.status} onChange={f.setStatus} />}
        <MultiSelect label="Model" options={plain(f.modelOptions)} selected={f.model} onChange={f.setModel} />
        {!partLevel && <MultiSelect label="Trial" options={f.milestoneOptions.map((id) => ({ value: id, label: trialLabelOf(id) }))} selected={f.milestone} onChange={f.setMilestone} />}
        <MultiSelect label="Part" options={f.partOptions} selected={f.partNo} onChange={f.setPartNo} />
        <MultiSelect label="Dept" options={plain(f.deptOptions)} selected={f.dept} onChange={f.setDept} />
        <MultiSelect label="Vendor" options={f.vendorOptions} selected={f.vendorCode} onChange={f.setVendorCode} />
        <PartAttrFilters value={f.attrs} onChange={f.setAttrs} />
        <MultiSelect label="Market" options={MARKETS.map((m) => ({ value: m }))} selected={f.market} onChange={f.setMarket} />
      </div>
      <MoreFilters
        open={more} onClose={() => setMore(false)}
        value={{ extra: f.extra, partNo: f.partNo, vendorCode: f.vendorCode, activity: f.activity, pic: f.pic }}
        onApply={(v) => { f.setExtra(v.extra); f.setPartNo(v.partNo); f.setVendorCode(v.vendorCode); f.setActivity(v.activity); f.setPic(v.pic) }}
        options={f.extraOpts} partOptions={f.partOptions} vendorOptions={f.vendorOptions}
        activityOptions={plain(f.activityOptions)} picOptions={f.picOptions} showPic={!!f.showPic} showActivity={!partLevel}
      />
      </>}
    </section>
  )
}

