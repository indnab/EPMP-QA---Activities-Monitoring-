import { useMemo, useState } from 'react'
import { ALL_MARKETS, EMPTY_ATTR_SEL, MARKETS, PartAttrFilters, hasAttrSel, isAllMarkets, matchMarket, matchPartAttrs } from '../partAttrFilters'
import type { PartAttrSel } from '../partAttrFilters'
import { MultiSelect } from '../intake/MultiSelect'
import { picLabel } from '../../domain/people'
import { PageHeader, Card } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { useWorkParts } from '../../hooks/useWorkParts'
import { buildVendorScores, buildInsights, pct, buildActivityHeatMap, buildVendorActivityHeatMap, predictRisk } from './insights'
import type { InsightTone, VendorScore, HeatMap, HeatLevel, RiskLevel } from './insights'
import { TECHNICAL_CATEGORIES } from '../../domain/timelineCatalog'
import { getFilteredData, getPicOn, workBucket, WORK_BUCKETS } from '../../engine'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { DEMO_TODAY } from '../scope'

const toneStyle: Record<InsightTone, { card: string; dot: string; label: string }> = {
  risk: { card: 'border-red-200 bg-red-50', dot: 'bg-red-500', label: 'Risk' },
  watch: { card: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', label: 'Watch' },
  good: { card: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500', label: 'Strength' },
  info: { card: 'border-[var(--color-border)] bg-white', dot: 'bg-slate-400', label: 'Note' }
}

const heatStyle: Record<HeatLevel, { bg: string; text: string }> = {
  good: { bg: '#dcfce7', text: '#166534' },
  ok: { bg: '#fef9c3', text: '#854d0e' },
  poor: { bg: '#fee2e2', text: '#991b1b' },
  none: { bg: 'transparent', text: '#cbd5e1' }
}

function HeatMapView({ map }: { map: HeatMap }) {
  if (map.rows.length === 0 || map.cols.length === 0) {
    return <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">No activity recorded yet.</p></Card>
  }
  return (
    <div className="epmp-card overflow-auto p-0" style={{ maxHeight: '60vh' }}>
      <table className="border-separate border-spacing-0 text-[10.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[150px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Vendor
            </th>
            {map.cols.map((c) => (
              <th key={c.key} className="sticky top-0 z-20 min-w-[60px] max-w-[120px] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-left align-bottom text-[10px] font-medium text-[var(--color-muted)]" title={c.label}>
                <div className="truncate">{c.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((v) => (
            <tr key={v}>
              <td className="sticky left-0 z-10 min-w-[150px] border-b border-r border-[var(--color-border)] bg-white px-3 py-2 font-medium text-[#101828]">{map.rowLabels?.[v] ?? v}</td>
              {map.cols.map((c) => {
                const cell = map.cell[v][c.key]
                const st = heatStyle[cell.level]
                return (
                  <td key={c.key} className="border-b border-r border-[var(--color-border)] p-0.5">
                    <div
                      className="flex h-9 items-center justify-center rounded text-[10.5px] font-semibold"
                      style={{ backgroundColor: st.bg, color: st.text }}
                      title={`${v} · ${c.label}: ${cell.note}`}
                    >
                      {cell.n > 0 ? cell.n : ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
      <div className="text-[16px] font-bold leading-tight text-[#101828]">{value}{suffix}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
    </div>
  )
}

function VendorCard({ s }: { s: VendorScore }) {
  const ftr = pct(s.firstTimeRight, s.approved || 1)
  const ng = pct(s.ngCount, s.inspections || 1)
  const nonOtop = pct(s.nonOtop, s.otop + s.nonOtop || 1)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-semibold text-[#101828]">{s.vendorName}</h3>
        <span className="text-[10.5px] text-[var(--color-muted)]">{s.parts} parts · {s.activitiesTracked} activities</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="First-time right" value={ftr} suffix="%" />
        <Metric label="Sent back" value={s.sentBacks} />
        <Metric label="Inspection NG" value={s.inspections ? ng : '—'} suffix={s.inspections ? '%' : ''} />
        <Metric label="Non-OTOP" value={s.otop + s.nonOtop ? nonOtop : '—'} suffix={s.otop + s.nonOtop ? '%' : ''} />
      </div>
      {(s.topNgCategory || s.topDelayReason || s.deviations > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[var(--color-muted)]">
          {s.topNgCategory && <span>Top NG: <strong className="text-[#344054]">{s.topNgCategory}</strong></span>}
          {s.topDelayReason && <span>Top delay: <strong className="text-[#344054]">{s.topDelayReason}</strong></span>}
          {s.deviations > 0 && <span>Deviations: <strong className="text-[#344054]">{s.deviations}</strong> ({s.deviationsApproved} appr / {s.deviationsRejected} rej)</span>}
        </div>
      )}
    </Card>
  )
}

/** The same filters as My Work (plus Technical category). Empty = all; Market starts with both ticked. */
interface LessonFilters {
  status: string[]; model: string[]; trial: string[]; partNo: string[]; dept: string[]; vendorCode: string[]
  activity: string[]; pic: string[]; cat: string[]; attrs: PartAttrSel; market: string[]
}
const NO_FILTERS: LessonFilters = {
  status: [], model: [], trial: [], partNo: [], dept: [], vendorCode: [], activity: [], pic: [], cat: [], attrs: EMPTY_ATTR_SEL, market: ALL_MARKETS,
}

export function LessonsPage() {
  const { entries, activities, templateRows, models, picAssignments } = useQAStore()
  const parts = useWorkParts()

  // One common filter bar for the whole page (same filters as My Work). Everything below respects it.
  const [f, setF] = useState<LessonFilters>(NO_FILTERS)
  const [more, setMore] = useState(false)
  const set = <K extends keyof LessonFilters>(k: K) => (v: LessonFilters[K]) => setF((prev) => ({ ...prev, [k]: v }))
  const inSel = (sel: string[], v: string) => sel.length === 0 || sel.includes(v)
  const picOf = (p: (typeof parts)[number]) => getPicOn(p, picAssignments, DEMO_TODAY).name

  // Part-level filters.
  const catParts = useMemo(
    () => parts.filter((p) =>
      inSel(f.model, p.model) && inSel(f.partNo, p.partNo) && inSel(f.dept, p.department || 'Other') &&
      inSel(f.vendorCode, p.vendorCode) && inSel(f.pic, picOf(p)) && inSel(f.cat, p.technicalCategory ?? 'OtherAssy') &&
      matchPartAttrs(p, f.attrs) && matchMarket(p, f.market)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parts, f, picAssignments]
  )
  // Activity-level filters (Trial, Activity, Status): keep the part × activity items that pass, and only their entries.
  const allInstances = useMemo(
    () => getFilteredData(entries, activities, catParts, templateRows, models, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY),
    [entries, activities, catParts, templateRows, models]
  )
  const instances = useMemo(
    () => allInstances.filter((i) => inSel(f.trial, i.row.milestoneId) && inSel(f.activity, i.activity.name) && inSel(f.status, workBucket(i) ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allInstances, f.trial, f.activity, f.status]
  )
  const itemFilter = f.trial.length > 0 || f.activity.length > 0 || f.status.length > 0
  const shownEntries = useMemo(() => {
    if (!itemFilter) return entries
    const keep = new Set(instances.map((i) => `${i.row.id}|${i.part.partNo}`))
    return entries.filter((e) => keep.has(`${e.templateRowId}|${e.partNo}`))
  }, [entries, instances, itemFilter])
  const ctx = useMemo(() => ({ entries: shownEntries, parts: catParts, activities, templateRows }), [shownEntries, catParts, activities, templateRows])

  const scores = useMemo(() => buildVendorScores(ctx), [ctx])
  const insights = useMemo(() => buildInsights(scores), [scores])

  // Rule-based forecast of at-risk parts (open activities ranked by projected delay/quality risk).
  const predictions = useMemo(() => {
    const rygList = instances.map((i) => ({ partNo: i.part.partNo, activityId: i.activity.id, templateRowId: i.row.id, ryg: String(i.ryg) }))
    return predictRisk(ctx, rygList)
  }, [ctx, instances])
  const shownPredictions = predictions

  // Heat map: one vendor picked → that vendor's activities as rows; otherwise vendor × activity.
  const oneVendor = f.vendorCode.length === 1 ? parts.find((p) => p.vendorCode === f.vendorCode[0])?.vendorName : undefined
  const heatMap = useMemo<HeatMap>(
    () => (oneVendor ? buildVendorActivityHeatMap(ctx, oneVendor, 'All') : buildActivityHeatMap(ctx, 'All')),
    [ctx, oneVendor]
  )
  const shownScores = scores
  const shownInsights = insights

  // Filter options (from all the user's parts, so they don't disappear while filtering).
  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort().map((value) => ({ value }))
    const labeled = (pairs: [string, string][]) => [...new Map(pairs.filter(([v]) => v)).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    const inst = getFilteredData(entries, activities, parts, templateRows, models, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY)
    return {
      model: uniq(parts.map((p) => p.model)),
      trial: uniq(inst.map((i) => i.row.milestoneId)),
      part: labeled(parts.filter((p) => f.model.length === 0 || f.model.includes(p.model)).map((p) => [p.partNo, `${p.partNo}: ${p.partName}`])),
      dept: uniq(parts.map((p) => p.department || 'Other')),
      vendor: labeled(parts.map((p) => [p.vendorCode, `${p.vendorCode}: ${p.vendorName}`])),
      activity: uniq(inst.map((i) => i.activity.name)),
      pic: labeled(parts.map((p) => { const n = picOf(p); return [n, picLabel(n)] })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activities, parts, templateRows, models, picAssignments, f.model])
  const hasFilters = (['status', 'model', 'trial', 'partNo', 'dept', 'vendorCode', 'activity', 'pic', 'cat'] as const).some((k) => f[k].length > 0) ||
    hasAttrSel(f.attrs) || !isAllMarkets(f.market)

  return (
    <div>
      <PageHeader
        title="Lessons Learnt"
        section="Modules"
        description="Vendor track records and AI-generated insights from this system's own data — approvals, send-backs, inspections, OTOP and deviations."
      />

      {/* One common filter bar for the whole page (same filters as My Work) */}
      <section className="epmp-card mb-4 px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-2">
          <span className="text-[10.5px] text-[var(--color-muted)]">Filters apply to every section · insights are rule-based, not a trained model.</span>
          <button type="button" onClick={() => setMore((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-semibold ${more ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[#344054]'} hover:bg-[#fafafa]`}>
            More filters
          </button>
          {hasFilters && <button type="button" onClick={() => setF(NO_FILTERS)} className="text-[10.5px] font-medium text-[var(--color-primary)] hover:underline">Clear</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label="Status" options={WORK_BUCKETS.map((value) => ({ value }))} selected={f.status} onChange={set('status')} />
          <MultiSelect label="Model" options={opts.model} selected={f.model} onChange={set('model')} />
          <MultiSelect label="Trial" options={opts.trial} selected={f.trial} onChange={set('trial')} />
          <MultiSelect label="Part" options={opts.part} selected={f.partNo} onChange={set('partNo')} />
          <MultiSelect label="Dept" options={opts.dept} selected={f.dept} onChange={set('dept')} />
          <MultiSelect label="Vendor" options={opts.vendor} selected={f.vendorCode} onChange={set('vendorCode')} />
          <PartAttrFilters value={f.attrs} onChange={set('attrs')} />
          <MultiSelect label="Market" options={MARKETS.map((value) => ({ value }))} selected={f.market} onChange={set('market')} />
          <MultiSelect label="Technical category" options={TECHNICAL_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} selected={f.cat} onChange={set('cat')} />
        </div>
        {more && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
            <MultiSelect label="Activity" options={opts.activity} selected={f.activity} onChange={set('activity')} />
            <MultiSelect label="PIC" options={opts.pic} selected={f.pic} onChange={set('pic')} />
          </div>
        )}
      </section>

      {/* Insight cards */}
      <h2 className="mb-2 text-[12px] font-semibold text-[#101828]">AI insights {shownInsights.length > 0 && `(${shownInsights.length})`}</h2>
      {shownInsights.length === 0 ? (
        <Card className="mb-6"><p className="py-6 text-center text-sm text-[var(--color-muted)]">Not enough history yet to surface insights for this selection.</p></Card>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shownInsights.map((ins) => {
            const st = toneStyle[ins.tone]
            return (
              <div key={ins.id} className={`rounded-lg border p-3.5 ${st.card}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                  <span className="text-[12px] font-semibold text-[#101828]">{ins.title}</span>
                  <span className="ml-auto rounded-full border border-[var(--color-border)] bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">{st.label}</span>
                </div>
                <p className="m-0 text-[11.5px] text-[#344054]">{ins.detail}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Forecast — at-risk parts */}
      <h2 className="mb-2 text-[12px] font-semibold text-[#101828]">Forecast · at-risk parts {shownPredictions.length > 0 && `(${shownPredictions.length})`}</h2>
      {shownPredictions.length === 0 ? (
        <Card className="mb-6"><p className="py-6 text-center text-sm text-[var(--color-muted)]">No at-risk open activities projected for this selection.</p></Card>
      ) : (
        <Card flush className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="px-4 py-2.5">Risk</th>
                  <th className="px-4 py-2.5">Part</th>
                  <th className="px-4 py-2.5">Activity</th>
                  <th className="px-4 py-2.5">Projection</th>
                  <th className="px-4 py-2.5">Why (rule-based)</th>
                  <th className="px-4 py-2.5">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {shownPredictions.slice(0, 20).map((p) => {
                  const rs: Record<RiskLevel, string> = {
                    High: 'bg-red-100 text-red-700',
                    Medium: 'bg-amber-100 text-amber-800',
                    Low: 'bg-slate-100 text-slate-600'
                  }
                  return (
                    <tr key={`${p.activityId}-${p.partNo}`} className="border-b border-[var(--color-border)] last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rs[p.level]}`}>{p.level}</span></td>
                      <td className="px-4 py-2.5"><div className="font-medium text-[#101828]">{p.partNo}</div><div className="text-[10px] text-[var(--color-muted)]">{p.vendorName}</div></td>
                      <td className="px-4 py-2.5">{p.activityName} <span className="text-[var(--color-muted)]">· {p.milestoneId}</span></td>
                      <td className="px-4 py-2.5 font-medium text-[#344054]">{p.outcome}</td>
                      <td className="px-4 py-2.5 text-[10.5px] text-[var(--color-muted)]">{p.reasons.join('; ')}</td>
                      <td className="px-4 py-2.5 text-[10.5px] text-[var(--color-muted)]">{p.confidence}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Heat map (honours the page filter above) */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[12px] font-semibold text-[#101828]">
          {oneVendor ? `${oneVendor} — activity heat map` : 'Vendor heat map'}
        </h2>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[10px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#dcfce7' }} /> Clean</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#fef9c3' }} /> Watch</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#fee2e2' }} /> NG / rework</span>
        <span>Number = tracked activities · hover a cell for detail</span>
      </div>
      <div className="mb-6">
        <HeatMapView map={heatMap} />
      </div>

      {/* Vendor scorecards */}
      <h2 className="mb-2 text-[12px] font-semibold text-[#101828]">Vendor scorecards</h2>
      {shownScores.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">No vendor activity recorded yet.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shownScores.map((s) => <VendorCard key={s.vendorName} s={s} />)}
        </div>
      )}
    </div>
  )
}
