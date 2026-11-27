import { useMainPartCls } from '../bundleHooks'
import { RELEASE_LABEL } from '../mywork/ReleasePanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { buildCsv, downloadCsv } from '../mywork/csv'
import { partInScope, fmtDate } from '../scope'
import type { IntakeSource } from '../../mock/partIntakeFields'
import { ColumnFilter } from '../ColumnFilter'
import { CompactFilterBar } from '../mywork/FilterBar'
import type { LabeledOption } from '../mywork/FilterBar'
import { PicViewProvider, usePicViewMatch } from '../mywork/picView'
import { EMPTY_EXTRA, extraOptions, hasExtra, matchExtra } from '../mywork/extraFilters'
import type { ExtraSel } from '../mywork/extraFilters'
import type { SearchPick } from '../mywork/MasterSearch'
import { ALL_MARKETS, EMPTY_ATTR_SEL, PART_ATTR_FIELDS, hasAttrSel, isAllMarkets, matchMarket, matchPartAttrs } from '../partAttrFilters'
import type { PartAttrSel } from '../partAttrFilters'
import { picLabel } from '../../domain/people'
import { getPicOn } from '../../engine'
import { DEMO_TODAY } from '../scope'
import { ManualPartDialog } from './ManualPartDialog'
import { DISPLAY_FIELDS, SOURCE_LABEL, intakeValue } from './intakeValues'
import { getReleaseState, latestReturn } from '../../engine'
import type { PartRecord } from '../../domain'

/** Release / ECN actions, supplied by the parent so the modal and store wiring stay in one place. */
export interface IntakeActions {
  canRelease: boolean
  canEcn: boolean
  onRelease: (part: PartRecord, next: boolean) => void
  onEcn: (part: PartRecord) => void
}

type Origin = 'SAP' | 'ENOVIA' | 'Manual'
const SOURCE_TAG: Record<IntakeSource, string> = {
  Enovia: 'bg-sky-100 text-sky-800',
  SAP: 'bg-indigo-100 text-indigo-800',
  'System (EPMP)': 'bg-emerald-100 text-emerald-800'
}
const ORIGIN_TAG: Record<Origin, string> = { SAP: 'bg-indigo-100 text-indigo-800', ENOVIA: 'bg-sky-100 text-sky-800', Manual: 'bg-amber-100 text-amber-800' }
const originOf = (o: string | undefined): Origin => (o === 'ENOVIA' ? 'ENOVIA' : o === 'Manual' ? 'Manual' : 'SAP')
/** Every part that came in from SAP / ENOVIA (or was added manually), with its intake fields. */
export function PartIntakePage(props: { embedded?: boolean; actions?: IntakeActions }) {
  return <PicViewProvider><PartIntakeInner {...props} /></PicViewProvider>
}

function PartIntakeInner({ embedded = false, actions }: { embedded?: boolean; actions?: IntakeActions }) {
  const { parts, models, picAssignments, sections, partReleases, partAcks, setPartSourceDeleted } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [params, setParams] = useSearchParams()
  const canAdd = currentPersona === 'SectionAdmin' || currentPersona === 'Admin' || currentPersona === 'PIC'
  const [addOpen, setAddOpen] = useState(params.get('add') === '1' && canAdd)
  const [origins, setOrigins] = useState<Origin[]>([])
  // The same filters as the Workspace pages (My Parts): primary filters, master search and "More filters".
  const [fModel, setFModel] = useState<string[]>([])
  const [fDept, setFDept] = useState<string[]>([])
  const [fPic, setFPic] = useState<string[]>([])
  const [fPartNo, setFPartNo] = useState<string[]>([])
  const [fVendorCode, setFVendorCode] = useState<string[]>([])
  const [fAttrs, setFAttrs] = useState<PartAttrSel>(EMPTY_ATTR_SEL)
  const [fMarket, setFMarket] = useState<string[]>(ALL_MARKETS)
  const [fExtra, setFExtra] = useState<ExtraSel>(EMPTY_EXTRA)
  const inView = usePicViewMatch()
  const mainCls = useMainPartCls()
  // The table runs down to the bottom of the page: its height is what is left below its top edge (re-measured when the
  // window or the filter bar above changes size).
  const rootRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const [tableH, setTableH] = useState<number | null>(null)
  useEffect(() => {
    const measure = () => {
      const el = tableRef.current
      if (!el) return
      const h = Math.max(240, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 16))
      setTableH((prev) => (prev !== null && Math.abs(prev - h) < 2 ? prev : h))
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => { window.removeEventListener('resize', measure); ro.disconnect() }
  })
  // "Deleted in SAP / ENOVIA" tile: show only those parts.
  const [deletedOnly, setDeletedOnly] = useState(false)

  const scoped = useMemo(() => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)), [parts, currentPersona])
  const deletedCount = scoped.filter((p) => p.sourceDeleted).length
  const counts = useMemo(() => {
    const c: Record<Origin, number> = { SAP: 0, ENOVIA: 0, Manual: 0 }
    for (const p of scoped) c[originOf(p.origin)] += 1
    return c
  }, [scoped])
  const rows = useMemo(
    () =>
      scoped.map((p) => ({
        part: p,
        origin: originOf(p.origin),
        release: getReleaseState(p.partNo, partReleases, partAcks),
        returnedReason: getReleaseState(p.partNo, partReleases, partAcks) === 'Returned' ? latestReturn(p.partNo, partAcks)?.reason : undefined,
        values: Object.fromEntries(DISPLAY_FIELDS.map((f) => [f.key, intakeValue(f, p, models, picAssignments)]))
      })),
    [scoped, models, picAssignments, partReleases, partAcks]
  )
  const showActions = !!actions && (actions.canRelease || actions.canEcn)
  const pass = (sel: string[], v: string) => sel.length === 0 || sel.includes(v)
  const picOf = (p: PartRecord) => getPicOn(p, picAssignments, DEMO_TODAY).name
  const rowsBase = useMemo(
    () =>
      rows
        .filter((r) => origins.length === 0 || origins.includes(r.origin))
        .filter((r) => !deletedOnly || !!r.part.sourceDeleted)
        .filter((r) => inView(r.part) && pass(fModel, r.part.model) && pass(fDept, r.part.department || 'Other') && pass(fVendorCode, r.part.vendorCode) &&
          pass(fPic, picOf(r.part)) && pass(fPartNo, r.part.partNo) && matchPartAttrs(r.part, fAttrs) && matchMarket(r.part, fMarket) &&
          matchExtra(r.part, fExtra, models, picAssignments))
        .sort((a, b) => a.part.partNo.localeCompare(b.part.partNo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, origins, deletedOnly, inView, fModel, fDept, fVendorCode, fPic, fPartNo, fAttrs, fMarket, fExtra, models, picAssignments]
  )
  // Column sort (click a header: ascending, descending, back to the part-number order) and a filter box per column.
  const [sortBy, setSortBy] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [colFilter, setColFilter] = useState<Record<string, string[]>>({})
  type Row = (typeof rows)[number]
  const cellText = (r: Row, col: string): string =>
    col === '_origin' ? SOURCE_LABEL[r.origin] : col === '_release' ? (r.part.sourceDeleted ? `Deleted in ${r.part.sourceDeleted.system}` : RELEASE_LABEL[r.release]) : (r.values[col] ?? '')
  const shown = useMemo(() => {
    const active = Object.entries(colFilter).filter(([, vs]) => vs.length)
    let out = active.length ? rowsBase.filter((r) => active.every(([c, vs]) => vs.includes(cellText(r, c)))) : rowsBase
    if (sortBy) {
      const dir = sortBy.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => cellText(a, sortBy.col).localeCompare(cellText(b, sortBy.col), undefined, { numeric: true }) * dir)
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsBase, colFilter, sortBy])
  const anyColFilter = Object.values(colFilter).some((v) => v.length > 0)
  // The values each column holds (its drop-down filter lists them).
  const colOptions = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const key of ['_origin', '_release', ...DISPLAY_FIELDS.map((f) => f.key)]) {
      out[key] = [...new Set(rowsBase.map((r) => cellText(r, key)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsBase])
  const clickSort = (col: string) => setSortBy((cur) => (!cur || cur.col !== col ? { col, dir: 'asc' } : cur.dir === 'asc' ? { col, dir: 'desc' } : null))
  // Option lists for the filter bar (over the parts in scope).
  const uniq = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, T>(); for (const x of xs) { const k = key(x); if (k && !m.has(k)) m.set(k, x) } return [...m.values()] }
  const modelOptions = useMemo(() => [...new Set(scoped.map((p) => p.model))].sort(), [scoped])
  const deptOptions = useMemo(() => [...new Set(scoped.map((p) => p.department || 'Other'))].sort(), [scoped])
  const vendorOptions = useMemo<LabeledOption[]>(() => uniq(scoped, (p) => p.vendorCode).map((p) => ({ value: p.vendorCode, label: `${p.vendorCode}: ${p.vendorName}` })).sort((a, b) => a.label.localeCompare(b.label)), [scoped])
  const partOptions = useMemo<LabeledOption[]>(() => scoped.filter((p) => fModel.length === 0 || fModel.includes(p.model)).map((p) => ({ value: p.partNo, label: `${p.partNo}: ${p.partName}` })).sort((a, b) => a.label.localeCompare(b.label)), [scoped, fModel])
  const allPartOptions = useMemo<LabeledOption[]>(() => scoped.map((p) => ({ value: p.partNo, label: `${p.partNo}: ${p.partName} (${p.model})` })).sort((a, b) => a.label.localeCompare(b.label)), [scoped])
  const picOptions = useMemo<LabeledOption[]>(() => uniq(scoped, (p) => getPicOn(p, picAssignments, DEMO_TODAY).name).map((p) => { const n = getPicOn(p, picAssignments, DEMO_TODAY).name; return { value: n, label: picLabel(n) } }).sort((a, b) => a.label.localeCompare(b.label)), [scoped, picAssignments]) // eslint-disable-line react-hooks/exhaustive-deps
  const extraOpts = useMemo(() => extraOptions(scoped, models, picAssignments), [scoped, models, picAssignments])
  // Choosing models ticks all of their parts in the Part filter (untick any to narrow it), as on the Workspace pages.
  const chooseModels = (next: string[]) => {
    setFModel(next)
    setFPartNo(next.length ? scoped.filter((p) => next.includes(p.model)).map((p) => p.partNo) : [])
  }
  const applySearch = (picks: SearchPick[]) => {
    const by = (k: string) => picks.filter((x) => x.facet === k).map((x) => x.value)
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]
    const partsPicked = by('part')
    const models2 = union(fModel, union(by('model'), partsPicked.map((no) => scoped.find((p) => p.partNo === no)?.model).filter((m): m is string => !!m)))
    if (partsPicked.length) { setFModel(models2); setFPartNo((prev) => union(prev, partsPicked)) } else if (by('model').length) chooseModels(models2)
    if (by('vendor').length) setFVendorCode((prev) => union(prev, by('vendor')))
    if (by('dept').length) setFDept((prev) => union(prev, by('dept')))
    if (by('pic').length) setFPic((prev) => union(prev, by('pic')))
    const attrPicks = PART_ATTR_FIELDS.filter((af) => by(af.key).length)
    if (attrPicks.length) setFAttrs((prev) => ({ ...prev, ...Object.fromEntries(attrPicks.map((af) => [af.key, union(prev[af.key], by(af.key))])) }))
    if (by('market').length) setFMarket((prev) => (isAllMarkets(prev) ? by('market') : union(prev, by('market'))))
    const xs = picks.filter((x) => x.facet.startsWith('x:'))
    if (xs.length) setFExtra((prev) => { const n = { ...prev }; for (const x of xs) { const k = x.facet.slice(2); n[k] = union(n[k] ?? [], [x.value]) } return n })
  }
  const removeSearch = ({ facet, value }: SearchPick) => {
    const drop = (prev: string[]) => prev.filter((x) => x !== value)
    if (facet === 'model') chooseModels(drop(fModel))
    else if (facet === 'part') setFPartNo(drop)
    else if (facet === 'vendor') setFVendorCode(drop)
    else if (facet === 'dept') setFDept(drop)
    else if (facet === 'pic') setFPic(drop)
    else if (facet === 'market') setFMarket((prev) => { const n = drop(prev); return n.length ? n : ALL_MARKETS })
    else if (facet.startsWith('x:')) setFExtra((prev) => ({ ...prev, [facet.slice(2)]: (prev[facet.slice(2)] ?? []).filter((x) => x !== value) }))
    else if (PART_ATTR_FIELDS.some((af) => af.key === facet)) setFAttrs((prev) => ({ ...prev, [facet]: drop(prev[facet as keyof PartAttrSel]) }))
  }
  const hasFilters = [fModel, fDept, fPic, fPartNo, fVendorCode].some((v) => v.length > 0) || hasAttrSel(fAttrs) || !isAllMarkets(fMarket) || hasExtra(fExtra)
  const clearFilters = () => { setFModel([]); setFDept([]); setFPic([]); setFPartNo([]); setFVendorCode([]); setFAttrs(EMPTY_ATTR_SEL); setFMarket(ALL_MARKETS); setFExtra(EMPTY_EXTRA) }
  const toggleOrigin = (o: Origin) => setOrigins((prev) => (prev.length === 1 && prev[0] === o ? [] : [o]))
  const closeAdd = () => {
    setAddOpen(false)
    if (params.get('add')) {
      const next = new URLSearchParams(params)
      next.delete('add')
      setParams(next, { replace: true })
    }
  }

  const tile = (key: string, label: string, value: number, origin?: Origin) => {
    const active = origin ? origins.length === 1 && origins[0] === origin : origins.length === 0
    return (
      <button
        key={key}
        type="button"
        onClick={() => (origin ? toggleOrigin(origin) : setOrigins([]))}
        aria-pressed={active}
        className={`epmp-card min-w-[120px] px-3 py-1.5 text-left transition-colors ${active ? 'ring-2 ring-[var(--color-accent)]' : 'hover:bg-[var(--color-surface)]'}`}
      >
        <div className="whitespace-nowrap text-[10.5px] font-medium text-[var(--color-muted)]">{label}</div>
        <div className="mt-0.5 text-lg font-semibold leading-tight text-[var(--color-text)]">{value}</div>
      </button>
    )
  }

  return (
    <div ref={rootRef}>
      {!embedded && (
        <PageHeader
          title="Part Intake"
          section="Modules"
          description="Parts received from SAP and ENOVIA, and parts added manually. Each column shows which system supplies it."
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap gap-2" data-tour="intake-summary">
        {tile('all', 'Total parts', scoped.length)}
        {tile('SAP', 'SAP', counts.SAP, 'SAP')}
        {tile('ENOVIA', 'Enovia', counts.ENOVIA, 'ENOVIA')}
        {tile('Manual', 'Manual', counts.Manual, 'Manual')}
        <button type="button" onClick={() => setDeletedOnly((v) => !v)} aria-pressed={deletedOnly}
          className={`epmp-card min-w-[120px] px-3 py-1.5 text-left transition-colors ${deletedOnly ? 'ring-2 ring-red-500' : 'hover:bg-[var(--color-surface)]'}`}>
          <div className="whitespace-nowrap text-[10.5px] font-medium text-[var(--color-muted)]">Deleted</div>
          <div className="mt-0.5 text-lg font-semibold leading-tight text-red-600">{deletedCount}</div>
        </button>
      </div>
      {/* On the same line as the tiles: the minimized filter icon, Download CSV and Add Part. */}
      <div className="ml-auto flex flex-none items-center gap-2">
        <span id="intake-filter-slot" className="flex items-center" />
        <Button
          variant="secondary"
          size="md"
          disabled={shown.length === 0}
          onClick={() =>
            downloadCsv(
              'part-intake.csv',
              buildCsv(['Source', 'Release', ...DISPLAY_FIELDS.map((f) => f.label)], shown.map((r) => [SOURCE_LABEL[r.origin], r.release, ...DISPLAY_FIELDS.map((f) => r.values[f.key])]))
            )
          }
        >
          Download CSV ({shown.length})
        </Button>
        {canAdd && (
          <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
            + Add Part
          </Button>
        )}
      </div>
      </div>
      <CompactFilterBar partLevelOnly collapseKey="intake-filters" miniSlotId="intake-filter-slot"
        model={fModel} setModel={chooseModels} modelOptions={modelOptions}
        dept={fDept} setDept={setFDept} deptOptions={deptOptions}
        vendorCode={fVendorCode} setVendorCode={setFVendorCode} vendorOptions={vendorOptions}
        milestone={[]} setMilestone={() => {}} milestoneOptions={[]}
        pic={fPic} setPic={setFPic} picOptions={picOptions} showPic={currentPersona !== 'PIC'}
        partNo={fPartNo} setPartNo={setFPartNo} partOptions={partOptions}
        activity={[]} setActivity={() => {}} activityOptions={[]}
        status={[]} setStatus={() => {}} statusOptions={[]}
        attrs={fAttrs} setAttrs={setFAttrs} market={fMarket} setMarket={setFMarket}
        extra={fExtra} setExtra={setFExtra} extraOpts={extraOpts}
        allPartOptions={allPartOptions} onSearchApply={applySearch} onSearchRemove={removeSearch}
        hasFilters={hasFilters} clearFilters={clearFilters} />
      <Card flush>
        {rowsBase.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">
            {scoped.length === 0 ? 'No parts yet. Parts arrive from SAP and ENOVIA, or can be added manually.' : 'No parts match the filters.'}
          </p>
        ) : (
          <div ref={tableRef} className="overflow-auto" style={{ height: tableH ?? undefined, maxHeight: tableH ?? 'calc(100vh - 380px)' }}>
            <table className="border-separate border-spacing-0 text-[10.5px]">
              <thead className="sticky top-0 z-30">
                {(() => {
                  const cols: { key: string; label: string; source?: IntakeSource; right?: boolean; noSort?: boolean; first?: boolean }[] = [
                    { key: '_origin', label: 'Received from', first: true },
                    { key: '_release', label: 'Release' },
                    ...(showActions ? [{ key: '_actions', label: 'Actions', right: true, noSort: true }] : []),
                    ...DISPLAY_FIELDS.map((f) => ({ key: f.key, label: f.label, source: f.source })),
                  ]
                  const base = 'whitespace-nowrap bg-[var(--color-surface)] px-3 text-left'
                  return (
                    <>
                      <tr>
                        {cols.map((c) => {
                          const on = sortBy?.col === c.key
                          return (
                            <th key={c.key} aria-sort={on ? (sortBy!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                              className={`${base} pb-0.5 pt-2 align-bottom ${c.first ? 'sticky left-0 z-30 min-w-[130px] border-r border-[var(--color-border)]' : 'min-w-[120px]'} ${c.right ? 'text-right' : ''}`}>
                              {c.noSort ? (
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{c.label}</div>
                              ) : (
                                <button type="button" onClick={() => clickSort(c.key)} title={`Sort by ${c.label}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                                  {c.label}<span className={on ? 'text-[var(--color-primary)]' : 'text-[#98a2b3]'} aria-hidden="true">{on ? (sortBy!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                                </button>
                              )}
                              {c.source && <div><span className={`mt-0.5 inline-block rounded px-1.5 py-px text-[9px] font-medium ${SOURCE_TAG[c.source]}`}>{c.source}</span></div>}
                            </th>
                          )
                        })}
                      </tr>
                      <tr>
                        {cols.map((c) => (
                          <th key={c.key} className={`${base} border-b border-[var(--color-border)] pb-1.5 pt-0.5 font-normal ${c.first ? 'sticky left-0 z-30 border-r' : ''}`}>
                            {c.noSort ? (anyColFilter ? <button type="button" onClick={() => setColFilter({})} className="text-[10px] font-semibold text-[var(--color-accent)] hover:underline">Clear</button> : null) : (
                              <ColumnFilter label={c.label} options={colOptions[c.key] ?? []} selected={colFilter[c.key] ?? []} minWidth={90}
                                onChange={(next) => setColFilter((f) => ({ ...f, [c.key]: next }))} />
                            )}
                          </th>
                        ))}
                      </tr>
                    </>
                  )
                })()}
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={40} className="px-4 py-8 text-center text-[var(--color-muted)]">No parts match the column filters.</td></tr>}
                {shown.map(({ part, origin, release, returnedReason, values }) => {
                  const withVendor = release === 'Released' || release === 'Acknowledged'
                  return (
                  <tr key={part.partNo} className="hover:bg-[#fafbff]">
                    <td className="sticky left-0 z-10 border-b border-r border-[var(--color-border)] bg-white px-3 py-2">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${ORIGIN_TAG[origin]}`}>{SOURCE_LABEL[origin]}</span>
                      {(part.receivedAt ?? part.createdAt) && (
                        <div className="mt-1 whitespace-nowrap text-[10px] text-[var(--color-muted)]" title="Date the part entered EPMP; the PIC releases it to the vendor within 7 days">
                          Received {fmtDate((part.receivedAt ?? part.createdAt)!.slice(0, 10))}
                        </div>
                      )}
                      {part.sourceDeleted && (
                        <div className="mt-1 whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" title="Off the work screens; its data is kept and comes back when reactivated">
                          Deleted in {part.sourceDeleted.system} · {fmtDate(part.sourceDeleted.at.slice(0, 10))}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-[var(--color-border)] px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          release === 'Acknowledged' ? 'bg-emerald-100 text-emerald-800'
                          : release === 'Released' ? 'bg-violet-100 text-violet-800'
                          : release === 'Returned' ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {RELEASE_LABEL[release]}
                      </span>
                      {returnedReason && <div className="mt-1 max-w-[220px] text-[10px] text-[var(--color-muted)]">“{returnedReason}”</div>}
                    </td>
                    {showActions && (
                      <td className="border-b border-[var(--color-border)] px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {actions!.canRelease && !part.sourceDeleted && (
                            <button
                              onClick={() => actions!.onRelease(part, !withVendor)}
                              className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[10.5px] font-medium text-[#344054] hover:border-[#bfdbfe]"
                            >
                              {withVendor ? 'Recall' : release === 'Returned' ? 'Release again' : 'Release'}
                            </button>
                          )}
                          {actions!.canEcn && (
                            // Stand-in for the SAP / ENOVIA feed (there is no live feed in this prototype).
                            <select aria-label={`Simulate SAP / ENOVIA feed for ${part.partNo}`} value=""
                              title="Simulate the SAP / ENOVIA feed: delete the part there, or activate it again"
                              onChange={(e) => {
                                const [act, system] = e.target.value.split(':') as ['del' | 'act', 'SAP' | 'ENOVIA']
                                if (act) setPartSourceDeleted({ partNos: [part.partNo], deleted: act === 'del', system, by: currentPersona })
                              }}
                              className="h-[26px] rounded-lg border border-[var(--color-border)] bg-white px-1.5 text-[10.5px] text-[#344054]">
                              <option value="">Simulate feed…</option>
                              {part.sourceDeleted
                                ? <option value={`act:${part.sourceDeleted.system}`}>Activated again in {part.sourceDeleted.system}</option>
                                : <><option value="del:SAP">Deleted in SAP</option><option value="del:ENOVIA">Deleted in ENOVIA</option></>}
                            </select>
                          )}
                          {actions!.canEcn && !part.sourceDeleted && (
                            <button
                              onClick={() => actions!.onEcn(part)}
                              className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[10.5px] font-medium text-[#344054] hover:border-[#bfdbfe]"
                            >
                              ECN transfer
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {DISPLAY_FIELDS.map((f) => {
                      const v = values[f.key]
                      return (
                        <td key={f.key} className={`whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2 ${f.key === 'part_number' ? `font-medium text-[var(--color-text)] ${mainCls(part.partNo)}` : f.key === 'main_part_number' ? `text-[#344054] ${mainCls(values[f.key])}` : 'text-[#344054]'}`}>
                          {v ? (f.type === 'date' ? fmtDate(v) : v) : <span className="text-[var(--color-muted)]">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {!canAdd && (
        <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">Parts are added manually by the Department Co-ordinator, a PIC or Admin when SAP / ENOVIA has no number yet.</p>
      )}
      {addOpen && <ManualPartDialog onClose={closeAdd} sections={sections.map((s) => s.id)} />}
    </div>
  )
}
