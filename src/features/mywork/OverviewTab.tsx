/**
 * My Workspace → Overview: Part Allocation and Part Activities KPIs, development status (models / parts / vendors up to
 * SOP + 3 months), the Parts × Activity snapshot, a tile per model and the "Workspace by Model" chart. Every number
 * opens the matching list.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon as FbIcon } from '../../components/Icon'
import type { PartRecord } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { milestoneRows } from '../../domain/wbsTree'
import { bucketTotals, workBucket, workspaceGroups, WORK_BUCKETS, WORK_BUCKET_COLORS } from '../../engine'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY } from '../scope'
import { ExportSection } from '../export/ExportSection'

export type OverviewGo = (
  t: 'overview' | 'actions' | 'worklist' | 'insights' | 'calendar',
  payload?: { bucket?: WorkBucket; focus?: string; group?: string }
) => void

const MODEL_TILES = 7

function KpiCard({ title, value, color, icon, onClick, hint }: { title: string; value: number; color: string; icon: string; onClick?: () => void; hint?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-medium leading-tight" style={{ color }}>
        <FbIcon name={icon} size={13} /> {title}
      </span>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>{value}</span>
    </>
  )
  const cls = 'epmp-card flex items-center justify-between gap-2 px-3 py-2.5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} title={hint} data-export-stat={title} data-export-stat-value={value}
      className={`${cls} transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={hint} data-export-stat={title} data-export-stat-value={value}>{body}</div>
  )
}

function GroupCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[var(--color-border)] bg-white/60 p-3 ${className}`}>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</h3>
      {children}
    </section>
  )
}

const addMonths = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}

export function OverviewTab({ instances, parts, pendingRelease, awaitingAck, returned, delayReviews, onGo }: {
  /** Every in-scope activity instance (part × activity) for this role. */
  instances: FilteredInstance[]
  /** In-scope parts for this role. */
  parts: PartRecord[]
  pendingRelease: number
  awaitingAck: number
  returned: number
  delayReviews: number
  onGo: OverviewGo
}) {
  const navigate = useNavigate()
  const { models, projects, archetypes } = useQAStore()
  const [allModels, setAllModels] = useState(false)
  const totals = useMemo(() => bucketTotals(instances), [instances])

  // Part Activities: who has to act next on each open activity.
  const waiting = useMemo(() => {
    let pic = 0, vendor = 0, review = 0
    for (const i of instances) {
      if (i.status === 'Approved') continue
      if (i.status === 'Submitted') { review++; continue }
      // Not started / draft / sent back: the flow's first step owns the entry.
      if (i.activity.flow.steps[0]?.role === 'Vendor') vendor++
      else pic++
    }
    return { pic, vendor, review }
  }, [instances])

  // Development status: a model is completed once SOP + 3 months has passed (SOP = its archetype's last milestone date).
  const dev = useMemo(() => {
    const sopOf = (name: string) => {
      const m = models.find((x) => x.name === name)
      if (!m) return undefined
      const prj = projectOfModel(name, projects)
      const last = milestoneRows(archetypes.find((a) => a.id === prj?.archetypeId)).at(-1)
      return (last && m.mrds[last.id]) || m.mrds.SOP
    }
    const done = new Set<string>()
    const modelNames = Array.from(new Set(parts.map((p) => p.model)))
    for (const n of modelNames) {
      const sop = sopOf(n)
      if (sop && addMonths(sop, 3) < DEMO_TODAY) done.add(n)
    }
    const underParts = parts.filter((p) => !done.has(p.model))
    return {
      partsDone: parts.length - underParts.length,
      partsUnder: underParts.length,
      vendors: new Set(underParts.map((p) => p.vendorName)).size,
      modelsDone: done.size,
      modelsUnder: modelNames.length - done.size,
    }
  }, [parts, models, projects, archetypes])

  // One tile per model: parts and activity counts.
  const modelTiles = useMemo(() => {
    const byModel = new Map<string, { parts: Set<string>; Completed: number; Delayed: number; NG: number }>()
    for (const p of parts) if (!byModel.has(p.model)) byModel.set(p.model, { parts: new Set(), Completed: 0, Delayed: 0, NG: 0 })
    for (const p of parts) byModel.get(p.model)!.parts.add(p.partNo)
    for (const i of instances) {
      const t = byModel.get(i.part.model)
      const b = workBucket(i)
      if (t && (b === 'Completed' || b === 'Delayed' || b === 'NG')) t[b] += 1
    }
    return [...byModel.entries()]
      .map(([model, t]) => ({ model, parts: t.parts.size, completed: t.Completed, delayed: t.Delayed, ng: t.NG }))
      .sort((a, b) => b.parts - a.parts || a.model.localeCompare(b.model))
  }, [parts, instances])
  const shownTiles = allModels ? modelTiles : modelTiles.slice(0, MODEL_TILES)
  const hiddenTiles = modelTiles.length - MODEL_TILES

  const groups = useMemo(() => workspaceGroups(instances, 'model'), [instances])

  return (
    <div>
      {/* Part Allocation + Part Activities */}
      <ExportSection id="mw-ov-kpis" label="Overview – key metrics" className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-[3fr_6fr]">
        <GroupCard title="Part Allocation">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <KpiCard title="Pending release" value={pendingRelease} color="#d97706" icon="reply" onClick={() => onGo('actions', { focus: 'release' })} />
            <KpiCard title="Awaiting acknowledgement" value={awaitingAck} color="#2563eb" icon="clipboard" onClick={() => onGo('actions', { focus: 'release' })} />
            <KpiCard title="Returned by vendor" value={returned} color="#dc2626" icon="undo" onClick={() => onGo('actions', { focus: 'release' })} />
          </div>
        </GroupCard>
        <GroupCard title="Part Activities">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
            <KpiCard title="Awaiting PIC update" value={waiting.pic} color="#2153f5" icon="pen" onClick={() => onGo('worklist')} hint="Not started, draft or sent-back activities the PIC fills in" />
            <KpiCard title="Awaiting Vendor update" value={waiting.vendor} color="#7c3aed" icon="clipboard-list" onClick={() => onGo('insights')} hint="Not started, draft or sent-back activities the vendor fills in" />
            <KpiCard title="MSIL review / approval" value={waiting.review} color="#0891b2" icon="check-circle" onClick={() => onGo('worklist')} hint="Submitted, waiting for MSIL review or approval" />
            <KpiCard title="Delay reviews" value={delayReviews} color="#2563eb" icon="calendar-month" onClick={() => onGo('actions', { focus: 'delay' })} />
            <KpiCard title="Overdue activities" value={totals.Delayed} color="#d97706" icon="exclamation-circle" onClick={() => onGo('insights', { bucket: 'Delayed' })} />
            <KpiCard title="NG concerns" value={totals.NG} color="#dc2626" icon="close-circle" onClick={() => onGo('insights', { bucket: 'NG' })} />
          </div>
        </GroupCard>
      </ExportSection>

      {/* Development status — parts are counted up to SOP + 3 months */}
      <ExportSection id="mw-ov-dev" label="Overview – development status" className="mb-1 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Development completed (SOP + 3 months)" value={dev.partsDone} color="#10b981" icon="check" hint="Parts of models whose SOP + 3 months has passed" />
        <KpiCard title="Under development (PP, MPP, Pilot)" value={dev.partsUnder} color="#2153f5" icon="tools" hint="Parts of models before SOP + 3 months" />
        <KpiCard title="Total vendors" value={dev.vendors} color="#475467" icon="list" hint="Distinct vendors of parts under development" />
        <KpiCard title="Models completed" value={dev.modelsDone} color="#10b981" icon="check-circle" />
        <KpiCard title="Models under development" value={dev.modelsUnder} color="#2153f5" icon="grid" />
      </ExportSection>
      <p className="mb-3 text-[10px] text-[var(--color-muted)]">Parts are counted until SOP + 3 months; after that the model counts as development completed.</p>

      {/* Activity snapshot: Parts × Activity */}
      <ExportSection id="mw-ov-snapshot" label="Overview – activity snapshot"><section className="epmp-card mb-3 px-5 py-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Activity snapshot <span className="text-[11px] font-normal text-[var(--color-muted)]">Parts × Activity</span></h3>
          <button onClick={() => onGo('worklist')} className="text-[12px] font-semibold text-[var(--color-accent)] hover:underline">View worklist →</button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {WORK_BUCKETS.map((label) => {
            const n = totals[label]
            return (
              <button key={label} type="button" onClick={() => onGo('insights', { bucket: label })}
                title={`Show the ${n} ${label.toLowerCase()} activit${n === 1 ? 'y' : 'ies'}`}
                className="rounded-lg py-1 transition-colors hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]">
                <div className="text-[24px] font-bold" style={{ color: WORK_BUCKET_COLORS[label] }}>{n}</div>
                <div className="text-[11px] text-[var(--color-muted)] underline-offset-2 hover:underline">{label}</div>
              </button>
            )
          })}
        </div>
      </section></ExportSection>

      {/* A tile per model — opens part selection for that model, then pick the trial */}
      <ExportSection id="mw-ov-models" label="Overview – models">
        <div className="mb-1 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {shownTiles.map((t) => (
            <button key={t.model} type="button" onClick={() => navigate(`/part-workspace?model=${encodeURIComponent(t.model)}`)}
              title={`Open ${t.model}'s parts`}
              className="epmp-card px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]">
              <div className="truncate text-[13px] font-semibold text-[var(--color-text)]">{t.model}</div>
              <div className="mb-1.5 text-[11px] text-[var(--color-muted)]">{t.parts} part{t.parts === 1 ? '' : 's'}</div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Completed</span><strong style={{ color: WORK_BUCKET_COLORS.Completed }}>{t.completed}</strong></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Delayed</span><strong style={{ color: WORK_BUCKET_COLORS.Delayed }}>{t.delayed}</strong></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">NG</span><strong style={{ color: WORK_BUCKET_COLORS.NG }}>{t.ng}</strong></div>
              </div>
            </button>
          ))}
          {modelTiles.length === 0 && <p className="col-span-full py-4 text-center text-[12px] text-[var(--color-muted)]">No models in your scope.</p>}
        </div>
        {hiddenTiles > 0 && (
          <button type="button" onClick={() => setAllModels((v) => !v)} className="mx-auto mb-3 flex items-center gap-1 text-[12px] font-semibold text-[var(--color-accent)] hover:underline">
            <FbIcon name={allModels ? 'chevron-up' : 'chevron-down'} size={14} />
            {allModels ? 'Show fewer models' : `Show all ${hiddenTiles} other model${hiddenTiles === 1 ? '' : 's'}`}
          </button>
        )}
        <p className="mb-3 text-[10px] text-[var(--color-muted)]">Click a model to choose its part, then the trial.</p>
      </ExportSection>

      {/* Workspace by Model */}
      <ExportSection id="mw-ov-chart" label="Overview – workspace by model"><section className="epmp-card px-5 py-3">
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">Workspace by Model</h3>
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">No activities in your scope.</p>
        ) : (
          <div style={{ height: Math.max(180, groups.length * 34 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                <YAxis type="category" dataKey="key" stroke="#667085" fontSize={11} tickLine={false}
                  width={Math.min(110, Math.max(48, Math.max(...groups.map((g) => String(g.key).length)) * 6.5 + 12))} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                {WORK_BUCKETS.map((b) => (
                  <Bar key={b} dataKey={b} name={b} stackId="s" fill={WORK_BUCKET_COLORS[b]} cursor="pointer"
                    onClick={(d: any) => onGo('insights', { bucket: b, group: d?.key })}>
                    {groups.map((g) => <Cell key={g.key} />)}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[10px] text-[var(--color-muted)]">Click a segment to open those activities in Workspace.</p>
      </section></ExportSection>
    </div>
  )
}
