/**
 * Archetype WBS as a tree: Milestone → Activity → Task → Sub-task. Rows are stored flat (`parentId`), and every
 * archetype defines its own milestones and their planned dates (the milestone's own date plus any MRD types).
 * Planned dates are entered per model; their keys on ModelRecord.mrds are the milestone id (own date) or
 * '<milestoneId>:<dateTypeId>'.
 */
import type { MilestoneDef, ProjectArchetype, WbsLevel, WbsObject } from './index'

export const WBS_LEVELS: WbsLevel[] = ['Milestone', 'Activity', 'Task', 'Subtask']
export const WBS_LEVEL_LABEL: Record<WbsLevel, string> = { Milestone: 'Milestone', Activity: 'Activity', Task: 'Task', Subtask: 'Sub-task' }

/** The level a child of `level` gets, or undefined for the lowest level. */
export const childLevel = (level: WbsLevel): WbsLevel | undefined => WBS_LEVELS[WBS_LEVELS.indexOf(level) + 1]

export interface WbsNode {
  obj: WbsObject
  /** e.g. 'WBS-2.1.1' */
  code: string
  depth: number
}

/** Pre-order walk with WBS codes. A row whose parent is missing is treated as top-level. */
export function wbsTree(wbs: WbsObject[]): WbsNode[] {
  const ids = new Set(wbs.map((o) => o.id))
  const kids = new Map<string, WbsObject[]>()
  for (const o of wbs) {
    const p = o.parentId && ids.has(o.parentId) ? o.parentId : ''
    kids.set(p, [...(kids.get(p) ?? []), o])
  }
  const out: WbsNode[] = []
  const walk = (parent: string, prefix: string, depth: number) =>
    (kids.get(parent) ?? []).forEach((o, i) => {
      const n = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      out.push({ obj: o, code: `WBS-${n}`, depth })
      walk(o.id, n, depth + 1)
    })
  walk('', '', 0)
  return out
}

/** Ids of a row and everything under it. */
export function subtreeIds(wbs: WbsObject[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const o of wbs) if (o.parentId && out.has(o.parentId) && !out.has(o.id)) { out.add(o.id); grew = true }
  }
  return out
}

/** Insert a new child of `parentId` after the parent's last descendant (keeps the flat list in tree order). */
export function insertChild(wbs: WbsObject[], parentId: string, child: WbsObject): WbsObject[] {
  const sub = subtreeIds(wbs, parentId)
  let at = -1
  wbs.forEach((o, i) => { if (sub.has(o.id)) at = i })
  return at < 0 ? [...wbs, child] : [...wbs.slice(0, at + 1), child, ...wbs.slice(at + 1)]
}

/** The Milestone row a row sits under (itself if it is a Milestone). */
export function milestoneOf(wbs: WbsObject[], obj: WbsObject): WbsObject | undefined {
  let cur: WbsObject | undefined = obj
  const seen = new Set<string>()
  while (cur && cur.level !== 'Milestone' && cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id)
    cur = wbs.find((o) => o.id === cur!.parentId)
  }
  return cur?.level === 'Milestone' ? cur : undefined
}

export const milestoneRows = (arc: ProjectArchetype | undefined): WbsObject[] =>
  arc ? wbsTree(arc.wbs).map((n) => n.obj).filter((o) => o.level === 'Milestone') : []

/** Key of a planned date on ModelRecord.mrds: the milestone id for its own date, else '<milestoneId>:<typeId>'. */
export const mrdKey = (milestoneId: string, typeId?: string): string => (typeId ? `${milestoneId}:${typeId}` : milestoneId)

/** One planned date of a milestone: its own date ('' typeId) or one of its date types. */
export interface DateOption {
  typeId: string
  label: string
  required: boolean
}

export function dateOptions(ms: WbsObject): DateOption[] {
  const name = ms.name.trim() || 'Milestone'
  return [
    { typeId: '', label: `${name} date`, required: !!ms.dateRequired },
    ...(ms.dateTypes ?? []).filter((t) => t.label.trim()).map((t) => ({ typeId: t.id, label: t.label.trim(), required: !!t.required })),
  ]
}

export interface PlannedDateField {
  key: string
  label: string
  milestoneId: string
  milestoneName: string
  typeId: string
  required: boolean
}

/** Every planned date an archetype asks for, in WBS order. */
export function plannedDateFields(arc: ProjectArchetype | undefined): PlannedDateField[] {
  return milestoneRows(arc).flatMap((ms) =>
    dateOptions(ms).map((d) => ({
      key: mrdKey(ms.id, d.typeId), label: d.label, milestoneId: ms.id, milestoneName: ms.name, typeId: d.typeId, required: d.required,
    }))
  )
}

/** Label of a planned-date key, looked up across archetypes (falls back to the key). */
export function plannedDateLabel(archetypes: ProjectArchetype[], key: string): string {
  for (const a of archetypes) {
    const f = plannedDateFields(a).find((x) => x.key === key)
    if (f) return f.typeId ? `${f.milestoneName} · ${f.label}` : f.label
  }
  return key
}

/** Required planned dates that are blank. Returns key → message. */
export function validatePlannedDates(fields: PlannedDateField[], mrds: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) if (f.required && !mrds[f.key]) errors[f.key] = `${f.label} is required.`
  return errors
}

/**
 * The milestone list used by filters, dashboards and section templates: every archetype's milestones. Milestones
 * are independent per archetype, so a name used by two archetypes is shown with the archetype id.
 */
export function deriveMilestones(archetypes: ProjectArchetype[]): MilestoneDef[] {
  const rows = archetypes.flatMap((a) => milestoneRows(a).map((m) => ({ a, m })))
  const count = new Map<string, number>()
  for (const { m } of rows) count.set(m.name.trim(), (count.get(m.name.trim()) ?? 0) + 1)
  const seen = new Set<string>()
  const out: MilestoneDef[] = []
  for (const { a, m } of rows) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const name = m.name.trim() || m.id
    out.push({ id: m.id, label: (count.get(m.name.trim()) ?? 0) > 1 ? `${name} (${a.id})` : name, mandatory: !!m.dateRequired })
  }
  return out
}
