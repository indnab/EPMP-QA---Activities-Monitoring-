/**
 * My Workspace → Overview in three segments — Parts, Activities, Models — then a card per model (priority models
 * face up, the rest behind "More models") and the "Workspace by Model" chart. Every number opens the matching list.
 *
 * Development stage of a model, from its SOP date (its archetype's last milestone date): before SOP = under
 * development; SOP to SOP + 3 months = developed; after SOP + 3 months it drops out of these counts.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon as FbIcon } from '../../components/Icon'
import type { PartRecord } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { milestoneRows } from '../../domain/wbsTree'
import { bucketTotals, workBucket, workspaceGroups, WORK_BUCKETS, WORK_BUCKET_COLORS } from '../../engine'
import { useApprovalRows } from './approvalRows'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY } from '../scope'
import { ExportSection } from '../export/ExportSection'

export type OverviewGo = (
  t: 'overview' | 'actions' | 'worklist' | 'insights' | 'calendar',
  payload?: { bucket?: WorkBucket; focus?: string; group?: string; seg?: 'enter' | 'approve' | 'sentback' }
) => void

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

function Segment({ title, icon, children, className = '' }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[var(--color-border)] bg-white/60 p-3 ${className}`}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]"><FbIcon name={icon} size={13} />{title}</h3>
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
  const approvalRows = useApprovalRows()
  const [moreModels, setMoreModels] = useState(false)

  // Development stage per model (see the file comment).
  const stageOf = useMemo(() => {
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
  // Parts and activities are counted up to SOP + 3 months.
  const countedParts = useMemo(() => parts.filter((p) => stageOf.get(p.model) !== 'past'), [parts, stageOf])
  const counted = useMemo(() => instances.filter((i) => stageOf.get(i.part.model) !== 'past'), [instances, stageOf])
  const totals = useMemo(() => bucketTotals(counted), [counted])

  const partStats = useMemo(() => ({
    under: countedParts.filter((p) => stageOf.get(p.model) === 'under').length,
    developed: countedParts.filter((p) => stageOf.get(p.model) === 'developed').length,
  }), [countedParts, stageOf])

  const act = useMemo(() => {
    const enter = approvalRows.filter((r) => r.mode === 'enter')
    // Activities waiting on the vendor: not submitted / approved, and the vendor does the flow's first step.
    const vendor = counted.filter((i) => i.status !== 'Approved' && i.status !== 'Submitted' && i.activity.flow.steps[0]?.role === 'Vendor').length
    return {
      approve: approvalRows.filter((r) => r.mode === 'approve').length,
      sentBack: enter.filter((r) => r.statusLabel === 'Sent back').length,
      input: enter.length,
      vendor,
    }
  }, [approvalRows, counted])

  const modelStats = useMemo(() => {
    const vals = [...stageOf.values()]
    return { under: vals.filter((v) => v === 'under').length, developed: vals.filter((v) => v === 'developed').length }
  }, [stageOf])

  // A card per counted model. Priority = has delayed or NG activities (most first); the rest sit behind "More models".
  const cards = useMemo(() => {
    const byModel = new Map<string, { parts: Set<string>; Upcoming: number; Completed: number; Delayed: number; NG: number }>()
    for (const p of countedParts) {
      if (!byModel.has(p.model)) byModel.set(p.model, { parts: new Set(), Upcoming: 0, Completed: 0, Delayed: 0, NG: 0 })
      byModel.get(p.model)!.parts.add(p.partNo)
    }
    for (const i of counted) {
      const t = byModel.get(i.part.model)
      const b = workBucket(i)
      if (t && b) t[b] += 1
    }
    const all = [...byModel.entries()].map(([model, t]) => ({
      model, stage: stageOf.get(model)!, parts: t.parts.size, upcoming: t.Upcoming, completed: t.Completed, delayed: t.Delayed, ng: t.NG,
    }))
    const priority = all.filter((c) => c.delayed + c.ng > 0).sort((a, b) => b.delayed + b.ng - (a.delayed + a.ng) || a.model.localeCompare(b.model))
    const rest = all.filter((c) => c.delayed + c.ng === 0).sort((a, b) => b.parts - a.parts || a.model.localeCompare(b.model))
    return { priority, rest }
  }, [countedParts, counted, stageOf])
  const shownCards = moreModels ? [...cards.priority, ...cards.rest] : cards.priority

  const groups = useMemo(() => workspaceGroups(counted, 'model'), [counted])

  return (
    <div>
      <ExportSection id="mw-ov-kpis" label="Overview – parts, activities, models" className="mb-3 grid grid-cols-1 gap-3 2xl:grid-cols-[5fr_9fr_2fr]">
        <Segment title="Parts" icon="list">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-2">
            <KpiCard title="Under development" value={partStats.under} color="#2153f5" icon="tools" hint="Parts of models before SOP" />
            <KpiCard title="Developed (within SOP + 3 months)" value={partStats.developed} color="#10b981" icon="check" hint="Parts of models past SOP, up to SOP + 3 months" />
            <KpiCard title="Pending release" value={pendingRelease} color="#d97706" icon="reply" onClick={() => onGo('actions', { focus: 'release' })} />
            <KpiCard title="Awaiting vendor acknowledgement" value={awaitingAck} color="#2563eb" icon="clipboard" onClick={() => onGo('actions', { focus: 'release' })} />
            <KpiCard title="Returned by vendor" value={returned} color="#dc2626" icon="undo" onClick={() => onGo('actions', { focus: 'release' })} />
          </div>
        </Segment>

        <Segment title="Activities" icon="clipboard-list">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <KpiCard title="Upcoming" value={totals.Upcoming} color={WORK_BUCKET_COLORS.Upcoming} icon="calendar-month" onClick={() => onGo('insights', { bucket: 'Upcoming' })} />
            <KpiCard title="Completed" value={totals.Completed} color={WORK_BUCKET_COLORS.Completed} icon="check-circle" onClick={() => onGo('insights', { bucket: 'Completed' })} />
            <KpiCard title="Delayed" value={totals.Delayed} color={WORK_BUCKET_COLORS.Delayed} icon="exclamation-circle" onClick={() => onGo('insights', { bucket: 'Delayed' })} />
            <KpiCard title="NG / Rework" value={totals.NG} color={WORK_BUCKET_COLORS.NG} icon="close-circle" onClick={() => onGo('insights', { bucket: 'NG' })} />
            <KpiCard title="Awaiting my approval" value={act.approve} color="#0891b2" icon="check" onClick={() => onGo('worklist', { seg: 'approve' })} hint="Submitted items for you to approve or send back" />
            <KpiCard title="Sent back" value={act.sentBack} color="#dc2626" icon="undo" onClick={() => onGo('worklist', { seg: 'sentback' })} hint="Your entries sent back for correction" />
            <KpiCard title="Delay reviews" value={delayReviews} color="#2563eb" icon="calendar-month" onClick={() => onGo('actions', { focus: 'delay' })} />
            <KpiCard title="Awaiting my input" value={act.input} color="#2153f5" icon="pen" onClick={() => onGo('worklist', { seg: 'enter' })} hint="Activities open for you to fill (not started, draft or sent back)" />
            <KpiCard title="Awaiting vendor input" value={act.vendor} color="#7c3aed" icon="clipboard" onClick={() => onGo('insights')} hint="Activities the vendor fills that are not yet submitted" />
          </div>
        </Segment>

        <Segment title="Models" icon="grid">
          <div className="grid grid-cols-2 gap-2 2xl:grid-cols-1">
            <KpiCard title="Under development" value={modelStats.under} color="#2153f5" icon="tools" hint="Models before SOP" />
            <KpiCard title="Developed (within SOP + 3)" value={modelStats.developed} color="#10b981" icon="check" hint="Models past SOP, up to SOP + 3 months" />
          </div>
        </Segment>
      </ExportSection>

      {/* Model-wise cards: priority models face up */}
      <ExportSection id="mw-ov-models" label="Overview – models">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Priority models</h3>
          <span className="text-[11px] text-[var(--color-muted)]">Models with delayed or NG activities, most first. Click a model to choose its part, then the trial.</span>
        </div>
        {shownCards.length === 0 && (
          <p className="epmp-card mb-2 py-4 text-center text-[12px] text-[var(--color-muted)]">No model has delayed or NG activities.</p>
        )}
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {shownCards.map((t) => {
            const prio = t.delayed + t.ng > 0
            return (
              <button key={t.model} type="button" onClick={() => navigate(`/part-workspace?model=${encodeURIComponent(t.model)}`)}
                title={`Open ${t.model}'s parts`}
                className={`epmp-card px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${prio ? 'border-l-4 border-l-[#dc2626]' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-[var(--color-text)]">{t.model}</span>
                  <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${t.stage === 'developed' ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-primary'}`}>
                    {t.stage === 'developed' ? 'Developed' : 'Under dev.'}
                  </span>
                </div>
                <div className="mb-1.5 text-[11px] text-[var(--color-muted)]">{t.parts} part{t.parts === 1 ? '' : 's'}</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-[var(--color-muted)]">Completed</span><strong style={{ color: WORK_BUCKET_COLORS.Completed }}>{t.completed}</strong></div>
                  <div className="flex justify-between"><span className="text-[var(--color-muted)]">Delayed</span><strong style={{ color: WORK_BUCKET_COLORS.Delayed }}>{t.delayed}</strong></div>
                  <div className="flex justify-between"><span className="text-[var(--color-muted)]">NG</span><strong style={{ color: WORK_BUCKET_COLORS.NG }}>{t.ng}</strong></div>
                </div>
              </button>
            )
          })}
        </div>
        {cards.rest.length > 0 && (
          <button type="button" onClick={() => setMoreModels((v) => !v)} className="mx-auto mb-4 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
            <FbIcon name={moreModels ? 'chevron-up' : 'chevron-down'} size={14} />
            {moreModels ? 'Fewer models' : `More models (${cards.rest.length})`}
          </button>
        )}
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
