import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ActivityDefinition,
  ActivityEntry,
  DashboardConfig,
  BuilderDraft,
  Widget,
  ModelRecord,
  Section,
  MilestoneDef,
  TemplateRow,
  PicAssignment,
  PartRecord,
  PartEvent,
  PartRelease,
  PartAck,
  DelayReason,
  VendorTimeline,
  VendorInfo,
  VendorVisit,
  Action,
  ActionStatus,
  Deviation,
  CrossActivityDashboard,
  ActivityDependency,
  ActivityDocument,
  AuditEntry,
  HistoryTransferRequest,
  ProjectArchetype,
} from '../domain'
import type { PersonaId } from './personaStore'
import { makeEntryId, makeTemplateRowId, DELAY_REASON_OTHERS } from '../domain'
import { syncArchetype } from '../domain/governance'
import { putBlob, deleteBlob, clearBlobs } from './docBlobs'
import { DEMO_TODAY, canMarkNotApplicable, canReverseNotApplicable } from '../features/scope'
import {
  SEED_ACTIVITIES,
  SEED_ENTRIES,
  SEED_MODELS,
  SEED_SECTIONS,
  SEED_MILESTONES,
  SEED_TEMPLATE_ROWS,
  SEED_PIC_ASSIGNMENTS,
  SEED_PART_EVENTS,
  SEED_PART_RELEASES,
  SEED_PART_ACKS,
  SEED_DELAY_REASONS,
  SEED_VENDOR_INFO,
  SEED_VENDOR_VISITS,
  MOCK_PART_LIST,
  SEED_ARCHETYPES,
  SEED_PROJECTS,
} from '../mock'
import type { Project, InitiateProjectInput, InitiateResult, CloseResult } from '../domain/projects'
import { PROJECT_INITIATOR, nextProjectNo, projectOfModel, pruneProjects, validateInitiation } from '../domain/projects'
import { cleanMrds } from '../domain/mrds'
import { deriveTechnicalCategory } from '../domain/timelineCatalog'
import { buildDemoData } from '../mock/demoParts'
import {
  evaluateCalculatedFields,
  getMilestoneMrd,
  getPicOn,
  getReleaseState,
  transitionEntry,
  generateDashboardConfig,
  generateOverviewDashboardConfig
} from '../engine'

interface QAStoreState {
  activities: ActivityDefinition[]
  entries: ActivityEntry[]
  dashboards: DashboardConfig[]

  /**
   * The live part master. Seeded from MOCK_PART_LIST (simulated SAP/ENOVIA ingest) and then
   * extended at runtime with manual/dummy parts and ECN transfers. Read this, not MOCK_PART_LIST.
   */
  parts: PartRecord[]
  /** Append-only audit of part-identity events (manual creation, ECN transfer). */
  partEvents: PartEvent[]
  /** Documents attached to a part's activity entry (file content lives in IndexedDB). */
  documents: ActivityDocument[]
  /** Append-only audit log of uploads, deletions, downloads and bulk Excel loads. */
  auditLog: AuditEntry[]

  /** Vendor master: location per vendor (for manpower planning's location-based coverage). */
  vendorInfo: VendorInfo[]
  /** Planned/logged PIC vendor visits. */
  vendorVisits: VendorVisit[]
  /** Schedule a PIC visit to a vendor. */
  addVendorVisit: (visit: Omit<VendorVisit, 'id' | 'createdAt'>) => void
  /** Change a visit's status (Planned → Done / Cancelled) or edit its fields. */
  updateVendorVisit: (id: string, patch: Partial<Omit<VendorVisit, 'id' | 'createdAt' | 'createdBy'>>) => void
  deleteVendorVisit: (id: string) => void

  /** User-built cross-activity comparison dashboards (scoped to one model or one part). */
  crossDashboards: CrossActivityDashboard[]
  /** Create a cross-activity dashboard; returns nothing (the page selects it by id). */
  addCrossDashboard: (dash: Omit<CrossActivityDashboard, 'id' | 'createdAt'>) => void
  updateCrossDashboard: (id: string, patch: Partial<Omit<CrossActivityDashboard, 'id' | 'createdAt' | 'createdBy'>>) => void
  deleteCrossDashboard: (id: string) => void
  /** Governance: project archetypes (WBS templates). QA objects become Activity Builder activities. */
  archetypes: ProjectArchetype[]
  /** Create or update an archetype and sync its QA objects into activities (create / rename / checklist / retire). */
  saveArchetype: (archetype: ProjectArchetype) => void
  setArchetypeActive: (id: string, active: boolean) => void
  /** Activity-to-activity dependencies, per technical category (Activity Dependencies module). */
  activityDependencies: ActivityDependency[]
  addActivityDependency: (dep: Omit<ActivityDependency, 'id'>) => void
  updateActivityDependency: (id: string, patch: Partial<Omit<ActivityDependency, 'id'>>) => void
  deleteActivityDependency: (id: string) => void
  /**
   * Append-only log of PIC release decisions. A part with no record is unreleased; the latest record wins.
   * While unreleased the vendor does not see the part in their queue.
   */
  partReleases: PartRelease[]

  /**
   * PIC releases a part to the vendor (or recalls it with released=false) after reviewing its details.
   * Records a PartRelease and appends a line to every activity entry of the part for the audit trail.
   */
  releasePart: (args: {
    partNo: string
    released: boolean
    by: PersonaId
    actorName?: string
    comment?: string
  }) => void

  /**
   * Append-only log of the vendor's responses to released parts (acknowledge / return). A response counts only if
   * it is newer than the part's latest release record. See getReleaseState in the engine.
   */
  partAcks: PartAck[]
  /** Vendor acknowledges one or several released parts together. Only parts awaiting acknowledgement are changed. */
  acknowledgeParts: (args: { partNos: string[]; by: PersonaId; actorName?: string }) => void
  /** Vendor returns one or several released parts to the PIC with a reason (required). */
  returnParts: (args: { partNos: string[]; by: PersonaId; actorName?: string; reason: string }) => void
  /**
   * Reasons for delay. When an activity is late and the vendor holds it, the vendor gives a reason (one or several
   * activities together); the PIC accepts it or sends it back with a comment, and a sent-back reason must be redone.
   * Append-only: the latest record for an entry decides where it stands. See delayStateOf.
   */
  delayReasons: DelayReason[]
  submitDelayReasons: (args: {
    items: { rowId: string; partNo: string; activityId: string; plannedEnd: string }[]
    category: string
    remark?: string
    revisedDate?: string
    by: PersonaId
    actorName?: string
  }) => void
  /** PIC (or SIC / DPM covering) accepts or sends back submitted reasons. A send-back needs a comment. */
  decideDelayReasons: (args: { ids: string[]; decision: 'Accepted' | 'SentBack'; comment?: string; by: PersonaId; actorName?: string }) => void
  /**
   * Add a dummy/placeholder part number because SAP has none yet. `origin` is forced to 'Manual'.
   * No-op if the part number already exists. Records a 'Created' PartEvent.
   */
  addManualPart: (
    part: Omit<PartRecord, 'origin' | 'supersededBy' | 'supersedes' | 'createdBy' | 'createdAt'>,
    by: PersonaId,
    actorName?: string
  ) => void

  /**
   * Transfer a (possibly in-progress) part's history to a new ECN-revised part number. Clones every
   * activity entry of `fromPartNo` onto `toPartNo` (new entry ids), appends a transfer line to each
   * entry's history, marks the old part superseded (dropped from tracking) and the new part as its
   * successor. Creates the new part from the old one's attributes if it doesn't exist yet.
   * Records a 'Transferred' PartEvent. No-op if the old part is unknown or already superseded.
   */
  transferPart: (args: {
    fromPartNo: string
    toPartNo: string
    newPartName?: string
    by: PersonaId
    actorName?: string
    reason?: string
  }) => void

  /**
   * History Transfer: copy one source part's activity history into one OR MORE target parts at once. Each target gets
   * clones of the source's entries (new ids, a 'Transferred from …' history line); existing work on a target is kept.
   * `keepSourceActive` decides whether the source stays active or is marked inactive (superseded) after the transfer.
   * When made inactive with a single target, the source points to that target as its successor. Records one
   * 'Transferred' PartEvent per target. Targets must exist and differ from the source.
   */
  transferHistory: (args: {
    fromPartNo: string
    toPartNos: string[]
    keepSourceActive: boolean
    /** Template row ids of the source's activities to transfer. Omit/undefined = all of them. */
    templateRowIds?: string[]
    by: PersonaId
    actorName?: string
    reason?: string
  }) => void

  /** History Transfer requests awaiting the SIC's decision. */
  historyTransferRequests: HistoryTransferRequest[]
  /**
   * Raise a History Transfer request. If `by` is SIC it is applied immediately (no approval) and recorded Approved;
   * otherwise it is left Pending for the SIC. Returns nothing; read historyTransferRequests to see the result.
   */
  requestHistoryTransfer: (args: {
    fromPartNo: string
    toPartNos: string[]
    keepSourceActive: boolean
    templateRowIds: string[]
    by: PersonaId
    actorName?: string
    reason?: string
  }) => void
  /** SIC approves (runs the transfer) or rejects a pending request. Only SIC may decide. */
  decideHistoryTransfer: (requestId: string, decision: 'Approve' | 'Reject', by: PersonaId, byName: string, comment?: string) => void

  // Model Coordinator / Admin / Section Admin reference data
  models: ModelRecord[]
  sections: Section[]
  milestones: MilestoneDef[]
  templateRows: TemplateRow[]
  /** PIC overrides on top of the SAP PIC (SIC/Admin). Append-only; see getPicOn. */
  picAssignments: PicAssignment[]

  /** Assign a PIC to a part from `effectiveFrom`. Replaces the PIC in force from that date forward. */
  assignPic: (assignment: Omit<PicAssignment, 'id' | 'assignedAt'>) => void

  // Models (keyed by unique name); `mrds` omits blank milestones
  addModel: (model: ModelRecord) => void
  updateModel: (name: string, model: Partial<ModelRecord>) => void
  /** Refuses while an In Execution project holds the model (close the project first). */
  deleteModel: (name: string) => { ok: true } | { ok: false; reason: string }

  /** Projects (Project Initiation). Work screens only include parts of In Execution projects. */
  projects: Project[]
  /**
   * Model Coordinator only. Validates, upserts the project's models (MRDs) and appends the project In Execution —
   * all in one update. Nothing is saved when validation fails.
   */
  initiateProject: (input: InitiateProjectInput, by: PersonaId) => InitiateResult
  /** In Execution → Closed (Model Coordinator only). Frees its models; its parts leave the work screens. */
  closeProject: (no: string, by: PersonaId) => CloseResult

  // Sections (Admin-maintained list)
  addSection: (section: Section) => void
  updateSection: (id: string, section: Partial<Omit<Section, 'id'>>) => void
  /** Also removes the section's template rows and their entries. */
  deleteSection: (id: string) => void

  // Milestones (Admin-maintained list). Mandatory milestones cannot be removed.
  addMilestone: (milestone: MilestoneDef) => void
  updateMilestone: (id: string, milestone: Partial<Omit<MilestoneDef, 'id' | 'mandatory'>>) => void
  /** No-op for mandatory milestones. Also removes dependent template rows, entries and model MRD values. */
  deleteMilestone: (id: string) => void

  // Section templates
  addTemplateRow: (row: TemplateRow) => void
  updateTemplateRow: (id: string, row: Partial<Omit<TemplateRow, 'id'>>) => void
  /** Also removes the row's entries. */
  deleteTemplateRow: (id: string) => void

  /** Drafts being edited in the builder — never shown in Workspace/Dashboards until published */
  drafts: BuilderDraft[]

  // Named Views Persistence
  savedViews: { id: string; name: string; activityId: string; widgets: Widget[] }[]
  saveView: (name: string, activityId: string, widgets: Widget[]) => void
  deleteView: (id: string) => void

  // Activity Actions
  addActivity: (activity: ActivityDefinition) => void
  updateActivity: (id: string, activity: Partial<ActivityDefinition>) => void
  /** Retires the activity (sets `retired`). Template rows, entries and the dashboard are kept; there is no restore. */
  deleteActivity: (id: string) => void

  // Draft/Builder Actions
  saveDraft: (draft: BuilderDraft) => void
  deleteDraft: (draftId: string) => void
  publishDraft: (draftId: string) => void

  // Entry Actions
  addEntry: (entry: ActivityEntry) => void
  updateEntry: (id: string, entry: Partial<ActivityEntry>) => void
  updateEntryValues: (
    templateRowId: string,
    partNo: string,
    values: Record<string, any>,
    currentPersona?: string
  ) => void
  /**
   * Mark (notApplicable=true) or reverse (false) applicability for several parts of one template row.
   * Enforced here, not only in the UI: marking needs persona PIC and an activity with allowNotApplicable;
   * reversing needs PIC, SIC or Admin. Creates the entry if missing. Each change appends a named history line.
   */
  setNotApplicable: (
    templateRowId: string,
    partNos: string[],
    notApplicable: boolean,
    persona: PersonaId,
    reason?: string
  ) => void
  /**
   * Set or update the vendor planned timeline for one entry. Allowed only when the activity has
   * allowVendorPlannedTimeline and the persona is Vendor, PIC, SIC or Admin. The previous value (if any)
   * is pushed into vendorTimeline.history (for the strikethrough view) and a named history line is appended.
   * Creates the entry if missing.
   */
  setVendorTimeline: (
    templateRowId: string,
    partNo: string,
    start: string,
    end: string,
    persona: PersonaId,
    actorName?: string,
    comment?: string
  ) => void

  /**
   * Raise an action / recommendation on an entry and assign it (usually to the Vendor). PIC/SIC/Admin only.
   * Creates the entry if missing and appends a named line to the entry history.
   */
  addAction: (
    templateRowId: string,
    partNo: string,
    draft: { title: string; description?: string; assignedTo: PersonaId; assignedToName?: string; targetDate?: string },
    persona: PersonaId,
    actorName?: string
  ) => void
  /**
   * Update an action: status (assignee may advance their own; PIC/SIC/Admin may edit anything), target date
   * (superseded dates kept in targetHistory for the strikethrough view), title/description/assignee.
   * Each change appends to the action's own history.
   */
  updateAction: (
    templateRowId: string,
    partNo: string,
    actionId: string,
    patch: Partial<{ title: string; description: string; assignedTo: PersonaId; assignedToName: string; targetDate: string; status: ActionStatus }>,
    persona: PersonaId,
    actorName?: string,
    comment?: string
  ) => void
  /** Remove an action. PIC/SIC/Admin only. */
  deleteAction: (templateRowId: string, partNo: string, actionId: string, persona: PersonaId) => void

  /**
   * Raise a deviation on an entry. It is snapshotted with the activity's deviation flow (default PIC→SIC→DPM)
   * and starts at step 0. Only PIC/SIC/Admin may raise. Creates the entry if missing.
   */
  addDeviation: (
    templateRowId: string,
    partNo: string,
    draft: { title: string; description?: string; edocNumber?: string; targetDate?: string },
    persona: PersonaId,
    actorName?: string
  ) => void
  /**
   * Advance a deviation through its flow. Only the current-step role (or Admin) may act. 'Approve' moves to the
   * next role, or marks Approved at the end; 'Reject' ends it Rejected; 'Send back' returns it to step 0.
   */
  advanceDeviation: (
    templateRowId: string,
    partNo: string,
    deviationId: string,
    action: 'Approve' | 'Reject' | 'Send back',
    persona: PersonaId,
    actorName?: string,
    comment?: string
  ) => void
  transitionEntryState: (
    entryId: string,
    action: 'Submit' | 'Approve' | 'Send back' | 'Edit',
    comment?: string,
    currentPersona?: string
  ) => void
  /**
   * PIC marks a Submitted entry NG (no-go): records a resubmission round (reason + optional target date) and sends the
   * entry back to the vendor. Only for activities with trackNgRounds; only the PIC/SIC/DPM may call it.
   */
  markEntryNg: (entryId: string, reason: string, targetDate: string | undefined, currentPersona: string) => void

  // Dashboard Actions
  updateDashboard: (activityId: string, config: DashboardConfig) => void
  resetDashboard: (activityId: string) => void

  // Demo Reset Action
  resetDemoData: () => void
  /** Adds a log line (id and time are set here). */
  logAudit: (entry: Omit<AuditEntry, 'id' | 'at'>) => void
  /** Attaches a file to a part's activity entry and logs it. */
  addDocument: (doc: Omit<ActivityDocument, 'id' | 'uploadedAt'>, file: File) => Promise<void>
  /** Only the SIC may delete a document; the deletion is logged. Returns false when not allowed. */
  deleteDocument: (docId: string, by: PersonaId, byName: string) => boolean
  /** Put one activity back to its shipped definition (fields, rules, dashboard) and drop its builder draft. */
  restoreActivityDefault: (activityId: string) => void
  /** TEMPORARY: replace all parts + entries with sample data built from the current activity fields. */
  loadSampleParts: () => void
  /** TEMPORARY: remove all parts and their activity data (leaves the activity list). */
  unloadParts: () => void
}

export const useQAStore = create<QAStoreState>()(
  persist(
    (set, get) => ({
      activities: SEED_ACTIVITIES,
      entries: SEED_ENTRIES,
      dashboards: [generateOverviewDashboardConfig(), ...SEED_ACTIVITIES.map((act) => generateDashboardConfig(act))],
      models: SEED_MODELS,
      sections: SEED_SECTIONS,
      milestones: SEED_MILESTONES,
      templateRows: SEED_TEMPLATE_ROWS,
      picAssignments: SEED_PIC_ASSIGNMENTS,
      parts: MOCK_PART_LIST.map((p) => ({ ...p, origin: 'SAP' as const, technicalCategory: deriveTechnicalCategory(p) })),
      documents: [],
      auditLog: [],
      historyTransferRequests: [],
      partEvents: SEED_PART_EVENTS,
      partReleases: SEED_PART_RELEASES,
      partAcks: SEED_PART_ACKS,
      delayReasons: SEED_DELAY_REASONS,
      crossDashboards: [],
      activityDependencies: [],
      archetypes: SEED_ARCHETYPES,
      projects: SEED_PROJECTS,
      vendorInfo: SEED_VENDOR_INFO,
      vendorVisits: SEED_VENDOR_VISITS,
      drafts: [],
      savedViews: [],

      saveArchetype: (archetype) =>
        set((state) => {
          const previous = state.archetypes.find((a) => a.id === archetype.id)
          const r = syncArchetype(archetype, previous, state.activities, state.drafts)
          return {
            archetypes: previous
              ? state.archetypes.map((a) => (a.id === archetype.id ? r.archetype : a))
              : [...state.archetypes, r.archetype],
            activities: r.activities,
            drafts: r.drafts,
          }
        }),
      setArchetypeActive: (id, active) =>
        set((state) => ({ archetypes: state.archetypes.map((a) => (a.id === id ? { ...a, active } : a)) })),

      addActivityDependency: (dep) =>
        set((state) => ({
          activityDependencies: [...state.activityDependencies, { ...dep, id: `dep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }]
        })),
      updateActivityDependency: (id, patch) =>
        set((state) => ({
          activityDependencies: state.activityDependencies.map((d) => (d.id === id ? { ...d, ...patch } : d))
        })),
      deleteActivityDependency: (id) =>
        set((state) => ({ activityDependencies: state.activityDependencies.filter((d) => d.id !== id) })),

      addVendorVisit: (visit) =>
        set((state) => ({
          vendorVisits: [
            ...state.vendorVisits,
            { ...visit, id: `visit-${Date.now().toString(36)}`, createdAt: new Date().toISOString() }
          ]
        })),

      updateVendorVisit: (id, patch) =>
        set((state) => ({
          vendorVisits: state.vendorVisits.map((v) => (v.id === id ? { ...v, ...patch } : v))
        })),

      deleteVendorVisit: (id) =>
        set((state) => ({ vendorVisits: state.vendorVisits.filter((v) => v.id !== id) })),

      addCrossDashboard: (dash) =>
        set((state) => ({
          crossDashboards: [
            ...state.crossDashboards,
            { ...dash, id: `cross-${Date.now().toString(36)}`, createdAt: new Date().toISOString() }
          ]
        })),

      updateCrossDashboard: (id, patch) =>
        set((state) => ({
          crossDashboards: state.crossDashboards.map((d) => (d.id === id ? { ...d, ...patch } : d))
        })),

      deleteCrossDashboard: (id) =>
        set((state) => ({ crossDashboards: state.crossDashboards.filter((d) => d.id !== id) })),

      releasePart: ({ partNo, released, by, actorName, comment }) =>
        set((state) => {
          if (!state.parts.some((p) => p.partNo === partNo)) return {}
          const now = new Date().toISOString()
          const actor = actorName || by
          const record: PartRelease = {
            id: `rel-${partNo}-${state.partReleases.filter((r) => r.partNo === partNo).length + 1}`,
            partNo,
            released,
            by: actor,
            byRole: by,
            at: now,
            comment: comment?.trim() || undefined
          }
          // Trail the decision on every entry of the part so it shows in the audit "who did what".
          const entries = state.entries.map((e) =>
            e.partNo === partNo
              ? {
                  ...e,
                  history: [
                    ...e.history,
                    {
                      timestamp: now,
                      persona: by,
                      actorName: by === 'PIC' ? actor : undefined,
                      action: released ? 'Released to vendor' : 'Recalled from vendor',
                      comment: comment?.trim() || undefined
                    }
                  ]
                }
              : e
          )
          return { partReleases: [...state.partReleases, record], entries }
        }),

      acknowledgeParts: ({ partNos, by, actorName }) =>
        set((state) => {
          if (by !== 'Vendor') return {}
          const now = new Date().toISOString()
          const actor = actorName || by
          const todo = partNos.filter((n) => getReleaseState(n, state.partReleases, state.partAcks) === 'Released')
          if (todo.length === 0) return {}
          const records: PartAck[] = todo.map((partNo, i) => ({
            id: `ack-${partNo}-${state.partAcks.filter((a) => a.partNo === partNo).length + 1}`,
            partNo, status: 'Acknowledged', by: actor, byRole: by,
            at: new Date(Date.parse(now) + i).toISOString()
          }))
          const set1 = new Set(todo)
          const entries = state.entries.map((e) =>
            set1.has(e.partNo)
              ? { ...e, history: [...e.history, { timestamp: now, persona: by, action: 'Acknowledged by vendor' }] }
              : e
          )
          return { partAcks: [...state.partAcks, ...records], entries }
        }),
      returnParts: ({ partNos, by, actorName, reason }) =>
        set((state) => {
          const why = reason.trim()
          if (by !== 'Vendor' || !why) return {}
          const now = new Date().toISOString()
          const actor = actorName || by
          const todo = partNos.filter((n) => getReleaseState(n, state.partReleases, state.partAcks) === 'Released')
          if (todo.length === 0) return {}
          const records: PartAck[] = todo.map((partNo, i) => ({
            id: `ack-${partNo}-${state.partAcks.filter((a) => a.partNo === partNo).length + 1}`,
            partNo, status: 'Returned', by: actor, byRole: by, reason: why,
            at: new Date(Date.parse(now) + i).toISOString()
          }))
          const set1 = new Set(todo)
          const entries = state.entries.map((e) =>
            set1.has(e.partNo)
              ? { ...e, history: [...e.history, { timestamp: now, persona: by, action: 'Returned by vendor', comment: why }] }
              : e
          )
          return { partAcks: [...state.partAcks, ...records], entries }
        }),
      submitDelayReasons: ({ items, category, remark, revisedDate, by, actorName }) =>
        set((state) => {
          const text = remark?.trim()
          if (by !== 'Vendor' || !category || (category === DELAY_REASON_OTHERS && !text) || items.length === 0) return {}
          const now = new Date().toISOString()
          const actor = actorName || by
          const todo = items.filter((it) => {
            const id = makeEntryId(it.rowId, it.partNo)
            const latest = state.delayReasons.filter((r) => r.entryId === id).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
            return !latest || latest.status === 'SentBack'
          })
          if (todo.length === 0) return {}
          const records: DelayReason[] = todo.map((it, i) => {
            const entryId = makeEntryId(it.rowId, it.partNo)
            return {
              id: `dr-${entryId}-${state.delayReasons.filter((r) => r.entryId === entryId).length + 1}`,
              entryId, rowId: it.rowId, partNo: it.partNo, activityId: it.activityId,
              category, remark: text || undefined, revisedDate: revisedDate || undefined,
              by: actor, byRole: by, at: new Date(Date.parse(now) + i).toISOString(),
              plannedEnd: it.plannedEnd, status: 'Submitted'
            }
          })
          const ids = new Set(records.map((r) => r.entryId))
          const entries = state.entries.map((e) =>
            ids.has(e.id)
              ? { ...e, history: [...e.history, { timestamp: now, persona: by, action: 'Delay reason submitted', comment: `${category}${text ? ': ' + text : ''}` }] }
              : e
          )
          return { delayReasons: [...state.delayReasons, ...records], entries }
        }),
      decideDelayReasons: ({ ids, decision, comment, by, actorName }) =>
        set((state) => {
          const note = comment?.trim()
          if (!(by === 'PIC' || by === 'SIC' || by === 'DPM')) return {}
          if (decision === 'SentBack' && !note) return {}
          const now = new Date().toISOString()
          const actor = actorName || by
          const pick = new Set(ids)
          const hit: DelayReason[] = []
          const delayReasons = state.delayReasons.map((r) => {
            if (!pick.has(r.id) || r.status !== 'Submitted') return r
            const next = { ...r, status: decision, decidedBy: actor, decidedAt: now, decisionComment: note || undefined }
            hit.push(next)
            return next
          })
          if (hit.length === 0) return {}
          const eids = new Set(hit.map((r) => r.entryId))
          const entries = state.entries.map((e) =>
            eids.has(e.id)
              ? {
                  ...e,
                  history: [...e.history, {
                    timestamp: now, persona: by, actorName: by === 'PIC' ? actor : undefined,
                    action: decision === 'Accepted' ? 'Delay reason accepted' : 'Delay reason sent back',
                    comment: note || undefined
                  }]
                }
              : e
          )
          return { delayReasons, entries }
        }),
      assignPic: (a) =>
        set((state) => {
          const assignedAt = new Date().toISOString()
          const id = `pic-${a.partNo}-${state.picAssignments.filter((x) => x.partNo === a.partNo).length + 1}`
          return { picAssignments: [...state.picAssignments, { ...a, id, assignedAt }] }
        }),

      addManualPart: (part, by, actorName) =>
        set((state) => {
          const partNo = part.partNo.trim()
          if (by !== 'SectionAdmin' && by !== 'Admin' && by !== 'PIC') return {} // dummy parts are raised by the Department Co-ordinator, the PIC or Admin
          if (!partNo || state.parts.some((p) => p.partNo === partNo)) return {}
          const now = new Date().toISOString()
          const newPart: PartRecord = { ...part, partNo, origin: 'Manual', createdBy: by, createdAt: now }
          const event: PartEvent = {
            id: `evt-created-${partNo}-${state.partEvents.length + 1}`,
            kind: 'Created',
            partNo,
            by: actorName || by,
            byRole: by,
            at: now,
            reason: 'SAP has no part number yet — placeholder created'
          }
          return { parts: [...state.parts, newPart], partEvents: [...state.partEvents, event] }
        }),

      transferPart: ({ fromPartNo, toPartNo, newPartName, by, actorName, reason }) =>
        set((state) => {
          const from = state.parts.find((p) => p.partNo === fromPartNo)
          const to = toPartNo.trim()
          if (!from || from.supersededBy || !to || to === fromPartNo) return {}

          const now = new Date().toISOString()
          const actor = actorName || by

          // Ensure the new part exists. If not, derive it from the old part's attributes.
          let parts = state.parts
          const existingNew = parts.find((p) => p.partNo === to)
          if (!existingNew) {
            parts = [
              ...parts,
              {
                ...from,
                partNo: to,
                partName: newPartName?.trim() || from.partName,
                origin: from.origin ?? 'SAP',
                supersededBy: undefined,
                supersedes: fromPartNo,
                createdBy: by,
                createdAt: now
              }
            ]
          } else {
            parts = parts.map((p) => (p.partNo === to ? { ...p, supersedes: fromPartNo } : p))
          }

          // Clone the old part's entries onto the new part number, carrying history.
          const movedEntries: ActivityEntry[] = []
          for (const e of state.entries) {
            if (e.partNo !== fromPartNo) continue
            const newId = makeEntryId(e.templateRowId, to)
            if (state.entries.some((x) => x.id === newId)) continue // don't clobber existing work on the new part
            movedEntries.push({
              ...e,
              id: newId,
              partNo: to,
              history: [
                ...e.history,
                {
                  timestamp: now,
                  persona: by,
                  actorName: by === 'PIC' ? actor : undefined,
                  action: `Transferred from ${fromPartNo} (ECN)`,
                  comment: reason?.trim() || undefined
                }
              ],
              updatedAt: now,
              updatedBy: by
            })
          }

          // Mark the old part superseded so it drops out of all tracking views.
          parts = parts.map((p) => (p.partNo === fromPartNo ? { ...p, supersededBy: to } : p))

          const event: PartEvent = {
            id: `evt-transfer-${fromPartNo}-${to}-${state.partEvents.length + 1}`,
            kind: 'Transferred',
            partNo: to,
            fromPartNo,
            entriesMoved: movedEntries.length,
            by: actor,
            byRole: by,
            at: now,
            reason: reason?.trim() || undefined
          }

          return {
            parts,
            entries: [...state.entries, ...movedEntries],
            partEvents: [...state.partEvents, event]
          }
        }),

      transferHistory: ({ fromPartNo, toPartNos, keepSourceActive, templateRowIds, by, actorName, reason }) =>
        set((state) => {
          const from = state.parts.find((p) => p.partNo === fromPartNo)
          const targets = Array.from(new Set(toPartNos.map((t) => t.trim()).filter((t) => t && t !== fromPartNo)))
          if (!from || from.supersededBy || targets.length === 0) return {}
          // Every target must be a known, non-superseded part with the SAME vendor code as the source.
          const valid = targets.filter((t) => state.parts.some((p) => p.partNo === t && !p.supersededBy && p.vendorCode === from.vendorCode))
          if (valid.length === 0) return {}

          const now = new Date().toISOString()
          const actor = actorName || by
          // Only the chosen activities (by template row); omitted = all of the source's activities.
          const pick = templateRowIds && templateRowIds.length > 0 ? new Set(templateRowIds) : null
          const sourceEntries = state.entries.filter((e) => e.partNo === fromPartNo && (!pick || pick.has(e.templateRowId)))
          if (sourceEntries.length === 0) return {}
          const newEntries: ActivityEntry[] = []
          const events: PartEvent[] = []

          valid.forEach((to, ti) => {
            let moved = 0
            for (const e of sourceEntries) {
              const newId = makeEntryId(e.templateRowId, to)
              // Keep any existing work on the target; only add entries it does not already have.
              if (state.entries.some((x) => x.id === newId) || newEntries.some((x) => x.id === newId)) continue
              newEntries.push({
                ...e,
                id: newId,
                partNo: to,
                history: [
                  ...e.history,
                  {
                    timestamp: now,
                    persona: by,
                    actorName: by === 'PIC' ? actor : undefined,
                    action: `History transferred from ${fromPartNo}`,
                    comment: reason?.trim() || undefined
                  }
                ],
                updatedAt: now,
                updatedBy: by
              })
              moved++
            }
            events.push({
              id: `evt-histxfer-${fromPartNo}-${to}-${state.partEvents.length + ti + 1}`,
              kind: 'Transferred',
              partNo: to,
              fromPartNo,
              entriesMoved: moved,
              by: actor,
              byRole: by,
              at: now,
              reason: reason?.trim() || undefined
            })
          })

          // Record provenance on the targets; mark the source inactive unless the user keeps it active.
          let parts = state.parts.map((p) => (valid.includes(p.partNo) ? { ...p, supersedes: fromPartNo } : p))
          if (!keepSourceActive) {
            // Mark the source inactive; it points to the first target as its nominal successor.
            parts = parts.map((p) => (p.partNo === fromPartNo ? { ...p, supersededBy: valid[0] } : p))
          }

          return {
            parts,
            entries: [...state.entries, ...newEntries],
            partEvents: [...state.partEvents, ...events]
          }
        }),

      requestHistoryTransfer: ({ fromPartNo, toPartNos, keepSourceActive, templateRowIds, by, actorName, reason }) => {
        const now = new Date().toISOString()
        const byName = actorName || by
        const id = `htx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        const immediate = by === 'SIC' // the SIC needs no approval
        set((state) => ({
          historyTransferRequests: [
            ...state.historyTransferRequests,
            {
              id, fromPartNo, toPartNos, templateRowIds, keepSourceActive, reason,
              requestedBy: by, requestedByName: byName, requestedAt: now,
              status: immediate ? 'Approved' : 'Pending',
              ...(immediate ? { decidedBy: byName, decidedAt: now, decisionComment: 'Auto-approved (requested by SIC)' } : {})
            }
          ],
          auditLog: [
            ...state.auditLog,
            { id: `aud-${id}`, at: now, persona: by, actorName: byName, action: immediate ? 'History transfer (SIC, no approval)' : 'History transfer requested', partNo: fromPartNo, detail: `${templateRowIds.length || 'all'} activit${templateRowIds.length === 1 ? 'y' : 'ies'} → ${toPartNos.length} part${toPartNos.length === 1 ? '' : 's'}${reason ? ` — ${reason}` : ''}` }
          ]
        }))
        if (immediate) {
          get().transferHistory({ fromPartNo, toPartNos, keepSourceActive, templateRowIds, by, actorName, reason })
        }
      },

      decideHistoryTransfer: (requestId, decision, by, byName, comment) => {
        if (by !== 'SIC') return
        const req = get().historyTransferRequests.find((r) => r.id === requestId)
        if (!req || req.status !== 'Pending') return
        const now = new Date().toISOString()
        set((state) => ({
          historyTransferRequests: state.historyTransferRequests.map((r) =>
            r.id === requestId ? { ...r, status: decision === 'Approve' ? 'Approved' : 'Rejected', decidedBy: byName, decidedAt: now, decisionComment: comment } : r
          ),
          auditLog: [
            ...state.auditLog,
            { id: `aud-${requestId}-${decision}`, at: now, persona: by, actorName: byName, action: `History transfer ${decision === 'Approve' ? 'approved' : 'rejected'}`, partNo: req.fromPartNo, detail: `by ${req.requestedByName}: ${req.templateRowIds.length || 'all'} activities → ${req.toPartNos.length} parts${comment ? ` — ${comment}` : ''}` }
          ]
        }))
        if (decision === 'Approve') {
          get().transferHistory({ fromPartNo: req.fromPartNo, toPartNos: req.toPartNos, keepSourceActive: req.keepSourceActive, templateRowIds: req.templateRowIds, by, actorName: byName, reason: req.reason })
        }
      },

      // Models
      addModel: (model) =>
        set((state) =>
          state.models.some((m) => m.name === model.name) ? {} : { models: [...state.models, model] }
        ),

      updateModel: (name, updated) =>
        set((state) => ({
          models: state.models.map((m) => (m.name === name ? { ...m, ...updated, name: m.name } : m))
        })),

      deleteModel: (name) => {
        const holder = projectOfModel(name, get().projects)
        if (holder) return { ok: false, reason: `${name} is part of ${holder.no} (${holder.name}). Close the project first.` }
        set((state) => ({ models: state.models.filter((m) => m.name !== name) }))
        return { ok: true }
      },

      initiateProject: (input, by) => {
        const state = get()
        const errors = validateInitiation(input, {
          archetypes: state.archetypes, models: state.models, milestones: state.milestones, projects: state.projects, by,
        })
        if (Object.keys(errors).length > 0) return { ok: false, errors }
        const drafts = input.master === 'Vehicle' ? input.models ?? [] : []
        let models = state.models
        const modelNames: string[] = []
        for (const d of drafts) {
          const nm = d.name.trim()
          const existing = models.find((m) => m.name.toLowerCase() === nm.toLowerCase())
          const mrds = cleanMrds(d.mrds)
          models = existing ? models.map((m) => (m === existing ? { ...m, mrds } : m)) : [...models, { name: nm, mrds }]
          modelNames.push(existing ? existing.name : nm)
        }
        const project: Project = {
          no: nextProjectNo(state.projects),
          name: input.name.trim(),
          archetypeId: input.archetypeId,
          master: input.master as Project['master'],
          modelNames,
          status: 'InExecution',
          initiatedBy: by,
          initiatedAt: new Date().toISOString(),
        }
        // One update: the models and the project land together.
        set({ models, projects: [...state.projects, project] })
        return { ok: true, project }
      },

      closeProject: (no, by) => {
        if (by !== PROJECT_INITIATOR) return { ok: false, reason: 'NOT_ALLOWED' }
        const p = get().projects.find((x) => x.no === no)
        if (!p) return { ok: false, reason: 'NOT_FOUND' }
        if (p.status === 'Closed') return { ok: false, reason: 'ALREADY_CLOSED' }
        const closed: Project = { ...p, status: 'Closed', closedBy: by, closedAt: new Date().toISOString() }
        set((s) => ({ projects: s.projects.map((x) => (x.no === no ? closed : x)) }))
        return { ok: true, project: closed }
      },

      // Sections
      addSection: (section) =>
        set((state) =>
          state.sections.some((s) => s.id === section.id) ? {} : { sections: [...state.sections, section] }
        ),

      updateSection: (id, updated) =>
        set((state) => ({
          sections: state.sections.map((s) => (s.id === id ? { ...s, ...updated } : s))
        })),

      deleteSection: (id) =>
        set((state) => {
          const removed = new Set(state.templateRows.filter((r) => r.section === id).map((r) => r.id))
          return {
            sections: state.sections.filter((s) => s.id !== id),
            templateRows: state.templateRows.filter((r) => r.section !== id),
            entries: state.entries.filter((e) => !removed.has(e.templateRowId))
          }
        }),

      // Milestones
      addMilestone: (milestone) =>
        set((state) =>
          state.milestones.some((m) => m.id === milestone.id)
            ? {}
            : { milestones: [...state.milestones, milestone] }
        ),

      updateMilestone: (id, updated) =>
        set((state) => ({
          milestones: state.milestones.map((m) => (m.id === id ? { ...m, ...updated } : m))
        })),

      deleteMilestone: (id) =>
        set((state) => {
          if (state.milestones.find((m) => m.id === id)?.mandatory) return {}
          const removed = new Set(state.templateRows.filter((r) => r.milestoneId === id).map((r) => r.id))
          return {
            milestones: state.milestones.filter((m) => m.id !== id),
            templateRows: state.templateRows.filter((r) => r.milestoneId !== id),
            entries: state.entries.filter((e) => !removed.has(e.templateRowId)),
            models: state.models.map((m) => {
              const { [id]: _dropped, ...mrds } = m.mrds
              return { ...m, mrds }
            })
          }
        }),

      // Section templates
      addTemplateRow: (row) =>
        set((state) =>
          state.templateRows.some((r) => r.id === row.id) ? {} : { templateRows: [...state.templateRows, row] }
        ),

      updateTemplateRow: (id, updated) =>
        set((state) => ({
          templateRows: state.templateRows.map((r) => (r.id === id ? { ...r, ...updated } : r))
        })),

      deleteTemplateRow: (id) =>
        set((state) => ({
          templateRows: state.templateRows.filter((r) => r.id !== id),
          entries: state.entries.filter((e) => e.templateRowId !== id)
        })),

      saveView: (name, activityId, widgets) =>
        set((state) => {
          const id = `view-${Date.now()}`
          return {
            savedViews: [...state.savedViews, { id, name, activityId, widgets }]
          }
        }),

      deleteView: (id) =>
        set((state) => ({
          savedViews: state.savedViews.filter((v) => v.id !== id)
        })),

      // Activity Actions
      addActivity: (activity) =>
        set((state) => {
          const dashboards = [...state.dashboards]
          if (!dashboards.some((d) => d.activityId === activity.id)) {
            dashboards.push(generateDashboardConfig(activity))
          }
          return {
            activities: [...state.activities, activity],
            dashboards
          }
        }),

      updateActivity: (id, updated) =>
        set((state) => ({
          activities: state.activities.map((act) =>
            act.id === id ? { ...act, ...updated } : act
          )
        })),

      deleteActivity: (id) =>
        set((state) => ({
          activities: state.activities.map((act) => (act.id === id ? { ...act, retired: true } : act))
        })),

      // Draft/Builder Actions
      saveDraft: (draft) =>
        set((state) => {
          const exists = state.drafts.some((d) => d.id === draft.id)
          return {
            drafts: exists
              ? state.drafts.map((d) => (d.id === draft.id ? draft : d))
              : [...state.drafts, draft]
          }
        }),

      deleteDraft: (draftId) =>
        set((state) => ({
          drafts: state.drafts.filter((d) => d.id !== draftId)
        })),

      publishDraft: (draftId) =>
        set((state) => {
          const draft = state.drafts.find((d) => d.id === draftId)
          if (!draft) return {}

          // Create/update the published activity from the draft
          const publishedActivity: ActivityDefinition = {
            ...draft,
            published: true,
          }

          const existsInActivities = draft.sourceId
            ? state.activities.some((a) => a.id === draft.sourceId)
            : false

          let newActivities: ActivityDefinition[]
          if (existsInActivities && draft.sourceId) {
            // Update existing
            newActivities = state.activities.map((a) =>
              a.id === draft.sourceId ? { ...publishedActivity, id: draft.sourceId } : a
            )
          } else {
            // Brand new — use draft id as the canonical id
            newActivities = [...state.activities, publishedActivity]
          }

          // Generate dashboard if not exists
          const dashboards = [...state.dashboards]
          const targetId = draft.sourceId || draft.id
          if (!dashboards.some((d) => d.activityId === targetId)) {
            dashboards.push(generateDashboardConfig({ ...publishedActivity, id: targetId }))
          }

          // First publish of an archetype activity: place it in every section under its WBS trial (default offsets),
          // so it is tracked straight away. Department Co-ordinators adjust offsets in Section Template.
          let templateRows = state.templateRows
          const trial = publishedActivity.defaultMilestoneId
          if (trial && !templateRows.some((r) => r.activityId === targetId)) {
            templateRows = [
              ...templateRows,
              ...state.sections.map((sec) => ({
                id: makeTemplateRowId(sec.id, targetId, trial),
                section: sec.id,
                activityId: targetId,
                milestoneId: trial,
                startOffset: -23,
                endOffset: 3,
              })),
            ]
          }

          return {
            activities: newActivities,
            drafts: state.drafts.filter((d) => d.id !== draftId),
            dashboards,
            templateRows,
          }
        }),

      // Entry Actions
      addEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry]
        })),

      updateEntry: (id, updated) =>
        set((state) => ({
          entries: state.entries.map((ent) =>
            ent.id === id ? { ...ent, ...updated } : ent
          )
        })),

      updateEntryValues: (templateRowId, partNo, newValues, currentPersona) =>
        set((state) => {
          const entryId = makeEntryId(templateRowId, partNo)
          const existingEntry = state.entries.find((e) => e.id === entryId)
          const row = state.templateRows.find((r) => r.id === templateRowId)
          const activity = row ? state.activities.find((a) => a.id === row.activityId) : undefined
          const part = state.parts.find((p) => p.partNo === partNo)

          if (!row || !activity || !part) return {}
          if (part.supersededBy) return {} // Superseded part is read-only; work on the new part
          if (existingEntry?.notApplicable) return {} // Read-only while Not applicable
          const activityId = activity.id

          const mergedValues = {
            ...(existingEntry?.values || {}),
            ...newValues
          }

          // Evaluate calculated fields using the pure engine
          const model = state.models.find((m) => m.name === part.model)
          const calculatedValues = evaluateCalculatedFields(
            activity,
            mergedValues,
            part,
            getMilestoneMrd(model, row.milestoneId)
          )

          let updatedEntry: ActivityEntry
          const now = new Date().toISOString()
          const actor = currentPersona || 'System'

          if (existingEntry) {
            updatedEntry = {
              ...existingEntry,
              values: calculatedValues,
              updatedAt: now,
              updatedBy: actor as any
            }
          } else {
            updatedEntry = {
              id: entryId,
              templateRowId,
              activityId,
              partNo,
              values: calculatedValues,
              validationState: 'Draft',
              currentStepIndex: 0,
              history: [
                {
                  timestamp: now,
                  persona: actor as any,
                  actorName: actor === 'PIC' ? getPicOn(part, state.picAssignments, DEMO_TODAY).name || undefined : undefined,
                  action: 'Draft entry initialized'
                }
              ],
              updatedAt: now,
              updatedBy: actor as any
            }
          }

          // Merge field metadata/status
          if (!updatedEntry.fieldMeta) {
            updatedEntry.fieldMeta = {}
          }
          for (const key of Object.keys(newValues)) {
            updatedEntry.fieldMeta[key] = {
              value: newValues[key],
              status: 'Pending'
            }
          }

          const updatedEntries = state.entries.map((e) =>
            e.id === entryId ? updatedEntry : e
          )

          if (!state.entries.some((e) => e.id === entryId)) {
            updatedEntries.push(updatedEntry)
          }

          return { entries: updatedEntries }
        }),

      setNotApplicable: (templateRowId, partNos, notApplicable, persona, reason) =>
        set((state) => {
          const row = state.templateRows.find((r) => r.id === templateRowId)
          const activity = row ? state.activities.find((a) => a.id === row.activityId) : undefined
          if (!row || !activity) return {}
          if (notApplicable && !(canMarkNotApplicable(persona) && activity.allowNotApplicable)) return {}
          if (!notApplicable && !canReverseNotApplicable(persona)) return {}

          const now = new Date().toISOString()
          const trimmed = reason?.trim() || undefined
          let entries = state.entries

          for (const partNo of partNos) {
            const part = state.parts.find((p) => p.partNo === partNo)
            if (!part || part.section !== row.section || part.supersededBy) continue
            const entryId = makeEntryId(templateRowId, partNo)
            const existing = entries.find((e) => e.id === entryId)
            if (notApplicable === !!existing?.notApplicable) continue // already in the requested state

            // The named person behind a PIC action is the part's PIC today; other roles are logged by role
            const picName = getPicOn(part, state.picAssignments, DEMO_TODAY).name || undefined
            const actorName = persona === 'PIC' ? picName : undefined
            const log = {
              timestamp: now,
              persona,
              actorName,
              action: notApplicable ? 'Marked Not applicable' : 'Marked applicable again',
              comment: trimmed
            }
            const mark = notApplicable
              ? { reason: trimmed, by: actorName ?? persona, byRole: persona, at: now }
              : undefined

            const updated: ActivityEntry = existing
              ? { ...existing, notApplicable: mark, history: [...existing.history, log], updatedAt: now, updatedBy: persona }
              : {
                  id: entryId,
                  templateRowId,
                  activityId: activity.id,
                  partNo,
                  values: {},
                  validationState: 'Draft',
                  currentStepIndex: 0,
                  notApplicable: mark,
                  history: [log],
                  updatedAt: now,
                  updatedBy: persona
                }
            entries = existing ? entries.map((e) => (e.id === entryId ? updated : e)) : [...entries, updated]
          }

          return { entries }
        }),

      setVendorTimeline: (templateRowId, partNo, start, end, persona, actorName, comment) =>
        set((state) => {
          if (!start || !end || start > end) return {}
          const row = state.templateRows.find((r) => r.id === templateRowId)
          const activity = row ? state.activities.find((a) => a.id === row.activityId) : undefined
          const part = state.parts.find((p) => p.partNo === partNo)
          if (!row || !activity || !part || part.supersededBy) return {}
          if (!activity.allowVendorPlannedTimeline) return {}
          // Vendor owns this; PIC/SIC/Admin may also set/correct it on the vendor's behalf.
          const allowed = persona === 'Vendor' || persona === 'PIC' || persona === 'SIC' || persona === 'Admin'
          if (!allowed) return {}

          const now = new Date().toISOString()
          const actor = actorName || persona
          const entryId = makeEntryId(templateRowId, partNo)
          const existing = state.entries.find((e) => e.id === entryId)
          const prior = existing?.vendorTimeline

          // No-op if unchanged
          if (prior?.current.start === start && prior?.current.end === end) return {}

          const newVersion = {
            start,
            end,
            setBy: actor,
            setByRole: persona,
            at: now,
            comment: comment?.trim() || undefined
          }
          // Push the previous "current" (with its own metadata) into history before setting the new one.
          const history = prior ? [...prior.history, prior.current] : []
          const finalTimeline: VendorTimeline = { current: newVersion, history }

          const log = {
            timestamp: now,
            persona,
            actorName: persona === 'Vendor' ? actor : undefined,
            action: prior ? 'Updated planned timeline' : 'Set planned timeline',
            comment: comment?.trim() || undefined
          }

          const updated: ActivityEntry = existing
            ? { ...existing, vendorTimeline: finalTimeline, history: [...existing.history, log], updatedAt: now, updatedBy: persona }
            : {
                id: entryId,
                templateRowId,
                activityId: activity.id,
                partNo,
                values: {},
                validationState: 'Draft',
                currentStepIndex: 0,
                vendorTimeline: finalTimeline,
                history: [log],
                updatedAt: now,
                updatedBy: persona
              }

          const entries = existing
            ? state.entries.map((e) => (e.id === entryId ? updated : e))
            : [...state.entries, updated]
          return { entries }
        }),

      addAction: (templateRowId, partNo, draft, persona, actorName) =>
        set((state) => {
          const title = draft.title?.trim()
          if (!title) return {}
          const canRaise = persona === 'PIC' || persona === 'SIC' || persona === 'Admin'
          if (!canRaise) return {}
          const row = state.templateRows.find((r) => r.id === templateRowId)
          const activity = row ? state.activities.find((a) => a.id === row.activityId) : undefined
          const part = state.parts.find((p) => p.partNo === partNo)
          if (!row || !activity || !part || part.supersededBy) return {}

          const now = new Date().toISOString()
          const actor = actorName || persona
          const entryId = makeEntryId(templateRowId, partNo)
          const existing = state.entries.find((e) => e.id === entryId)

          const action: Action = {
            id: `act-${entryId}-${(existing?.actions?.length ?? 0) + 1}-${Date.now().toString(36)}`,
            title,
            description: draft.description?.trim() || undefined,
            assignedTo: draft.assignedTo,
            assignedToName: draft.assignedToName?.trim() || undefined,
            targetDate: draft.targetDate || undefined,
            status: 'Open',
            createdBy: actor,
            createdByRole: persona,
            createdAt: now,
            history: [{ at: now, by: actor, byRole: persona, action: 'Raised action' }]
          }
          const log = {
            timestamp: now,
            persona,
            actorName: persona === 'PIC' ? actor : undefined,
            action: `Raised action for ${draft.assignedTo}: ${title}`
          }

          const updated: ActivityEntry = existing
            ? { ...existing, actions: [...(existing.actions ?? []), action], history: [...existing.history, log], updatedAt: now, updatedBy: persona }
            : {
                id: entryId,
                templateRowId,
                activityId: activity.id,
                partNo,
                values: {},
                validationState: 'Draft',
                currentStepIndex: 0,
                actions: [action],
                history: [log],
                updatedAt: now,
                updatedBy: persona
              }

          const entries = existing
            ? state.entries.map((e) => (e.id === entryId ? updated : e))
            : [...state.entries, updated]
          return { entries }
        }),

      updateAction: (templateRowId, partNo, actionId, patch, persona, actorName, comment) =>
        set((state) => {
          const entryId = makeEntryId(templateRowId, partNo)
          const entry = state.entries.find((e) => e.id === entryId)
          const action = entry?.actions?.find((a) => a.id === actionId)
          if (!entry || !action) return {}

          const isManager = persona === 'PIC' || persona === 'SIC' || persona === 'Admin'
          const isAssignee = persona === action.assignedTo
          // The assignee may only move status; managers may edit anything.
          const statusOnly = Object.keys(patch).every((k) => k === 'status')
          if (!isManager && !(isAssignee && statusOnly)) return {}

          const now = new Date().toISOString()
          const actor = actorName || persona
          const logs: typeof action.history = []
          const next: Action = { ...action }

          if (patch.status && patch.status !== action.status) {
            next.status = patch.status
            next.completedAt = patch.status === 'Done' ? now : undefined
            logs.push({ at: now, by: actor, byRole: persona, action: `Status → ${patch.status}`, comment: comment?.trim() || undefined })
          }
          if (patch.targetDate !== undefined && patch.targetDate !== action.targetDate) {
            // Keep the superseded target date for the strikethrough view.
            if (action.targetDate) {
              next.targetHistory = [
                ...(action.targetHistory ?? []),
                { targetDate: action.targetDate, setBy: actor, setByRole: persona, at: now }
              ]
            }
            next.targetDate = patch.targetDate || undefined
            logs.push({ at: now, by: actor, byRole: persona, action: patch.targetDate ? `Target date → ${patch.targetDate}` : 'Target date cleared' })
          }
          if (patch.title !== undefined && patch.title.trim() && patch.title.trim() !== action.title) {
            next.title = patch.title.trim()
            logs.push({ at: now, by: actor, byRole: persona, action: 'Edited title' })
          }
          if (patch.description !== undefined) {
            next.description = patch.description.trim() || undefined
            logs.push({ at: now, by: actor, byRole: persona, action: 'Edited description' })
          }
          if (patch.assignedTo !== undefined && patch.assignedTo !== action.assignedTo) {
            next.assignedTo = patch.assignedTo
            next.assignedToName = patch.assignedToName?.trim() || undefined
            logs.push({ at: now, by: actor, byRole: persona, action: `Reassigned to ${patch.assignedTo}` })
          } else if (patch.assignedToName !== undefined) {
            next.assignedToName = patch.assignedToName.trim() || undefined
          }

          if (logs.length === 0) return {}
          next.history = [...action.history, ...logs]

          const actions = entry.actions!.map((a) => (a.id === actionId ? next : a))
          const updatedEntry: ActivityEntry = { ...entry, actions, updatedAt: now, updatedBy: persona }
          return { entries: state.entries.map((e) => (e.id === entryId ? updatedEntry : e)) }
        }),

      deleteAction: (templateRowId, partNo, actionId, persona) =>
        set((state) => {
          if (!(persona === 'PIC' || persona === 'SIC' || persona === 'Admin')) return {}
          const entryId = makeEntryId(templateRowId, partNo)
          const entry = state.entries.find((e) => e.id === entryId)
          if (!entry?.actions) return {}
          const actions = entry.actions.filter((a) => a.id !== actionId)
          if (actions.length === entry.actions.length) return {}
          const updatedEntry: ActivityEntry = { ...entry, actions, updatedAt: new Date().toISOString(), updatedBy: persona }
          return { entries: state.entries.map((e) => (e.id === entryId ? updatedEntry : e)) }
        }),

      addDeviation: (templateRowId, partNo, draft, persona, actorName) =>
        set((state) => {
          const title = draft.title?.trim()
          if (!title) return {}
          if (!(persona === 'PIC' || persona === 'SIC' || persona === 'Admin')) return {}
          const row = state.templateRows.find((r) => r.id === templateRowId)
          const activity = row ? state.activities.find((a) => a.id === row.activityId) : undefined
          const part = state.parts.find((p) => p.partNo === partNo)
          if (!row || !activity || !part || part.supersededBy) return {}

          const now = new Date().toISOString()
          const actor = actorName || persona
          const flow = (activity.deviationFlow && activity.deviationFlow.length > 0)
            ? activity.deviationFlow
            : (['PIC', 'SIC', 'DPM'] as PersonaId[])
          const entryId = makeEntryId(templateRowId, partNo)
          const existing = state.entries.find((e) => e.id === entryId)

          const deviation: Deviation = {
            id: `dev-${entryId}-${(existing?.deviations?.length ?? 0) + 1}-${Date.now().toString(36)}`,
            title,
            description: draft.description?.trim() || undefined,
            edocNumber: draft.edocNumber?.trim() || undefined,
            targetDate: draft.targetDate || undefined,
            flow,
            currentStep: 0,
            status: 'In progress',
            raisedBy: actor,
            raisedByRole: persona,
            raisedAt: now,
            history: [{ at: now, by: actor, byRole: persona, action: `Raised (awaiting ${flow[0]})`, comment: draft.description?.trim() || undefined }]
          }
          const log = { timestamp: now, persona, actorName: persona === 'PIC' ? actor : undefined, action: `Raised deviation: ${title}` }

          const updated: ActivityEntry = existing
            ? { ...existing, deviations: [...(existing.deviations ?? []), deviation], history: [...existing.history, log], updatedAt: now, updatedBy: persona }
            : {
                id: entryId, templateRowId, activityId: activity.id, partNo, values: {},
                validationState: 'Draft', currentStepIndex: 0,
                deviations: [deviation], history: [log], updatedAt: now, updatedBy: persona
              }
          const entries = existing ? state.entries.map((e) => (e.id === entryId ? updated : e)) : [...state.entries, updated]
          return { entries }
        }),

      advanceDeviation: (templateRowId, partNo, deviationId, action, persona, actorName, comment) =>
        set((state) => {
          const entryId = makeEntryId(templateRowId, partNo)
          const entry = state.entries.find((e) => e.id === entryId)
          const dev = entry?.deviations?.find((d) => d.id === deviationId)
          if (!entry || !dev || dev.status === 'Approved' || dev.status === 'Rejected') return {}

          const currentRole = dev.flow[dev.currentStep]
          // Only the role whose turn it is (or Admin) can act.
          if (persona !== currentRole && persona !== 'Admin') return {}

          const now = new Date().toISOString()
          const actor = actorName || persona
          const next: Deviation = { ...dev }
          const log = (a: string) => ({ at: now, by: actor, byRole: persona, action: a, comment: comment?.trim() || undefined })

          if (action === 'Reject') {
            next.status = 'Rejected'
            next.decidedAt = now
            next.history = [...dev.history, log(`Rejected at ${currentRole}`)]
          } else if (action === 'Send back') {
            next.status = 'Sent back'
            next.currentStep = 0
            next.history = [...dev.history, log(`Sent back from ${currentRole} (restart at ${dev.flow[0]})`)]
          } else {
            // Approve: advance, or finalise at the last step.
            if (dev.currentStep >= dev.flow.length - 1) {
              next.status = 'Approved'
              next.decidedAt = now
              next.history = [...dev.history, log(`Approved at ${currentRole} — deviation approved`)]
            } else {
              next.status = 'In progress'
              next.currentStep = dev.currentStep + 1
              next.history = [...dev.history, log(`Approved at ${currentRole} (awaiting ${dev.flow[dev.currentStep + 1]})`)]
            }
          }
          // A sent-back deviation re-enters the flow as In progress on the next approver action; mark it so now.
          if (action === 'Send back') next.status = 'In progress'

          const deviations = entry.deviations!.map((d) => (d.id === deviationId ? next : d))
          const updatedEntry: ActivityEntry = { ...entry, deviations, updatedAt: now, updatedBy: persona }
          return { entries: state.entries.map((e) => (e.id === entryId ? updatedEntry : e)) }
        }),

      transitionEntryState: (entryId, action, comment, currentPersona) =>
        set((state) => {
          const entry = state.entries.find((e) => e.id === entryId)
          if (!entry) return {}
          const activity = state.activities.find((a) => a.id === entry.activityId)
          if (!activity) return {}
          if (entry.notApplicable) return {} // No workflow on a Not-applicable part; reverse it first

          // PIC actions are stamped with the person who is the part's PIC today
          const part = state.parts.find((p) => p.partNo === entry.partNo)
          const actorName =
            currentPersona === 'PIC' && part
              ? getPicOn(part, state.picAssignments, DEMO_TODAY).name || undefined
              : undefined
          let transitioned = transitionEntry(activity, entry, action, comment, currentPersona, actorName)

          // Approving a resubmission clears the latest open NG round.
          if (action === 'Approve' && transitioned.validationState === 'Approved' && transitioned.ngRounds?.some((r) => !r.resolvedAt)) {
            const now = new Date().toISOString()
            let cleared = false
            const ngRounds = [...transitioned.ngRounds]
              .reverse()
              .map((r) => (!cleared && !r.resolvedAt ? ((cleared = true), { ...r, resolvedAt: now }) : r))
              .reverse()
            transitioned = { ...transitioned, ngRounds }
          }

          return {
            entries: state.entries.map((e) => (e.id === entryId ? transitioned : e))
          }
        }),

      markEntryNg: (entryId, reason, targetDate, currentPersona) =>
        set((state) => {
          if (currentPersona !== 'PIC' && currentPersona !== 'SIC' && currentPersona !== 'DPM') return {}
          const entry = state.entries.find((e) => e.id === entryId)
          if (!entry || entry.notApplicable || entry.validationState !== 'Submitted') return {}
          const activity = state.activities.find((a) => a.id === entry.activityId)
          if (!activity?.trackNgRounds) return {}
          const part = state.parts.find((p) => p.partNo === entry.partNo)
          const byName =
            (currentPersona === 'PIC' && part ? getPicOn(part, state.picAssignments, DEMO_TODAY).name : '') || currentPersona
          const round = (entry.ngRounds?.length ?? 0) + 1
          const now = new Date().toISOString()
          const ngRounds = [...(entry.ngRounds ?? []), { round, reason, by: currentPersona as PersonaId, byName, at: now, targetDate }]
          // Send it back to the vendor, logging the NG as the reason.
          const sentBack = transitionEntry(activity, { ...entry, ngRounds }, 'Send back', `NG (round ${round}): ${reason}`, currentPersona, byName === currentPersona ? undefined : byName)
          return { entries: state.entries.map((e) => (e.id === entryId ? sentBack : e)) }
        }),

      // Dashboard Actions
      updateDashboard: (activityId, config) =>
        set((state) => ({
          dashboards: state.dashboards.map((dash) =>
            dash.activityId === activityId ? config : dash
          )
        })),

      resetDashboard: (activityId) =>
        set((state) => {
          let freshDashboard: any
          if (activityId === 'overview') {
            freshDashboard = generateOverviewDashboardConfig()
          } else {
            const activity = state.activities.find((a) => a.id === activityId)
            if (!activity) return {}
            freshDashboard = generateDashboardConfig(activity)
          }
          return {
            dashboards: state.dashboards.map((dash) =>
              dash.activityId === activityId ? freshDashboard : dash
            )
          }
        }),

      logAudit: (entry) =>
        set((state) => ({
          auditLog: [...state.auditLog, { ...entry, id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() }]
        })),
      addDocument: async (doc, file) => {
        const id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        await putBlob(id, file)
        const now = new Date().toISOString()
        set((state) => ({
          documents: [...state.documents, { ...doc, id, uploadedAt: now }],
          auditLog: [
            ...state.auditLog,
            {
              id: `aud-${id}`,
              at: now,
              persona: doc.uploadedBy,
              actorName: doc.uploadedByName,
              action: 'Document uploaded',
              partNo: doc.partNo,
              activityId: doc.activityId,
              templateRowId: doc.templateRowId,
              detail: `${doc.name} (${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB)`
            }
          ]
        }))
      },
      deleteDocument: (docId, by, byName) => {
        if (by !== 'SIC') return false
        let removed = false
        set((state) => {
          const doc = state.documents.find((d) => d.id === docId)
          if (!doc) return {}
          removed = true
          void deleteBlob(docId)
          return {
            documents: state.documents.filter((d) => d.id !== docId),
            auditLog: [
              ...state.auditLog,
              {
                id: `aud-del-${docId}`,
                at: new Date().toISOString(),
                persona: by,
                actorName: byName,
                action: 'Document deleted',
                partNo: doc.partNo,
                activityId: doc.activityId,
                templateRowId: doc.templateRowId,
                detail: `${doc.name} (uploaded by ${doc.uploadedByName} on ${doc.uploadedAt.slice(0, 10)})`
              }
            ]
          }
        })
        return removed
      },
      restoreActivityDefault: (activityId) =>
        set((state) => {
          const seed = SEED_ACTIVITIES.find((a) => a.id === activityId)
          if (!seed) return {}
          const fresh = generateDashboardConfig(seed)
          return {
            activities: state.activities.map((a) => (a.id === activityId ? seed : a)),
            drafts: state.drafts.filter((d) => d.id !== `draft-edit-${activityId}` && d.sourceId !== activityId),
            dashboards: state.dashboards.map((d) => (d.activityId === activityId ? fresh : d))
          }
        }),
      // TEMPORARY authoring aid (remove with the header button): rebuild sample parts from the live activity fields.
      loadSampleParts: () =>
        set((state) => {
          void clearBlobs()
          const d = buildDemoData(state.activities, state.templateRows, state.models)
          // Two sample PENDING history-transfer requests (Minda V1001 parts) so the SIC has something to approve.
          const now = '2026-10-14T10:00:00Z'
          const sampleHtx: HistoryTransferRequest[] = d.parts.some((p) => p.partNo === '31100-M74LD0')
            ? [
                {
                  id: 'htx-sample-1', fromPartNo: '31100-M74LD0', toPartNos: ['31100-M74LD1'], templateRowIds: [],
                  keepSourceActive: true, reason: 'ECN-2041 — carry headlamp LH history to RH', requestedBy: 'PIC',
                  requestedByName: 'Rahul Verma', requestedAt: now, status: 'Pending'
                },
                {
                  id: 'htx-sample-2', fromPartNo: '31100-M74LD0', toPartNos: ['35520-M68P00'], templateRowIds: [],
                  keepSourceActive: false, reason: 'Second sourcing — move history and retire the old number', requestedBy: 'PIC',
                  requestedByName: 'Suresh Nair', requestedAt: now, status: 'Pending'
                }
              ]
            : []
          return {
            parts: d.parts,
            entries: d.entries,
            partReleases: d.partReleases,
            partAcks: d.partAcks,
            partEvents: [],
            picAssignments: [],
            delayReasons: d.delayReasons,
            models: d.models,
            // Keep every In Execution project's models in the (rebuilt) model master.
            projects: pruneProjects(state.projects, d.models),
            documents: [],
            historyTransferRequests: sampleHtx
          }
        }),
      unloadParts: () => {
        void clearBlobs()
        set({ parts: [], entries: [], partReleases: [], partAcks: [], partEvents: [], picAssignments: [], delayReasons: [], documents: [], historyTransferRequests: [] })
      },
      // Reset Demo Data
      resetDemoData: () =>
        set({
          activities: SEED_ACTIVITIES,
          entries: SEED_ENTRIES,
          dashboards: [generateOverviewDashboardConfig(), ...SEED_ACTIVITIES.map((act) => generateDashboardConfig(act))],
          models: SEED_MODELS,
          sections: SEED_SECTIONS,
          milestones: SEED_MILESTONES,
          templateRows: SEED_TEMPLATE_ROWS,
          picAssignments: SEED_PIC_ASSIGNMENTS,
          parts: MOCK_PART_LIST.map((p) => ({ ...p, origin: 'SAP' as const, technicalCategory: deriveTechnicalCategory(p) })),
          documents: [],
          auditLog: [],
          historyTransferRequests: [],
          partEvents: SEED_PART_EVENTS,
          partReleases: SEED_PART_RELEASES,
          partAcks: SEED_PART_ACKS,
          delayReasons: SEED_DELAY_REASONS,
          crossDashboards: [],
          activityDependencies: [],
          archetypes: SEED_ARCHETYPES,
          projects: SEED_PROJECTS,
          vendorInfo: SEED_VENDOR_INFO,
          vendorVisits: SEED_VENDOR_VISITS,
          drafts: [],
          savedViews: []
        })
    }),
    {
      name: 'qa-tracker-store',
      // v2: planned dates removed from activities; entries keyed by template row. v3: PIC assignments. v4: part applicability. v6: default "Completion rate by Model / Department" charts. v7: part master lifted into store (manual/dummy parts + ECN transfer). v8: PIC release-to-vendor gate. v9: vendor-set planned timelines. v10: actions/recommendations on entries. v11: cross-activity dashboards. v12: table field type + SOR activity. v13: removed Temporary/Permanent from PIC assignments. v14: manpower planning (vendor info + visits). v15: seed activities replaced with ~45 PPT blueprints + deviations on entries. v20: delay reasons (vendor gives, PIC accepts or sends back). v19: vendor acknowledge/return of released parts, ddvm/dvm personas removed. v44: governance archetypes (WBS templates feed the Activity Builder). v45: projects (Project Initiation) gate the work screens; models no longer carry archetypeId. v46: one model per project (seed: one project per model). Stale data is dropped.
      version: 46,
      migrate: () => ({})
    }
  )
)
