/**
 * Project Execution roll-up (one row per WBS object of the project's archetype) and the derived project team.
 * QA rows are rolled up from the same part × activity instances the work screens use.
 */
import type { ActivityDefinition, ActivityEntry, ModelRecord, PartRecord, PicAssignment, ProjectArchetype, TemplateRow, WbsObject } from '../domain'
import { isBuildable } from '../domain'
import type { Project } from '../domain/projects'
import { projectParts } from '../domain/projects'
import { DEP_LABEL, WBS_TYPE_LABEL } from '../domain/governance'
import type { PersonaId } from '../store/personaStore'
import { completionPct, getFilteredData, getPicOn, workBucket } from './index'
import { partInScope } from '../features/scope'

export type ExecutionRyg = 'Red' | 'Yellow' | 'Green' | 'NA'

export interface ExecutionRowLink { rowId: string; label: string; instances: number }

export interface ExecutionRow {
  obj: WbsObject
  kind: 'qa' | 'other'
  activity?: ActivityDefinition
  partsInScope: number
  completionPct: number
  ryg: ExecutionRyg
  delayed: number
  ng: number
  links: ExecutionRowLink[]
  typeLabel: string
  dependencyLabel: string
}

/** Worst-of: Red > Yellow > Green; nothing dated → NA. */
export function worstRyg(list: string[]): ExecutionRyg {
  if (list.includes('Red')) return 'Red'
  if (list.includes('Yellow')) return 'Yellow'
  if (list.includes('Green')) return 'Green'
  return 'NA'
}

function describeDependency(obj: WbsObject, arc: ProjectArchetype): string {
  const d = obj.dependency
  if (!d) return ''
  const on = arc.wbs.find((o) => o.id === d.onObjectId)?.name ?? '—'
  return `${DEP_LABEL[d.type]} · ${on}${d.lagDays ? ` · +${d.lagDays}d` : ''}`
}

const ALL = { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' } as const

export function buildExecutionRows(args: {
  project: Project
  archetype: ProjectArchetype
  entries: ActivityEntry[]
  activities: ActivityDefinition[]
  parts: PartRecord[]
  templateRows: TemplateRow[]
  models: ModelRecord[]
  persona: PersonaId
  today: string
}): ExecutionRow[] {
  const { project, archetype, entries, activities, parts, templateRows, models, persona, today } = args
  const projParts = projectParts(project, parts).filter((p) => partInScope(p, persona))
  return archetype.wbs.map((obj) => {
    const base = {
      obj, typeLabel: WBS_TYPE_LABEL[obj.type], dependencyLabel: describeDependency(obj, archetype),
      partsInScope: 0, completionPct: 0, ryg: 'NA' as ExecutionRyg, delayed: 0, ng: 0, links: [] as ExecutionRowLink[],
    }
    if (!isBuildable(obj) || !obj.activityId) return { ...base, kind: 'other' as const }
    const activity = activities.find((a) => a.id === obj.activityId)
    // Unpublished (not yet built) activities produce no instances.
    const insts = projParts.length ? getFilteredData(entries, activities, projParts, templateRows, models, { ...ALL }, obj.activityId, today) : []
    const live = insts.filter((i) => !i.notApplicable)
    const byRow = new Map<string, ExecutionRowLink>()
    for (const i of insts) {
      const l = byRow.get(i.row.id) ?? { rowId: i.row.id, label: `${i.row.section} · ${i.row.milestoneId}${i.row.subType ? ` · ${i.row.subType}` : ''}`, instances: 0 }
      l.instances += 1
      byRow.set(i.row.id, l)
    }
    return {
      ...base, kind: 'qa' as const, activity,
      partsInScope: new Set(insts.map((i) => i.part.partNo)).size,
      completionPct: completionPct(insts),
      ryg: worstRyg(live.map((i) => String(i.ryg))),
      delayed: insts.filter((i) => workBucket(i) === 'Delayed').length,
      ng: insts.filter((i) => workBucket(i) === 'NG').length,
      links: [...byRow.values()],
    }
  })
}

export interface ProjectTeam {
  pics: { name: string; parts: number }[]
  vendors: { name: string; parts: number }[]
  sections: { section: string; parts: number }[]
}

const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m.entries()].map(([name, parts]) => ({ name, parts })).sort((a, b) => b.parts - a.parts || a.name.localeCompare(b.name))
}

/** Derived team — no manual tagging: PIC per part (incl. PIC Assignments), vendors and sections of the project's parts. */
export function deriveTeam(args: { project: Project; parts: PartRecord[]; picAssignments: PicAssignment[]; persona: PersonaId; today: string }): ProjectTeam {
  const projParts = projectParts(args.project, args.parts).filter((p) => partInScope(p, args.persona))
  return {
    pics: countBy(projParts, (p) => getPicOn(p, args.picAssignments, args.today).name || 'Unassigned'),
    vendors: countBy(projParts, (p) => p.vendorName || '—'),
    sections: countBy(projParts, (p) => p.section).map((s) => ({ section: s.name, parts: s.parts })).sort((a, b) => a.section.localeCompare(b.section)),
  }
}
