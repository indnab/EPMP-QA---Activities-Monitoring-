/**
 * My Workspace → Overview building blocks: compact KPI segments (Parts, Activities, Models) that sit beside the
 * "Workspace by" chart, and the model-wise cards (priority models face up, the rest behind "More models").
 * Every number opens the matching list.
 *
 * Development stage of a model, from its SOP date (its archetype's last milestone date): before SOP = under
 * development; SOP to SOP + 3 months = developed; after SOP + 3 months it drops out of these counts.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon as FbIcon } from '../../components/Icon'
import type { PartRecord } from '../../domain'
import { projectOfModel } from '../../domain/projects'
import { milestoneRows } from '../../domain/wbsTree'
import { bucketTotals, workBucket, WORK_BUCKET_COLORS } from '../../engine'
import { useApprovalRows } from './approvalRows'
import type { FilteredInstance, WorkBucket } from '../../engine'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY } from '../scope'
import { ExportSection } from '../export/ExportSection'

export type OverviewGo = (
  t: 'overview' | 'actions' | 'worklist' | 'insights' | 'calendar',
  payload?: { bucket?: WorkBucket; focus?: string; group?: string; seg?: 'enter' | 'approve' | 'sentback' }
) => void

/** Compact KPI tile: label on top, number below. */
function KpiCard({ title, value, color, icon, onClick, hint }: { title: string; value: number; color: string; icon: string; onClick?: () => void; hint?: string }) {
  const body = (
    <>
      <span className="flex min-w-0 items-start gap-1 text-[10px] font-medium leading-tight text-[var(--color-muted)]">
        <FbIcon name={icon} size={11} style={{ color }} className="mt-px" /> <span className="line-clamp-2">{title}</span>
      </span>
      <span className="text-[16px] font-bold leading-none" style={{ color }}>{value}</span>
    </>
  )
  const cls = 'flex min-w-0 flex-col justify-between gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} title={hint ?? title} data-export-stat={title} data-export-stat-value={value}
      className={`${cls} transition-colors hover:border-[#bfdbfe] hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={hint ?? title} data-export-stat={title} data-export-stat-value={value}>{body}</div>
  )
}

function Segment({ title, icon, children, className = '' }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`epmp-card p-3 ${className}`}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#344054]"><FbIcon name={icon} size={12} />{title}</h3>
      {children}
    </section>
  )
}

const addMonths = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}

/** Development stage per model (see the file comment). */
function useModelStages(parts: PartRecord[]) {
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

/** Parts / Activities / Models KPI segments, compact, for the left of the "Workspace by" chart. */
export function OverviewKpis({ instances, parts, pendingRelease, awaitingAck, returned, delayReviews, onGo }: {
  /** The role's activity instances (part × activity), after the page filters. */
  instances: FilteredInstance[]
  /** The role's parts, after the page filters. */
  parts: PartRecord[]
  pendingRelease: number
  awaitingAck: number
  returned: number
  delayReviews: number
  onGo: OverviewGo
}) {
  const approvalRows = useApprovalRows()
  const stageOf = useModelStages(parts)
  // Parts and activities are counted up to SOP + 3 months.
  const counted = useMemo(() => instances.filter((i) => stageOf.get(i.part.model) !== 'past'), [instances, stageOf])
  const totals = useMemo(() => bucketTotals(counted), [counted])
  const partStats = useMemo(() => ({
    under: parts.filter((p) => stageOf.get(p.model) === 'under').length,
    developed: parts.filter((p) => stageOf.get(p.model) === 'developed').length,
  }), [parts, stageOf])
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

  return (
    <ExportSection id="mw-ov-kpis" label="Overview – parts, activities, models" className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3.6fr)_minmax(0,7fr)_minmax(140px,1.2fr)]">
      <Segment title="Parts" icon="list">
        <div className="grid grid-cols-3 gap-1.5">
          <KpiCard title="Under dev." value={partStats.under} color="#2153f5" icon="tools" hint="Under development: parts of models before SOP" />
          <KpiCard title="Developed" value={partStats.developed} color="#10b981" icon="check" hint="Developed: parts of models past SOP, up to SOP + 3 months" />
          <KpiCard title="Pending release" value={pendingRelease} color="#d97706" icon="reply" onClick={() => onGo('actions', { focus: 'release' })} />
          <KpiCard title="Awaiting vendor ack." value={awaitingAck} color="#2563eb" icon="clipboard" onClick={() => onGo('actions', { focus: 'release' })} hint="Released, awaiting vendor acknowledgement" />
          <KpiCard title="Returned by vendor" value={returned} color="#dc2626" icon="undo" onClick={() => onGo('actions', { focus: 'release' })} />
        </div>
      </Segment>
      <Segment title="Activities" icon="clipboard-list">
        <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-5">
          <KpiCard title="Upcoming" value={totals.Upcoming} color={WORK_BUCKET_COLORS.Upcoming} icon="calendar-month" onClick={() => onGo('overview', { bucket: 'Upcoming' })} />
          <KpiCard title="Completed" value={totals.Completed} color={WORK_BUCKET_COLORS.Completed} icon="check-circle" onClick={() => onGo('overview', { bucket: 'Completed' })} />
          <KpiCard title="Delayed" value={totals.Delayed} color={WORK_BUCKET_COLORS.Delayed} icon="exclamation-circle" onClick={() => onGo('overview', { bucket: 'Delayed' })} />
          <KpiCard title="NG / Rework" value={totals.NG} color={WORK_BUCKET_COLORS.NG} icon="close-circle" onClick={() => onGo('overview', { bucket: 'NG' })} />
          <KpiCard title="Awaiting my approval" value={act.approve} color="#0891b2" icon="check" onClick={() => onGo('worklist', { seg: 'approve' })} hint="Submitted items for you to approve or send back" />
          <KpiCard title="Sent back" value={act.sentBack} color="#dc2626" icon="undo" onClick={() => onGo('worklist', { seg: 'sentback' })} hint="Your entries sent back for correction" />
          <KpiCard title="Delay reviews" value={delayReviews} color="#2563eb" icon="calendar-month" onClick={() => onGo('actions', { focus: 'delay' })} />
          <KpiCard title="Awaiting my input" value={act.input} color="#2153f5" icon="pen" onClick={() => onGo('worklist', { seg: 'enter' })} hint="Activities open for you to fill (not started, draft or sent back)" />
          <KpiCard title="Awaiting vendor input" value={act.vendor} color="#7c3aed" icon="clipboard" onClick={() => onGo('overview')} hint="Activities the vendor fills that are not yet submitted" />
        </div>
      </Segment>
      <Segment title="Models" icon="grid">
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
          <KpiCard title="Under dev." value={modelStats.under} color="#2153f5" icon="tools" hint="Under development: models before SOP" />
          <KpiCard title="Developed" value={modelStats.developed} color="#10b981" icon="check" hint="Developed: models past SOP, up to SOP + 3 months" />
        </div>
      </Segment>
    </ExportSection>
  )
}

/** Model-wise cards: priority models (delayed or NG activities, most first) face up; the rest behind "More models". */
export function PriorityModels({ instances, parts, className = '' }: { instances: FilteredInstance[]; parts: PartRecord[]; className?: string }) {
  const navigate = useNavigate()
  const stageOf = useModelStages(parts)
  const [moreModels, setMoreModels] = useState(false)
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
  const shown = moreModels ? [...cards.priority, ...cards.rest] : cards.priority

  return (
    <ExportSection id="mw-ov-models" label="Overview – models" className={`epmp-card flex min-h-0 flex-col p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Priority Models</h3>
        <span className="ml-auto text-[11px] text-[var(--color-muted)]" title="Click a model to choose its part, then the trial.">Models with delayed or NG activities, most first</span>
        {cards.rest.length > 0 && (
          <button type="button" onClick={() => setMoreModels((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
            <FbIcon name={moreModels ? 'chevron-up' : 'chevron-down'} size={13} />
            {moreModels ? 'Fewer models' : `More models (${cards.rest.length})`}
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">No model has delayed or NG activities.</p>
      ) : (
        <div className="grid min-h-0 grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3">
          {shown.map((t) => (
            <button key={t.model} type="button" onClick={() => navigate(`/part-workspace?model=${encodeURIComponent(t.model)}`)}
              title={`Open ${t.model}'s parts`}
              className={`rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${t.delayed + t.ng > 0 ? 'border-l-4 border-l-[#dc2626]' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-[var(--color-text)]">{t.model}</span>
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
      )}
    </ExportSection>
  )
}
