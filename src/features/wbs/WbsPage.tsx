import { useMemo, useState } from 'react'
import { PageHeader, Card } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { getFilteredData } from '../../engine'
import type { FilteredInstance, InstanceStatus } from '../../engine'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { DEMO_TODAY, fmtDate } from '../scope'

const MS_ORDER = ['PP', 'MPP', 'Pilot', 'SOP']

type NodeKind = 'milestone' | 'part' | 'activity'

interface WbsNode {
  id: string            // WBS id, e.g. '100', '100.1', '100.1.1'
  kind: NodeKind
  label: string
  /** Earned-value weightage % (rolls up at parent level). */
  weight: number
  /** Planned effort in days (activity = date span; parent = sum). */
  effort: number
  start?: string
  end?: string
  status: string
  children?: WbsNode[]
  depth: number
}

const STATUS_STYLE: Record<string, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ongoing: 'bg-blue-50 text-blue-700 border-blue-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'Sent back': 'bg-amber-50 text-amber-800 border-amber-200',
  Open: 'bg-slate-50 text-slate-600 border-slate-200',
  'Not Started': 'bg-slate-50 text-slate-600 border-slate-200',
  NotStarted: 'bg-slate-50 text-slate-600 border-slate-200'
}

/** Map the instance status to a PM-friendly status word. */
function pmStatus(s: InstanceStatus): string {
  if (s === 'Approved') return 'Completed'
  if (s === 'Submitted' || s === 'Sent back') return 'Ongoing'
  return 'Open'
}

function daySpan(start?: string, end?: string): number {
  if (!start || !end) return 0
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function WbsPage() {
  const { entries, activities, parts, templateRows, models } = useQAStore()

  const modelNames = useMemo(() => models.map((m) => m.name), [models])
  const [model, setModel] = useState(modelNames[0] ?? '')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const instances = useMemo<FilteredInstance[]>(
    () => getFilteredData(entries, activities, parts, templateRows, models, { ...EMPTY_FILTERS, model: model || 'All' }, 'overview', DEMO_TODAY),
    [entries, activities, parts, templateRows, models, model]
  )

  // Build the tree: Milestone → Part → Activity.
  const tree = useMemo<WbsNode[]>(() => {
    const byMs = new Map<string, Map<string, FilteredInstance[]>>()
    for (const inst of instances) {
      const ms = inst.row.milestoneId
      const partMap = byMs.get(ms) ?? new Map<string, FilteredInstance[]>()
      const arr = partMap.get(inst.part.partNo) ?? []
      arr.push(inst)
      partMap.set(inst.part.partNo, arr)
      byMs.set(ms, partMap)
    }
    const milestones = Array.from(byMs.keys()).sort((a, b) => (MS_ORDER.indexOf(a) + 1 || 99) - (MS_ORDER.indexOf(b) + 1 || 99))
    const nodes: WbsNode[] = []
    milestones.forEach((ms, mi) => {
      const partMap = byMs.get(ms)!
      const partNos = Array.from(partMap.keys()).sort()
      const msId = `${(mi + 1) * 100}`
      const partNodes: WbsNode[] = []
      partNos.forEach((pno, pi) => {
        const insts = partMap.get(pno)!.sort((a, b) => a.activity.id.localeCompare(b.activity.id, undefined, { numeric: true }))
        const part = insts[0].part
        const partId = `${msId}.${pi + 1}`
        const actNodes: WbsNode[] = insts.map((inst, ai) => {
          const start = inst.dates.status === 'resolved' ? inst.dates.start : undefined
          const end = inst.dates.status === 'resolved' ? inst.dates.end : undefined
          return {
            id: `${partId}.${ai + 1}`, kind: 'activity', label: inst.activity.name,
            weight: 5, effort: daySpan(start, end), start, end,
            status: inst.notApplicable ? 'Open' : pmStatus(inst.status), depth: 2
          }
        })
        const starts = actNodes.map((a) => a.start).filter(Boolean).sort()
        const ends = actNodes.map((a) => a.end).filter(Boolean).sort()
        partNodes.push({
          id: partId, kind: 'part', label: `${part.partNo} — ${part.partName}`,
          weight: actNodes.reduce((n, a) => n + a.weight, 0),
          effort: actNodes.reduce((n, a) => n + a.effort, 0),
          start: starts[0], end: ends[ends.length - 1],
          status: actNodes.every((a) => a.status === 'Completed') ? 'Completed' : actNodes.some((a) => a.status === 'Ongoing' || a.status === 'Completed') ? 'Ongoing' : 'Open',
          children: actNodes, depth: 1
        })
      })
      const starts = partNodes.map((p) => p.start).filter(Boolean).sort()
      const ends = partNodes.map((p) => p.end).filter(Boolean).sort()
      nodes.push({
        id: msId, kind: 'milestone', label: `${ms} Milestone`,
        weight: partNodes.reduce((n, p) => n + p.weight, 0),
        effort: partNodes.reduce((n, p) => n + p.effort, 0),
        start: starts[0], end: ends[ends.length - 1],
        status: partNodes.every((p) => p.status === 'Completed') ? 'Completed' : partNodes.some((p) => p.status !== 'Open') ? 'Ongoing' : 'Open',
        children: partNodes, depth: 0
      })
    })
    return nodes
  }, [instances])

  // Flatten respecting collapse state.
  const flat = useMemo<WbsNode[]>(() => {
    const out: WbsNode[] = []
    const walk = (nodes: WbsNode[]) => {
      for (const n of nodes) {
        out.push(n)
        if (n.children && !collapsed.has(n.id)) walk(n.children)
      }
    }
    walk(tree)
    return out
  }, [tree, collapsed])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const kindTag: Record<NodeKind, string> = {
    milestone: 'bg-indigo-100 text-indigo-700',
    part: 'bg-sky-100 text-sky-700',
    activity: 'bg-slate-100 text-slate-600'
  }

  return (
    <div>
      <PageHeader
        title="WBS Management"
        section="Project Execution"
        description="Work breakdown structure per model — Milestone → Part → Activity — with planned effort, dates, dependency and status."
      />

      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Model
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] font-normal normal-case text-[#344054]"
          >
            {modelNames.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <button onClick={() => setCollapsed(new Set())} className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 font-medium text-[#344054] hover:border-[#bfdbfe]">Expand all</button>
          <button
            onClick={() => setCollapsed(new Set(tree.flatMap((m) => [m.id, ...(m.children ?? []).map((p) => p.id)])))}
            className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 font-medium text-[#344054] hover:border-[#bfdbfe]"
          >
            Collapse all
          </button>
        </div>
      </section>

      {flat.length === 0 ? (
        <Card><p className="py-10 text-center text-sm text-[var(--color-muted)]">No activities for this model yet.</p></Card>
      ) : (
        <Card flush>
          <div className="table-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                  <th className="px-4 py-3 min-w-[110px]">WBS ID</th>
                  <th className="px-4 py-3 min-w-[280px]">Milestone / Part / Activity</th>
                  <th className="px-4 py-3 text-right">EV Weightage (%)</th>
                  <th className="px-4 py-3 text-right">Planned Effort (d)</th>
                  <th className="px-4 py-3">Planned Start</th>
                  <th className="px-4 py-3">Planned End</th>
                  <th className="px-4 py-3">Dependency</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {flat.map((n) => {
                  const hasKids = !!n.children?.length
                  const isOpen = !collapsed.has(n.id)
                  return (
                    <tr key={n.id} className={`border-b border-[var(--color-border)] last:border-0 ${n.kind === 'milestone' ? 'bg-[#f5f7ff]' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-muted)]">WBS-{n.id}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2" style={{ paddingLeft: `${n.depth * 20}px` }}>
                          {hasKids ? (
                            <button onClick={() => toggle(n.id)} className="flex h-4 w-4 flex-none items-center justify-center text-[var(--color-muted)]">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}><path d="M3.5 2.5 6.5 5 3.5 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          ) : <span className="h-4 w-4 flex-none" />}
                          <span className={`flex-none rounded px-1.5 py-0.5 text-[9px] font-medium capitalize ${kindTag[n.kind]}`}>{n.kind}</span>
                          <span className={`${n.kind === 'milestone' ? 'font-semibold text-[#101828]' : n.kind === 'part' ? 'font-medium text-[#101828]' : 'text-[#344054]'}`}>{n.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{n.weight}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{n.effort || '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-muted)]">{n.start ? fmtDate(n.start) : '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-muted)]">{n.end ? fmtDate(n.end) : '—'}</td>
                      <td className="px-4 py-2.5">
                        {n.kind === 'activity'
                          ? <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-primary">Finish to Start (FS)</span>
                          : <span className="text-[var(--color-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[n.status] ?? STATUS_STYLE.Open}`}>{n.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
