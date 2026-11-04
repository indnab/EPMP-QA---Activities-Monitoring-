import type { ActivityDefinition, GlobalFilters, MilestoneDef } from '../../domain'
import { NOT_ENTERED, RYG_LABELS, STATUS_LABELS, fieldValueLabel } from '../../engine'

/**
 * What a widget reports when clicked, in whatever names it uses. Old widgets say 'Not Started', 'Sent Back',
 * 'Awaiting MRD', 'Not applicable' or 'New Part'; `normaliseDrill` turns them all into the engine's keys.
 */
export interface RawDrill {
  activityId?: string
  model?: string
  vendor?: string
  type?: string
  milestone?: string
  section?: string
  status?: string
  ryg?: string
  department?: string
  fields?: { key: string; value: string }[]
}

/** Persona scope: a section- or vendor-locked role cannot be filtered out of its own scope. */
export interface DrillScope {
  section?: string
  vendor?: string
}

function normaliseStatus(v: string): string {
  const k = v.toLowerCase().replace(/[\s_-]/g, '')
  if (k === 'notstarted') return 'NotStarted'
  if (k === 'sentback') return 'Sent back'
  if (k === 'notapplicable' || k === 'na') return 'NA'
  if (k === 'draft') return 'Draft'
  if (k === 'submitted') return 'Submitted'
  if (k === 'approved') return 'Approved'
  return v
}

function normaliseRyg(v: string): string {
  const k = v.toLowerCase().replace(/[\s_-]/g, '')
  if (k === 'green') return 'Green'
  if (k === 'yellow') return 'Yellow'
  if (k === 'red') return 'Red'
  if (k === 'grey' || k === 'gray' || k === 'awaitingmrd') return 'Grey'
  if (k === 'na' || k === 'notapplicable') return 'NA'
  return v
}

/** Canonical filters for a click: engine status / RYG keys, 'NewPart' | 'ECN', empty values dropped. */
export function normaliseDrill(raw: RawDrill): Partial<GlobalFilters> {
  const out: Partial<GlobalFilters> = {}
  if (raw.activityId) out.activityId = raw.activityId
  if (raw.model) out.model = raw.model
  if (raw.vendor) out.vendor = raw.vendor
  if (raw.milestone) out.milestone = raw.milestone
  if (raw.section) out.section = raw.section
  if (raw.department) out.department = raw.department
  if (raw.status) out.status = normaliseStatus(raw.status)
  if (raw.ryg) out.ryg = normaliseRyg(raw.ryg)
  if (raw.type) {
    const t = raw.type.replace(/\s/g, '')
    if (t === 'NewPart' || t === 'ECN') out.type = t
  }
  if (raw.fields?.length) out.fields = raw.fields
  return out
}

/**
 * The dashboard filters after a click: the click's filters replace the same filter and add to the others, so
 * successive clicks narrow. Section and vendor are ignored for a role locked to one, as the filter row is.
 */
export function applyDrill(filters: GlobalFilters, raw: RawDrill, scope: DrillScope): GlobalFilters {
  const n = normaliseDrill(raw)
  const next: GlobalFilters = { ...filters }
  if (n.activityId) next.activityId = n.activityId
  if (n.model) next.model = n.model
  if (n.vendor && !scope.vendor) next.vendor = n.vendor
  if (n.milestone) next.milestone = n.milestone
  if (n.section && !scope.section) next.section = n.section
  if (n.department) next.department = n.department
  if (n.status) next.status = n.status
  if (n.ryg) next.ryg = n.ryg
  if (n.type) next.type = n.type
  if (n.fields) {
    const clicked = new Set(n.fields.map((f) => f.key))
    next.fields = [...(filters.fields ?? []).filter((f) => !clicked.has(f.key)), ...n.fields]
  }
  return next
}

/** One removable filter shown above the widgets. */
export interface DrillChip {
  id: string
  label: string
  /** The filters with this one removed. */
  clear: (f: GlobalFilters) => GlobalFilters
}

interface ChipContext {
  scope: DrillScope
  milestones: MilestoneDef[]
  activities: ActivityDefinition[]
  /** The dashboard's activity; undefined on the Overview. Field filters are labelled from it. */
  activity?: ActivityDefinition
}

const isSet = (v: string | undefined): v is string => !!v && v !== 'All'

/**
 * The active filters as chips: the dropdown filters and everything a click can set. A filter locked by the
 * persona's scope (section, vendor) gets no chip because it cannot be removed. Dates have their own inputs.
 */
export function drillChips(filters: GlobalFilters, ctx: ChipContext): DrillChip[] {
  const chips: DrillChip[] = []
  const add = (id: string, label: string, clear: (f: GlobalFilters) => GlobalFilters) => chips.push({ id, label, clear })

  if (isSet(filters.activityId)) {
    add('activityId', `Activity: ${ctx.activities.find((a) => a.id === filters.activityId)?.name ?? filters.activityId}`, (f) => ({ ...f, activityId: 'All' }))
  }
  if (isSet(filters.milestone)) {
    add('milestone', `Milestone: ${ctx.milestones.find((m) => m.id === filters.milestone)?.label ?? filters.milestone}`, (f) => ({ ...f, milestone: 'All' }))
  }
  if (isSet(filters.section) && !ctx.scope.section) add('section', `Section: ${filters.section}`, (f) => ({ ...f, section: 'All' }))
  if (isSet(filters.model)) add('model', `Model: ${filters.model}`, (f) => ({ ...f, model: 'All' }))
  if (isSet(filters.vendor) && !ctx.scope.vendor) add('vendor', `Vendor: ${filters.vendor}`, (f) => ({ ...f, vendor: 'All' }))
  if (isSet(filters.department)) add('department', `Department: ${filters.department}`, (f) => ({ ...f, department: 'All' }))
  if (filters.type !== 'All') add('type', `Type: ${filters.type === 'NewPart' ? 'New Part' : 'ECN'}`, (f) => ({ ...f, type: 'All' }))
  if (isSet(filters.status)) add('status', `Status: ${STATUS_LABELS[filters.status] ?? filters.status}`, (f) => ({ ...f, status: 'All' }))
  if (isSet(filters.ryg)) add('ryg', `RYG: ${RYG_LABELS[filters.ryg] ?? filters.ryg}`, (f) => ({ ...f, ryg: 'All' }))
  for (const { key, value } of filters.fields ?? []) {
    const field = ctx.activity?.fields.find((f) => f.key === key)
    const valueLabel = field ? fieldValueLabel(field, value) : value === NOT_ENTERED ? 'Not entered' : value
    add(`field:${key}`, `${field?.label ?? key}: ${valueLabel}`, (f) => ({ ...f, fields: (f.fields ?? []).filter((x) => x.key !== key) }))
  }
  return chips
}

/** No filter set. */
export const EMPTY_FILTERS: GlobalFilters = {
  milestone: 'All',
  section: 'All',
  model: 'All',
  vendor: 'All',
  type: 'All',
  startDate: '',
  endDate: ''
}

/**
 * The filters to keep when the Admin switches dashboard: the click-only filters (status, RYG, department, activity,
 * field values) belong to the dashboard they were set on, so they are cleared; the dropdown filters carry over,
 * except the milestone, which has always reset on a switch.
 */
export function filtersForNewDashboard(filters: GlobalFilters): GlobalFilters {
  return { ...filters, milestone: 'All', status: 'All', ryg: 'All', department: 'All', activityId: 'All', fields: [] }
}
