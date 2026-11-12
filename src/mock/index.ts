import { makeTemplateRowId, makeTimelineRowId } from '../domain'
import { MILESTONE_SUBTYPES, subTypeMrdKey } from '../domain/timelineCatalog'
import type {
  PicAssignment,
  ActivityDefinition,
  PartRecord,
  PartEvent,
  PartRelease,
  PartAck,
  DelayReason,
  VendorInfo,
  VendorVisit,
  ActivityEntry,
  MilestoneDef,
  ModelRecord,
  Section,
  TemplateRow,
  ProjectArchetype
} from '../domain'
import { ACTIVITY_MILESTONE, ALL_BLUEPRINTS } from './ppActivities'

/** Configurable milestone list. PP, MPP, Pilot, SOP are mandatory. */
export const SEED_MILESTONES: MilestoneDef[] = [
  { id: 'PP', label: 'PP', mandatory: true },
  { id: 'MPP', label: 'MPP', mandatory: true },
  { id: 'Pilot', label: 'Pilot', mandatory: true },
  { id: 'SOP', label: 'SOP', mandatory: true },
  { id: 'Jig', label: 'Jig', mandatory: false },
  { id: 'Kani', label: 'Kani', mandatory: false },
  { id: 'Weld', label: 'Weld', mandatory: false },
  { id: 'Engine', label: 'Engine', mandatory: false },
  { id: 'Assembly', label: 'Assembly', mandatory: false }
]

/** Configurable section list. */
export const SEED_SECTIONS: Section[] = ['NP1', 'NP2', 'NP3', 'NP4', 'NP5', 'NP6'].map((id) => ({ id, label: id }))

/**
 * Seeds every PP/MPP/Pilot sub-type MRD from the milestone's base date: each sub-type sits a few days around the
 * base so activities configured against a sub-type have a real date. (PP/MPP/Pilot no longer have an own date in
 * the UI, but the plain keys are kept too so activities without a timeline template still resolve.)
 */
function subTypeSeed(pp: string, mpp: string, pilot: string): Record<string, string> {
  const base: Record<string, string> = { PP: pp, MPP: mpp, Pilot: pilot }
  const out: Record<string, string> = {}
  const offsets: Record<string, number> = { Kani: -6, Jig: -4, Weld: -2, Engine: 0, Transmission: 2, Assembly: 4, ActualQVDate: 6 }
  for (const ms of Object.keys(MILESTONE_SUBTYPES)) {
    for (const st of MILESTONE_SUBTYPES[ms]) {
      out[subTypeMrdKey(ms, st)] = addDaysLocal(base[ms], offsets[st] ?? 0)
    }
  }
  return out
}
function addDaysLocal(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Seed models. SOP is filled on every model; PP/MPP/Pilot carry sub-type MRDs (plus a plain base key kept for
 * backward compatibility). The optional milestones (Jig, Kani, Weld, Engine, Assembly) are filled on some models
 * and left blank on others so "Awaiting MRD" can be demonstrated.
 */
const BASE_MODELS: ModelRecord[] = [
  { name: 'Swift', mrds: { PP: '2026-10-24', MPP: '2026-11-05', Pilot: '2026-11-25', SOP: '2026-12-15', Jig: '2026-10-30', Weld: '2026-11-10', ...subTypeSeed('2026-10-24', '2026-11-05', '2026-11-25') } },
  { name: 'Brezza', mrds: { PP: '2026-10-26', MPP: '2026-11-08', Pilot: '2026-11-28', SOP: '2026-12-18', Engine: '2026-11-12', Assembly: '2026-11-20', ...subTypeSeed('2026-10-26', '2026-11-08', '2026-11-28') } },
  { name: 'Baleno', mrds: { PP: '2026-10-12', MPP: '2026-10-16', Pilot: '2026-11-05', SOP: '2026-11-30', ...subTypeSeed('2026-10-12', '2026-10-16', '2026-11-05') } },
  {
    name: 'Grand Vitara',
    mrds: { PP: '2026-11-02', MPP: '2026-11-16', Pilot: '2026-12-05', SOP: '2026-12-28', Jig: '2026-11-10', Kani: '2026-11-12', Weld: '2026-11-18', Engine: '2026-11-22', Assembly: '2026-12-01', ...subTypeSeed('2026-11-02', '2026-11-16', '2026-12-05') }
  },
  { name: 'Fronx', mrds: { PP: '2026-10-22', MPP: '2026-11-04', Pilot: '2026-11-24', SOP: '2026-12-14', Jig: '2026-10-28', ...subTypeSeed('2026-10-22', '2026-11-04', '2026-11-24') } },
  { name: 'Dzire', mrds: { PP: '2026-10-20', MPP: '2026-11-02', Pilot: '2026-11-22', SOP: '2026-12-12', Kani: '2026-11-05', ...subTypeSeed('2026-10-20', '2026-11-02', '2026-11-22') } }
]
/** Every seed model (project) follows the seed archetype. */
export const SEED_MODELS: ModelRecord[] = BASE_MODELS.map((m) => ({ ...m, archetypeId: 'ARC-001' }))

/**
 * NP1 template rows: every PP activity (pp-1 … pp-16), placed in the PP window.
 * Offsets are calendar days from the PP milestone MRD of each part's model.
 */
const PP_OFFSETS: Record<string, { startOffset: number; endOffset: number }> = {
  'pp-1': { startOffset: -23, endOffset: -4 },
  'pp-2': { startOffset: -23, endOffset: 1 },
  'pp-3': { startOffset: -23, endOffset: 2 },
  'pp-10': { startOffset: -23, endOffset: 7 }
}
export const SEED_TEMPLATE_ROWS: TemplateRow[] = ALL_BLUEPRINTS.flatMap((a) => {
  // Activities with a timeline template get one row per (milestone × sub-type) the template targets (across all
  // categories). Resolution uses each row's own sub-type MRD; getFilteredData only creates an instance for a part
  // when its model has that sub-type's MRD. Other activities keep a single PP row.
  if (a.timelineTemplate && a.timelineTemplate.length > 0) {
    const seen = new Set<string>()
    const rows: TemplateRow[] = []
    for (const entry of a.timelineTemplate) {
      for (const off of entry.offsets) {
        const key = `${off.milestoneId}-${off.subType}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({
          id: makeTimelineRowId('NP1', a.id, off.milestoneId, off.subType),
          section: 'NP1',
          activityId: a.id,
          milestoneId: off.milestoneId,
          subType: off.subType,
          // Offsets here are placeholders; the sub-type MRD − X comes from the activity's timeline template.
          startOffset: -off.minusDays,
          endOffset: -(off.endMinusDays ?? 0)
        })
      }
    }
    return rows
  }
  return [{
    id: makeTemplateRowId('NP1', a.id, ACTIVITY_MILESTONE[a.id] ?? 'PP'),
    section: 'NP1',
    activityId: a.id,
    milestoneId: ACTIVITY_MILESTONE[a.id] ?? 'PP',
    ...(PP_OFFSETS[a.id] ?? { startOffset: -23, endOffset: 3 })
  }]
})
/**
 * Governance seed: one archetype whose WBS template holds every existing QA activity (one QA object each, in trial
 * order). New QA objects added to it (or to new archetypes) show up in the Activity Builder.
 */
export const SEED_ARCHETYPE_ID = 'ARC-001'
export const SEED_ARCHETYPES: ProjectArchetype[] = [
  {
    id: SEED_ARCHETYPE_ID,
    name: 'Vehicle Development – QA',
    description: 'QA activities for a new vehicle model: Prototype (PP), Mass Pre-Production (MPP) and Pilot/SOP trials.',
    active: true,
    wbs: ALL_BLUEPRINTS.map((a, i) => ({
      id: `wbs-${i + 1}`,
      name: a.name,
      type: 'QA' as const,
      trial: ACTIVITY_MILESTONE[a.id] ?? 'PP',
      activityId: a.id,
    })),
  },
]

/** Seed activity definitions: the PP activity list only (see ./ppActivities), linked to the seed archetype. */
export const SEED_ACTIVITIES: ActivityDefinition[] = ALL_BLUEPRINTS.map((a) => ({
  ...a,
  archetypeId: SEED_ARCHETYPE_ID,
  wbsObjectId: SEED_ARCHETYPES[0].wbs.find((o) => o.activityId === a.id)!.id,
  defaultMilestoneId: ACTIVITY_MILESTONE[a.id] ?? 'PP',
}))
/** Part master: empty. Parts are added by the Department Co-ordinator, a PIC or Admin. */
export const MOCK_PART_LIST: PartRecord[] = []
/** No PIC assignments until parts exist. */
export const SEED_PIC_ASSIGNMENTS: PicAssignment[] = []
export const SEED_VENDOR_INFO: VendorInfo[] = [
  { vendorName: 'Minda Industries', location: 'Manesar' },
  { vendorName: 'Denso India', location: 'Manesar' },
  { vendorName: 'Bosch India', location: 'Pune' },
  { vendorName: 'Subros Limited', location: 'Pune' },
  { vendorName: 'Sanden Vikas', location: 'Bawal' },
  { vendorName: 'Asahi Glass', location: 'Bawal' }
]
export const SEED_VENDOR_VISITS: VendorVisit[] = []
export const SEED_PART_EVENTS: PartEvent[] = []
export const SEED_PART_RELEASES: PartRelease[] = []
export const SEED_PART_ACKS: PartAck[] = []
export const SEED_DELAY_REASONS: DelayReason[] = []
const RAW_SEED_ENTRIES: ActivityEntry[] = []

/**
 * Simulates a delay using Promises.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mock Service Fetchers:
 * Simulates calling external integrations with a 500ms network delay.
 * Includes a 15% probability of a simulated "Integration not available" state.
 */
export async function fetchFromEnovia(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'ENOVIA integration service is currently not available.' }
  }

  // Mock attributes, stable per part number (the part master lives in the store, so nothing is looked up here).
  const h = Array.from(partNo).reduce((n, c) => n + c.charCodeAt(0), 0)
  const day = (offset: number) => `2026-11-${String(1 + ((h + offset) % 27)).padStart(2, '0')}`
  const yn = (vals: string[]) => vals[h % vals.length]
  return {
    success: true,
    data: {
      drawingNo: `DRW-${partNo}-REV01`,
      cadModelAvailable: true,
      lastUpdated: new Date().toISOString(),
      // Keys are matched to activity fields by name, ignoring underscores (see PartDetailDrawer).
      targetDateProprietary: day(9),
      techMeetingStatus: yn(['Y', 'N', 'Y', '']),
      processMeeting: yn(['N', 'Y', 'Y', '']),
      enoviaSpecMeetingStatus: ['Initiated', 'Pending', 'Approved'][h % 3],
      plannedStartDate: day(2),
      enoviaActualEndDate: day(16),
      applicabilityOfMsilToolGoAhead: yn(['Y', 'Y', 'N']),
      msilToolGoAheadDate: day(4),
      otPlannedDate: day(21),
      inspectionTargetDate: day(12),
      inspectionCompleted: yn(['Y', 'N', 'Y']),
      inspectionStatus: ['OK', 'NG'][h % 2],
      mispPrepared: yn(['Y', 'N', 'Y']),
      meetingClassification: partNo.endsWith('0') ? 'Tech meeting' : 'Process meeting'
    }
  }
}

/** SAP's Tier-2 supplier records for a part (mock, stable per part number). A blank RYG status means "Others". */
export function sapTier2Rows(partNo: string): Record<string, any>[] {
  const h = Array.from(partNo).reduce((n, c) => n + c.charCodeAt(0), 0)
  const rag = ['Red', 'Yellow', 'Green']
  return [0, 1, 2, 3].map((i) => {
    const r = i === 3 ? '' : rag[(h >> i) % 3]
    return {
      code: 7000 + ((h * (i + 3)) % 900),
      name: `Tier-2 Supplier ${String.fromCharCode(65 + ((h + i) % 20))}`,
      rag: r,
      // The last row is always an "Others" supplier that is New (Unaudited), so the PP05 list is never empty in the demo.
      others_status: r === '' ? 'New (Unaudited)' : ''
    }
  })
}
export async function fetchFromSap(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'SAP network socket timed out.' }
  }

  const part = MOCK_PART_LIST.find((p) => p.partNo === partNo)
  if (!part) {
    return { success: false, error: `Part ${partNo} not found in SAP inventory.` }
  }

  // Mock attributes, stable per part number. Keys are matched to activity fields by name (see PartDetailDrawer).
  const h = Array.from(partNo).reduce((n, c) => n + c.charCodeAt(0), 0)
  const day = (offset: number) => `2026-10-${String(1 + ((h + offset) % 27)).padStart(2, '0')}`
  return {
    success: true,
    data: {
      specMeetingStatus: partNo.endsWith('0') ? 'Approved' : 'Pending',
      partCategory: ['A', 'AR', 'A/AR', 'G', 'F'][h % 5],
      uploadedInSmir: partNo.endsWith('2') || partNo.endsWith('0'),
      sapPostingDate: '2026-10-02',
      tier2Suppliers: sapTier2Rows(partNo),
      monitoringRequiredReason: h % 3 === 0 ? 'ECN Part' : 'New Part',
      sapSpecMeetingStatus: ['Not Initiated', 'Initiated', 'Pending For Approval', 'Approved'][h % 4],
      actualStartDate: day(3),
      sapActualEndDate: day(14),
      newTier2VendorCode: 5000 + (h % 900),
      newTier2VendorName: `New Tier-2 Vendor ${1 + (h % 9)}`,
      auditStatus: h % 2 === 0 ? 'Done' : 'Not done',
      newnessType: ['New Tech. / New Design', 'New Vendor', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others'][h % 7],
      // Sheet metal applies only to weld parts; the mock treats every third part number as a weld part.
      sheetMetalApplicability: h % 3 === 0 ? 'Y' : 'N',
      totalParameters: 10 + (h % 15),
      inspectionActualDate: day(10),
      evidenceAttachment: h % 2 === 0 ? 'Y' : 'N'
    }
  }
}

export async function fetchFromEdoc(docNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'E-Doc repository is undergoing scheduled maintenance.' }
  }

  if (!docNo || docNo.trim() === '') {
    return { success: false, error: 'E-Doc tracking number cannot be empty.' }
  }

  // Generate plausible deviation info
  const idHash = docNo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const statusOptions = ['Accept', 'Pending', 'Reject'] as const
  const finalStatus = statusOptions[idHash % 3]

  return {
    success: true,
    data: {
      eDocNumber: docNo,
      deviationStatus: finalStatus,
      raisedBy: 'PIC-AUTO',
      approvalDate: finalStatus === 'Accept' ? '2026-10-14' : null,
      notes: 'Automated lookup successful from E-Doc.'
    }
  }
}

export async function fetchFromRegApp(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'Regulatory App API endpoint is offline.' }
  }

  const part = MOCK_PART_LIST.find((p) => p.partNo === partNo)
  if (!part) {
    return { success: false, error: `Part ${partNo} not found in Regulatory register.` }
  }

  return {
    success: true,
    data: {
      certNo: `REG-CERT-${part.partNo}-2026`,
      status: 'Approved',
      validUntil: '2029-12-31',
      homologationRequired: true
    }
  }
}

/**
 * Seed entries, pruned to the current activity definitions. The blueprints are generated from the client's
 * field-validation spreadsheet and can change; any seeded value (or field meta) whose key no longer exists on
 * the entry's activity is dropped so stale keys never linger. Entry shells, states and history are kept so the
 * demo still shows Approved / Submitted / Sent back / Draft rows.
 */
function pruneEntryValues(entries: ActivityEntry[], defs: ActivityDefinition[]): ActivityEntry[] {
  const keysByActivity = new Map(defs.map((a) => [a.id, new Set(a.fields.map((f) => f.key))]))
  return entries.map((e) => {
    const keys = keysByActivity.get(e.activityId)
    if (!keys) return e
    const values = Object.fromEntries(Object.entries(e.values).filter(([k]) => keys.has(k)))
    const fieldMeta = e.fieldMeta ? Object.fromEntries(Object.entries(e.fieldMeta).filter(([k]) => keys.has(k))) : undefined
    return { ...e, values, ...(fieldMeta ? { fieldMeta } : {}) }
  })
}

export const SEED_ENTRIES: ActivityEntry[] = pruneEntryValues(RAW_SEED_ENTRIES, ALL_BLUEPRINTS)
