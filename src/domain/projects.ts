/**
 * Projects (Project Initiation). A Division Model Coordinator initiates a project from an archetype; a Vehicle project
 * claims one or more models (with their MRDs), and the parts tagged to those models are its parts. A project is In
 * Execution from initiation until it is closed. Work screens only include parts of In Execution projects (gateParts).
 * Pure helpers — no React, no store.
 */
import type { PersonaId } from '../store/personaStore'
import type { MilestoneDef, ModelRecord, PartRecord, ProjectArchetype } from './index'
import { validateMrds } from './mrds'

export type ProjectMaster = 'Vehicle' | 'NonVehicle'
export type ProjectStatus = 'InExecution' | 'Closed'

export interface Project {
  /** Auto number, 'PRJ-0001'. Unique, never reused. */
  no: string
  /** Free text. Not required to be unique; `no` is the identity. */
  name: string
  archetypeId: string
  master: ProjectMaster
  /** The project's model (ModelRecord.name, canonical casing): exactly one for Vehicle, empty for NonVehicle. */
  modelNames: string[]
  status: ProjectStatus
  initiatedBy: PersonaId
  initiatedAt: string
  closedBy?: PersonaId
  closedAt?: string
}

/** One model block of the Initiate form. */
export interface ModelDraft {
  /** Existing model name (isNew=false) or the new model's name (isNew=true). */
  name: string
  isNew: boolean
  mrds: Record<string, string>
}

export interface InitiateProjectInput {
  name: string
  archetypeId: string
  master: ProjectMaster | ''
  models?: ModelDraft[]
}

/** Field-keyed messages: 'name' | 'archetypeId' | 'master' | 'models' | `model.${i}.name` | `model.${i}.mrd.${key}` | '_form'. */
export type ProjectErrors = Record<string, string>

export type InitiateResult = { ok: true; project: Project } | { ok: false; errors: ProjectErrors }
export type CloseResult = { ok: true; project: Project } | { ok: false; reason: 'NOT_ALLOWED' | 'NOT_FOUND' | 'ALREADY_CLOSED' }

export interface InitiationContext {
  archetypes: ProjectArchetype[]
  models: ModelRecord[]
  milestones: MilestoneDef[]
  projects: Project[]
  by: PersonaId
}

export interface ProjectPreview {
  modelNames: string[]
  partsCount: number
  activityCount: number
  wbsObjectCount: number
}

export const PROJECT_MASTERS: { id: ProjectMaster; label: string }[] = [
  { id: 'Vehicle', label: 'Vehicle' },
  { id: 'NonVehicle', label: 'Non-Vehicle' },
]
export const PROJECT_MASTER_LABEL: Record<ProjectMaster, string> = { Vehicle: 'Vehicle', NonVehicle: 'Non-Vehicle' }
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { InExecution: 'In Execution', Closed: 'Closed' }
export const PROJECT_NO_PREFIX = 'PRJ-'
/** Only the Division Model Coordinator initiates and closes projects. */
export const PROJECT_INITIATOR: PersonaId = 'ModelCoordinator'

const lower = (s: string) => s.trim().toLowerCase()

/** Next number: highest existing + 1 (closed projects count, so numbers are never reused). */
export function nextProjectNo(projects: Project[]): string {
  const n = projects.reduce((m, p) => Math.max(m, parseInt(p.no.replace(/\D/g, ''), 10) || 0), 0)
  return `${PROJECT_NO_PREFIX}${String(n + 1).padStart(4, '0')}`
}

export const activeProjects = (projects: Project[]) => projects.filter((p) => p.status === 'InExecution')

/** Model names held by In Execution projects. */
export function activeModelNames(projects: Project[]): Set<string> {
  return new Set(activeProjects(projects).flatMap((p) => p.modelNames))
}

/** The In Execution project holding a model (case-insensitive), if any. */
export function projectOfModel(modelName: string, projects: Project[]): Project | undefined {
  const key = lower(modelName)
  return activeProjects(projects).find((p) => p.modelNames.some((n) => lower(n) === key))
}

/**
 * THE gate: parts that may be worked on — those whose model belongs to an In Execution project. Order is kept.
 * Non-Vehicle projects hold no models, so they add no parts.
 */
export function gateParts(parts: PartRecord[], projects: Project[]): PartRecord[] {
  const active = activeModelNames(projects)
  if (active.size === 0) return []
  return parts.filter((p) => active.has(p.model))
}

/** A project's parts (by its models), excluding superseded parts. */
export function projectParts(project: Project, parts: PartRecord[]): PartRecord[] {
  const names = new Set(project.modelNames)
  return parts.filter((p) => !p.supersededBy && names.has(p.model))
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
function containsContiguous(hay: string[], needle: string[]): boolean {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, j) => hay[i + j] === t)) return true
  }
  return false
}

/**
 * Pick the model a project name refers to: whole-word, in order, longest match wins ("Grand Vitara Facelift" →
 * "Grand Vitara"; "Swiftly" → none). A tie between different models picks nothing.
 */
export function matchModelFromName(projectName: string, models: ModelRecord[]): string | null {
  const nameTokens = tokens(projectName)
  let best: string | null = null
  let bestLen = 0
  let tie = false
  for (const m of models) {
    const mt = tokens(m.name)
    if (mt.length === 0 || !containsContiguous(nameTokens, mt)) continue
    if (mt.length > bestLen) { best = m.name; bestLen = mt.length; tie = false }
    else if (mt.length === bestLen && m.name !== best) tie = true
  }
  return tie ? null : best
}

/** All validation for initiation (the form runs it live; the store runs it again before saving). */
export function validateInitiation(input: InitiateProjectInput, ctx: InitiationContext): ProjectErrors {
  if (ctx.by !== PROJECT_INITIATOR) return { _form: 'Only the Division Model Coordinator can initiate a project.' }
  const errors: ProjectErrors = {}
  const name = input.name.trim()
  if (!name) errors.name = 'Project name is required.'
  else if (name.length > 80) errors.name = 'Project name must be 80 characters or fewer.'

  const arc = ctx.archetypes.find((a) => a.id === input.archetypeId)
  if (!arc) errors.archetypeId = 'Select a project archetype.'
  else if (!arc.active) errors.archetypeId = 'This archetype is inactive.'

  if (input.master !== 'Vehicle' && input.master !== 'NonVehicle') errors.master = 'Select a project master.'

  const drafts = input.models ?? []
  if (input.master === 'NonVehicle' && drafts.length > 0) errors.models = 'A non-vehicle project has no models.'
  if (input.master === 'Vehicle') {
    if (drafts.length === 0) errors.models = 'Select the model for this project.'
    else if (drafts.length > 1) errors.models = 'A project has exactly one model.'
    const seen = new Set<string>()
    drafts.forEach((d, i) => {
      const nm = d.name.trim()
      const key = lower(nm)
      const at = `model.${i}.name`
      if (!nm) { errors[at] = 'Model name is required.'; return }
      if (seen.has(key)) { errors[at] = 'This model is listed twice.'; return }
      seen.add(key)
      const existing = ctx.models.find((m) => lower(m.name) === key)
      if (d.isNew && existing) errors[at] = 'A model with this name already exists. Pick it from the list.'
      else if (!d.isNew && !existing) errors[at] = 'Unknown model.'
      for (const [k, msg] of Object.entries(validateMrds(ctx.milestones, d.mrds))) errors[`model.${i}.mrd.${k}`] = msg
      const other = projectOfModel(nm, ctx.projects)
      if (other) errors[at] = `${existing?.name ?? nm} is already in ${other.no} (${other.name}).`
    })
  }
  return errors
}

/** Live preview of what the project will pull in. */
export function previewProject(draft: InitiateProjectInput, parts: PartRecord[], archetype: ProjectArchetype | undefined): ProjectPreview {
  const names = draft.master === 'Vehicle' ? (draft.models ?? []).map((m) => m.name.trim()).filter(Boolean) : []
  const keys = new Set(names.map(lower))
  return {
    modelNames: names,
    partsCount: parts.filter((p) => !p.supersededBy && keys.has(lower(p.model))).length,
    activityCount: archetype ? archetype.wbs.filter((o) => o.type === 'QA').length : 0,
    wbsObjectCount: archetype ? archetype.wbs.length : 0,
  }
}

/** Keep invariant "every In Execution project's models exist": drop model names that are gone. */
export function pruneProjects(projects: Project[], models: ModelRecord[]): Project[] {
  const exists = new Set(models.map((m) => m.name))
  return projects.map((p) =>
    p.status === 'InExecution' && p.modelNames.some((n) => !exists.has(n))
      ? { ...p, modelNames: p.modelNames.filter((n) => exists.has(n)) }
      : p
  )
}
