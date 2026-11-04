import type { ActivityDefinition, TemplateRow } from '../../domain'
import type { PersonaId } from '../../store/personaStore'
import type { FilteredInstance } from '../../engine'
import type { RygStatus } from '../../components/RygDot'
import { toRygStatus } from '../scope'

/** Which side of the work a role is looking at. */
export type WorkMode = 'enter' | 'validate'

/** Roles that get a My Work page. */
export function hasMyWork(persona: PersonaId): boolean {
  return persona === 'Vendor' || persona === 'PIC' || persona === 'SIC' || persona === 'DPM'
}

/** Roles that have fields to enter themselves (an entry queue, the entry grid and the AI import panel). */
export function canEnterWork(persona: PersonaId): boolean {
  return persona === 'Vendor' || persona === 'PIC'
}

/** Roles that validate Vendor submissions (the PIC, and the SIC and DPM who oversee or cover for the PIC). */
export function canValidate(persona: PersonaId): boolean {
  return persona === 'PIC' || persona === 'SIC' || persona === 'DPM'
}

/**
 * The approval-step role a persona validates for. The SIC and DPM act on the PIC's step, as the part form already
 * lets them (Approve, Edit and Send back appear for all three). Every other role validates its own step.
 */
export function validatingRole(persona: PersonaId): PersonaId {
  return persona === 'SIC' || persona === 'DPM' ? 'PIC' : persona
}

/**
 * True when the role is the one who enters data first for this activity: the first approval step belongs
 * to the role and at least one field is entered by the role (calculated fields never count).
 */
export function roleEntersFirst(activity: ActivityDefinition, role: PersonaId): boolean {
  if (activity.flow.steps[0]?.role !== role) return false
  return activity.fields.some((f) => f.enteredBy === role && f.source !== 'calculated')
}

/** True when this instance is open for the role to enter data (not started, draft or sent back; not Not applicable). */
export function isOpenToEnter(inst: FilteredInstance, role: PersonaId): boolean {
  if (inst.notApplicable) return false
  if (!(inst.status === 'NotStarted' || inst.status === 'Draft' || inst.status === 'Sent back')) return false
  return roleEntersFirst(inst.activity, role)
}

/** True when this instance is Submitted and the current approval step is one the role validates (see validatingRole). */
export function isWaitingForRole(inst: FilteredInstance, role: PersonaId): boolean {
  if (inst.notApplicable || inst.status !== 'Submitted' || !inst.entry) return false
  return inst.activity.flow.steps[inst.entry.currentStepIndex]?.role === validatingRole(role)
}

/** One line in a group: a template row (one section) with the instances that matter. */
export interface WorkRow {
  row: TemplateRow
  instances: FilteredInstance[]
}

/** An activity under a milestone, combined across sections. */
export interface WorkGroup {
  key: string
  activity: ActivityDefinition
  milestoneId: string
  rows: WorkRow[]
  instances: FilteredInstance[]
  sentBack: number
  draft: number
  notStarted: number
  submitted: number
  /** Worst RYG among the instances (red > yellow > green > grey). */
  ryg: RygStatus
  /** Earliest start and latest end across instances whose MRD is known. */
  start?: string
  end?: string
  awaitingMrd: number
}

const RYG_RANK: Record<RygStatus, number> = { red: 0, yellow: 1, green: 2, grey: 3, na: 4 }

function worstRyg(instances: FilteredInstance[]): RygStatus {
  let worst: RygStatus = 'grey'
  for (const i of instances) {
    const r = toRygStatus(i.ryg)
    if (RYG_RANK[r] < RYG_RANK[worst]) worst = r
  }
  return worst
}

/**
 * Groups the instances that need the role into activity-under-milestone groups, ordered by urgency:
 * groups with Sent back items first, then worst RYG, then earliest end date. Instances must already be
 * limited to the persona's scope.
 */
export function buildWorkGroups(instances: FilteredInstance[], role: PersonaId, mode: WorkMode): WorkGroup[] {
  const pick = mode === 'enter' ? (i: FilteredInstance) => isOpenToEnter(i, role) : (i: FilteredInstance) => isWaitingForRole(i, role)
  const map = new Map<string, WorkGroup>()

  for (const inst of instances.filter(pick)) {
    const key = `${inst.activity.id}|${inst.row.milestoneId}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        activity: inst.activity,
        milestoneId: inst.row.milestoneId,
        rows: [],
        instances: [],
        sentBack: 0,
        draft: 0,
        notStarted: 0,
        submitted: 0,
        ryg: 'grey',
        awaitingMrd: 0
      }
      map.set(key, g)
    }
    g.instances.push(inst)
    let wr = g.rows.find((r) => r.row.id === inst.row.id)
    if (!wr) {
      wr = { row: inst.row, instances: [] }
      g.rows.push(wr)
    }
    wr.instances.push(inst)

    if (inst.status === 'Sent back') g.sentBack++
    else if (inst.status === 'Draft') g.draft++
    else if (inst.status === 'NotStarted') g.notStarted++
    else if (inst.status === 'Submitted') g.submitted++

    if (inst.dates.status === 'awaitingMrd') {
      g.awaitingMrd++
    } else {
      if (!g.start || inst.dates.start < g.start) g.start = inst.dates.start
      if (!g.end || inst.dates.end > g.end) g.end = inst.dates.end
    }
  }

  const groups = Array.from(map.values())
  for (const g of groups) {
    g.ryg = worstRyg(g.instances)
    g.rows.sort((a, b) => a.row.section.localeCompare(b.row.section))
  }

  return groups.sort(
    (a, b) =>
      (b.sentBack > 0 ? 1 : 0) - (a.sentBack > 0 ? 1 : 0) ||
      RYG_RANK[a.ryg] - RYG_RANK[b.ryg] ||
      (a.end ?? '9999-12-31').localeCompare(b.end ?? '9999-12-31') ||
      a.activity.name.localeCompare(b.activity.name)
  )
}

/** Counts for the page header. */
export interface WorkCounts {
  sentBack: number
  draft: number
  notStarted: number
  /** Submitted instances waiting for someone else (Vendor view: waiting for the PIC). */
  waitingOthers: number
  /** Submitted instances waiting for this role (PIC view: to validate). */
  toValidate: number
}

export function countWork(instances: FilteredInstance[], role: PersonaId): WorkCounts {
  const open = instances.filter((i) => isOpenToEnter(i, role))
  return {
    sentBack: open.filter((i) => i.status === 'Sent back').length,
    draft: open.filter((i) => i.status === 'Draft').length,
    notStarted: open.filter((i) => i.status === 'NotStarted').length,
    waitingOthers: instances.filter(
      (i) => !i.notApplicable && i.status === 'Submitted' && roleEntersFirst(i.activity, role) && !isWaitingForRole(i, role)
    ).length,
    toValidate: instances.filter((i) => isWaitingForRole(i, role)).length
  }
}
