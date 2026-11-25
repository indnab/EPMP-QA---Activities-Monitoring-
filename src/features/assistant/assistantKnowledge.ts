/**
 * What the AI assistant knows: facts computed from the current role's own EPMP data (overdue, NG, release and
 * planning timelines, approvals, vendors, models, parts), a summary, and rule-based answers to common questions.
 * It is transparent and rule-based (no language model): every answer comes from these numbers and links to where
 * the detail is.
 */
import { useMemo } from 'react'
import { getFilteredData, isWorkableByVendor, workBucket } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { useWorkParts } from '../../hooks/useWorkParts'
import { usePersonaStore } from '../../store/personaStore'
import { useQAStore } from '../../store/qaStore'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { buildInsights, buildVendorScores, predictRisk } from '../lessons/insights'
import { useApprovalRows } from '../mywork/approvalRows'
import { DEMO_TODAY, partInScope } from '../scope'
import { usePlanningSla } from '../vendorplanning/planningSla'

export interface Link { label: string; to: string }
export interface Answer { text: string; links?: Link[]; bullets?: string[] }

interface Tally { name: string; n: number; overdue: number; ng: number; done: number }
export interface Facts {
  role: string
  total: number
  completed: number
  upcoming: number
  overdue: number
  ng: number
  dueSoon: number
  highRisk: number
  parts: number
  models: Tally[]
  vendors: Tally[]
  partTally: (Tally & { partName: string; model: string; vendor: string })[]
  oldestOverdue?: { activity: string; partNo: string; model: string; days: number }
  releasePending: number
  releaseOverdue: number
  ackPending: number
  ackOverdue: number
  returned: number
  planPending: number
  planExceeded: number
  planAwaiting: number
  approvals: number
  deleted: number
  insights: { title: string; detail: string; tone: string; vendorName?: string }[]
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function useFacts(): Facts {
  const { entries, activities, templateRows, models, partReleases, partAcks } = useQAStore()
  const allParts = useQAStore((s) => s.parts)
  const parts = useWorkParts()
  const { currentPersona: role } = usePersonaStore()
  const sla = usePlanningSla()
  const approvalRows = useApprovalRows()

  return useMemo<Facts>(() => {
    const scoped = parts.filter((p) => !p.supersededBy && partInScope(p, role) && (role !== 'Vendor' || isWorkableByVendor(p.partNo, partReleases, partAcks)))
    const inst: FilteredInstance[] = getFilteredData(entries, activities, scoped, templateRows, models, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY)
      .filter((i) => !i.notApplicable)
    const tally = (key: (i: FilteredInstance) => string) => {
      const m = new Map<string, Tally>()
      for (const i of inst) {
        const k = key(i)
        const t = m.get(k) ?? { name: k, n: 0, overdue: 0, ng: 0, done: 0 }
        t.n += 1
        const b = workBucket(i)
        if (b === 'Delayed') t.overdue += 1
        if (b === 'NG') t.ng += 1
        if (b === 'Completed') t.done += 1
        m.set(k, t)
      }
      return [...m.values()]
    }
    const overdueList = inst.filter((i) => workBucket(i) === 'Delayed')
    const late = (i: FilteredInstance) => (i.dates.status === 'resolved' ? days(i.dates.end, DEMO_TODAY) : 0)
    const oldest = [...overdueList].sort((a, b) => late(b) - late(a))[0]
    const ctx = { entries, parts: scoped, activities, templateRows }
    const insights = buildInsights(buildVendorScores(ctx))
    const mine = new Set(scoped.map((p) => p.partNo))
    const slas = sla.filter((s) => mine.has(s.part.partNo))
    const byPart = new Map(inst.map((i) => [i.part.partNo, i.part]))
    return {
      role,
      total: inst.length,
      completed: inst.filter((i) => workBucket(i) === 'Completed').length,
      upcoming: inst.filter((i) => workBucket(i) === 'Upcoming').length,
      overdue: overdueList.length,
      ng: inst.filter((i) => workBucket(i) === 'NG').length,
      dueSoon: inst.filter((i) => i.ryg === 'Yellow').length,
      highRisk: predictRisk(ctx, inst.map((i) => ({ partNo: i.part.partNo, activityId: i.activity.id, templateRowId: i.row.id, ryg: String(i.ryg) }))).filter((r) => r.level === 'High').length,
      parts: scoped.length,
      models: tally((i) => i.part.model).sort((a, b) => b.overdue - a.overdue || b.ng - a.ng),
      vendors: tally((i) => i.part.vendorName).sort((a, b) => b.overdue - a.overdue || b.ng - a.ng),
      partTally: tally((i) => i.part.partNo).map((t) => { const p = byPart.get(t.name)!; return { ...t, partName: p.partName, model: p.model, vendor: p.vendorName } }),
      oldestOverdue: oldest ? { activity: oldest.activity.name, partNo: oldest.part.partNo, model: oldest.part.model, days: late(oldest) } : undefined,
      releasePending: slas.filter((s) => s.state === 'Pending').length,
      releaseOverdue: slas.filter((s) => s.releaseOverdue).length,
      ackPending: slas.filter((s) => s.state === 'Released').length,
      ackOverdue: slas.filter((s) => s.ackOverdue).length,
      returned: slas.filter((s) => s.state === 'Returned').length,
      planPending: slas.filter((s) => s.planPending).length,
      planExceeded: slas.filter((s) => s.planExceeded).length,
      planAwaiting: slas.reduce((n, s) => n + s.planAwaiting, 0),
      approvals: approvalRows.filter((r) => r.mode === 'approve').length,
      deleted: allParts.filter((p) => p.sourceDeleted && !p.supersededBy && partInScope(p, role)).length,
      insights: insights.map((x) => ({ title: x.title, detail: x.detail, tone: x.tone, vendorName: x.vendorName })),
    }
  }, [entries, activities, templateRows, models, partReleases, partAcks, parts, allParts, role, sla, approvalRows])
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The "AI Insights Summary": a short briefing for the current role. */
export function summary(f: Facts): { lead: string; bullets: string[] } {
  const bullets: string[] = []
  if (f.overdue) bullets.push(`${plural(f.overdue, 'activity is', 'activities are')} past the planned end${f.dueSoon ? `, and ${f.dueSoon} more fall due within 7 days` : ''}.`)
  else if (f.dueSoon) bullets.push(`${plural(f.dueSoon, 'activity falls', 'activities fall')} due within 7 days.`)
  else bullets.push('Nothing is overdue or due within 7 days.')
  if (f.highRisk) bullets.push(`The forecast rates ${plural(f.highRisk, 'part-activity', 'part-activities')} at high risk of slipping.`)
  const m = f.models.find((x) => x.overdue > 0)
  if (m && f.models.length > 1) bullets.push(`${m.name} has the most overdue work (${m.overdue} of ${f.overdue}).`)
  if (f.ng) bullets.push(`${plural(f.ng, 'activity is', 'activities are')} NG / in rework.`)
  if (f.role !== 'Vendor') {
    if (f.releaseOverdue) bullets.push(`${plural(f.releaseOverdue, 'part')} pending release for over 7 days.`)
    if (f.ackOverdue) bullets.push(`${plural(f.ackOverdue, 'part')} not acknowledged by the vendor within 3 days.`)
    if (f.planExceeded) bullets.push(`Vendor planned dates are overdue for ${plural(f.planExceeded, 'part')} (past acknowledgement + 15 days).`)
    if (f.planAwaiting) bullets.push(`${plural(f.planAwaiting, 'vendor planned date')} outside the window await${f.planAwaiting === 1 ? 's' : ''} your approval.`)
  } else {
    if (f.ackOverdue) bullets.push(`${plural(f.ackOverdue, 'part')} not acknowledged within 3 days.`)
    if (f.planPending) bullets.push(`Planned dates are still pending for ${plural(f.planPending, 'part')}${f.planExceeded ? `, ${f.planExceeded} past the due date` : ''}.`)
  }
  const top = f.insights.find((x) => x.tone === 'risk') ?? f.insights[0]
  if (top) bullets.push(`${top.title}. ${top.detail}`)
  const lead = f.overdue || f.ng
    ? `Here is where your attention is needed (${f.role}, ${plural(f.parts, 'part')}, ${plural(f.total, 'activity', 'activities')}).`
    : `You are on track (${f.role}, ${plural(f.parts, 'part')}, ${plural(f.total, 'activity', 'activities')}).`
  return { lead, bullets: bullets.slice(0, 7) }
}

export const SUGGESTIONS = ['Summary', 'What is overdue?', 'Which vendor is riskiest?', 'Pending release', 'Planning status', 'What needs my approval?']

/** Rule-based answer to a question. */
export function answer(q: string, f: Facts): Answer {
  const s = q.toLowerCase().trim()
  // A keyword matches at the start of a word (so "ng" is not found inside "pending").
  const has = (...w: string[]) => w.some((x) => new RegExp(`(^|[^a-z0-9])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(s))
  const top = (xs: Tally[], k: 'overdue' | 'ng') => xs.filter((x) => x[k] > 0).slice(0, 3)
  const fmtTop = (xs: Tally[], k: 'overdue' | 'ng') => top(xs, k).map((x) => `${x.name}: ${x[k]} ${k === 'overdue' ? 'overdue' : 'NG'} of ${x.n}`)

  // A part number or name mentioned.
  const part = f.partTally.find((p) => s.includes(p.name.toLowerCase()) || (p.partName.length > 4 && s.includes(p.partName.toLowerCase())))
  if (part) {
    return {
      text: `${part.name} · ${part.partName} (${part.model}, ${part.vendor}): ${plural(part.n, 'activity', 'activities')}, ${part.done} completed, ${part.overdue} overdue, ${part.ng} NG.`,
      links: [{ label: 'Open in My Work', to: `/mywork?view=overview` }, { label: 'Vendor Planning', to: '/vendor-planning' }],
    }
  }
  // A model or vendor named.
  const model = f.models.find((m) => s.includes(m.name.toLowerCase()))
  if (model) {
    const pct = model.n ? Math.round((model.done / model.n) * 100) : 0
    return { text: `${model.name}: ${plural(model.n, 'activity', 'activities')}, ${model.done} completed (${pct}%), ${model.overdue} overdue, ${model.ng} NG.`, links: [{ label: 'My Screen', to: '/mywork?view=myscreen' }] }
  }
  const vend = f.vendors.find((v) => s.includes(v.name.toLowerCase().split(' ')[0]) && v.name.split(' ')[0].length > 3)
  if (vend) return { text: `${vend.name}: ${plural(vend.n, 'activity', 'activities')}, ${vend.done} completed, ${vend.overdue} overdue, ${vend.ng} NG.`, links: [{ label: 'Lessons Learnt', to: '/lessons' }] }

  if (has('overdue', 'late', 'delayed', 'behind')) {
    if (!f.overdue) return { text: 'Nothing is overdue right now.' }
    return {
      text: `${plural(f.overdue, 'activity is', 'activities are')} overdue.${f.oldestOverdue ? ` The oldest is “${f.oldestOverdue.activity}” on ${f.oldestOverdue.partNo} (${f.oldestOverdue.model}), ${f.oldestOverdue.days} days late.` : ''}`,
      bullets: [...fmtTop(f.models, 'overdue').map((x) => `Model ${x}`), ...fmtTop(f.vendors, 'overdue').map((x) => `Vendor ${x}`)],
      links: [{ label: 'Overdue in My Work', to: '/mywork?bucket=Delayed' }],
    }
  }
  if (has('ng', 'rework', 'reject', 'sent back', 'quality')) {
    if (!f.ng) return { text: 'No activities are NG / in rework.' }
    return { text: `${plural(f.ng, 'activity is', 'activities are')} NG / in rework.`, bullets: [...fmtTop(f.models, 'ng').map((x) => `Model ${x}`), ...fmtTop(f.vendors, 'ng').map((x) => `Vendor ${x}`)], links: [{ label: 'NG in My Work', to: '/mywork?bucket=NG' }] }
  }
  if (has('vendor', 'supplier', 'risk')) {
    const risky = f.insights.filter((x) => x.tone === 'risk').slice(0, 3)
    return {
      text: risky.length ? 'Vendors needing attention, from their track record:' : 'No vendor stands out as a risk from the track record.',
      bullets: [...risky.map((x) => `${x.title}. ${x.detail}`), ...fmtTop(f.vendors, 'overdue').map((x) => `${x} (current)`)],
      links: [{ label: 'Lessons Learnt', to: '/lessons' }],
    }
  }
  if (has('release', 'acknowledg', 'ack')) {
    return {
      text: f.role === 'Vendor'
        ? `${plural(f.ackPending, 'part')} awaiting your acknowledgement, ${f.ackOverdue} of them past 3 days.`
        : `${plural(f.releasePending, 'part')} pending release (${f.releaseOverdue} over 7 days). ${plural(f.ackPending, 'part')} waiting for the vendor to acknowledge (${f.ackOverdue} over 3 days). ${f.returned} returned by the vendor.`,
      links: [{ label: 'My Parts', to: '/mywork?view=actions' }],
    }
  }
  if (has('plan', 'timeline', 'window', 'gantt')) {
    return {
      text: `${plural(f.planPending, 'part')} still need vendor planned dates, ${f.planExceeded} past the ack + 15 day due date. ${plural(f.planAwaiting, 'planned date')} outside the window ${f.planAwaiting === 1 ? 'is' : 'are'} waiting for PIC approval.`,
      links: [{ label: 'Vendor Planning', to: '/vendor-planning' }],
    }
  }
  if (has('approv', 'review', 'validate', 'my action', 'to do', 'todo')) {
    return { text: f.approvals ? `${plural(f.approvals, 'item')} waiting for your approval.` : 'Nothing is waiting for your approval.', links: [{ label: 'My Approvals', to: '/mywork?view=worklist' }] }
  }
  if (has('delete', 'removed')) {
    return { text: f.deleted ? `${plural(f.deleted, 'part')} deleted in SAP / ENOVIA (recalled from the vendor; data kept, back if reactivated).` : 'No parts are deleted in SAP / ENOVIA.', links: [{ label: 'My Parts', to: '/mywork?view=actions&slice=deleted' }] }
  }
  if (has('usage', 'login', 'adoption')) return { text: 'The Usage Report shows portal adoption: active and inactive MSIL users and vendors, usage frequency and average time spent.', links: [{ label: 'Usage Report', to: '/usage' }] }
  if (has('how many part', 'parts', 'models')) return { text: `${plural(f.parts, 'part')} across ${plural(f.models.length, 'model')}, ${plural(f.vendors.length, 'vendor')}; ${plural(f.total, 'activity', 'activities')} in all.`, links: [{ label: 'My Screen', to: '/mywork?view=myscreen' }] }
  if (has('summary', 'overview', 'status', 'brief', 'insight', 'how am i', 'how are we', 'what should i')) {
    const sm = summary(f)
    return { text: sm.lead, bullets: sm.bullets, links: [{ label: 'My Work', to: '/mywork' }] }
  }
  if (has('hello', 'hey', 'help') || s === 'hi') return { text: `Hello! I can brief you on ${f.role} work. Ask about overdue, NG, vendors, release and acknowledgement, planning, approvals, or name a part, model or vendor.` }
  return { text: 'I can answer about overdue and NG work, vendors, release and acknowledgement, planning timelines, approvals, or a part, model or vendor you name. Try one of the suggestions below.' }
}

