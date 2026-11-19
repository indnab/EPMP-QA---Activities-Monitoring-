/**
 * Activity configuration file: share what Governance / the Activity Builder set up, without code changes.
 *
 * Someone configures activities in their browser, clicks "Export configuration" and emails the file. Saving that
 * file in the repo as `public/config/activity-config.json` and pushing it makes every browser that opens the site
 * apply it once (it is re-applied only when a newer file is pushed). "Import configuration" applies a file in this
 * browser only, e.g. to check it before pushing.
 *
 * The file holds configuration only: archetypes (WBS), activities (fields, flows), milestones, sections, section
 * template rows and activity dependencies. Models, projects, parts, entries and other work data are never touched.
 * Unpublished Activity Builder drafts are not included.
 */
import { useQAStore } from '../../store/qaStore'
import type { QAStoreState } from '../../store/qaStore'

export const CONFIG_KIND = 'qa-activity-config'
export const CONFIG_FORMAT = 1
/** Where the shared file lives in the repo (under public/). */
export const CONFIG_PATH = 'config/activity-config.json'
const APPLIED_KEY = 'qa-tracker-config-applied'

const KEYS = ['archetypes', 'activities', 'milestones', 'sections', 'templateRows', 'activityDependencies'] as const
type ConfigKey = (typeof KEYS)[number]
export type ConfigData = Pick<QAStoreState, ConfigKey>

export interface ConfigFile extends ConfigData {
  kind: typeof CONFIG_KIND
  format: number
  /** Unique per export; a browser applies a pushed file once per id. */
  id: string
  exportedAt: string
  exportedBy?: string
}

export function buildConfig(exportedBy?: string): ConfigFile {
  const s = useQAStore.getState()
  const exportedAt = new Date().toISOString()
  return {
    kind: CONFIG_KIND,
    format: CONFIG_FORMAT,
    id: `cfg-${exportedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`,
    exportedAt,
    exportedBy,
    archetypes: s.archetypes,
    activities: s.activities,
    milestones: s.milestones,
    sections: s.sections,
    templateRows: s.templateRows,
    activityDependencies: s.activityDependencies,
  }
}

export function downloadConfig(exportedBy?: string) {
  const cfg = buildConfig(exportedBy)
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'activity-config.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Checks the file's shape. Returns the config, or an error message. */
export function parseConfig(text: string): { ok: true; config: ConfigFile } | { ok: false; error: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'The file is not valid JSON.' } }
  const c = raw as Partial<ConfigFile>
  if (!c || c.kind !== CONFIG_KIND) return { ok: false, error: 'This is not an activity configuration file (exported from Governance).' }
  if (typeof c.format !== 'number' || c.format > CONFIG_FORMAT) return { ok: false, error: 'This file was made by a newer version of the app. Reload to update, then try again.' }
  for (const k of KEYS) if (!Array.isArray(c[k])) return { ok: false, error: `The file is missing "${k}".` }
  if (!c.activities!.length) return { ok: false, error: 'The file has no activities.' }
  return { ok: true, config: c as ConfigFile }
}

/** One-line summary for confirmations. */
export const summarize = (c: ConfigData) =>
  `${c.archetypes.length} archetype${c.archetypes.length === 1 ? '' : 's'}, ${c.activities.length} activities, ` +
  `${c.milestones.length} milestones, ${c.templateRows.length} template rows`

/** Replace this browser's configuration with the file's (work data stays). */
export function applyConfig(c: ConfigFile) {
  useQAStore.setState(Object.fromEntries(KEYS.map((k) => [k, c[k]])) as Partial<QAStoreState>)
  localStorage.setItem(APPLIED_KEY, c.id)
}

/**
 * On start: if the repo has a configuration file this browser has not applied yet, apply it. Returns its summary
 * when applied (for a notice), else null. A missing file is normal (nothing shared yet).
 */
export async function loadSharedConfig(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${CONFIG_PATH}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = parseConfig(await res.text())
    if (!parsed.ok) { console.warn(`Shared activity configuration ignored: ${parsed.error}`); return null }
    if (localStorage.getItem(APPLIED_KEY) === parsed.config.id) return null
    applyConfig(parsed.config)
    return summarize(parsed.config)
  } catch {
    return null
  }
}
