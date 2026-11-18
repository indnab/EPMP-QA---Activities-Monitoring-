import { Link } from 'react-router-dom'
import { Icon as FbIcon } from '../../../components/Icon'
import type { BuilderDraft, TechnicalCategory, TimelineTemplateEntry, TimelineOffset } from '../../../domain'
import { TECHNICAL_CATEGORIES } from '../../../domain/timelineCatalog'
import { dateOptions } from '../../../domain/wbsTree'
import { useQAStore } from '../../../store/qaStore'

interface Props {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

/**
 * Timeline: which planned date of the activity's milestone each part category is planned against, with the start and
 * end as "date − X days". The milestone and its planned dates come from the archetype's WBS (Governance). Parts of a
 * category that isn't selected follow the milestone date with the section template's offsets.
 */
export function TimelineStep({ draft, onChange }: Props) {
  const archetypes = useQAStore((s) => s.archetypes)
  const arc = archetypes.find((a) => a.id === draft.archetypeId)
  const ms = arc?.wbs.find((o) => o.id === draft.defaultMilestoneId && o.level === 'Milestone')
  const options = ms ? dateOptions(ms) : []
  const template = draft.timelineTemplate ?? []
  const selected = new Set(template.map((t) => t.category))
  // One planned date per category, under this activity's milestone.
  const offsetOf = (entry: TimelineTemplateEntry): TimelineOffset | undefined =>
    entry.offsets.find((o) => o.milestoneId === ms?.id)

  function toggleCategory(cat: TechnicalCategory) {
    if (selected.has(cat)) onChange({ timelineTemplate: template.filter((t) => t.category !== cat) })
    else onChange({ timelineTemplate: [...template, { category: cat, offsets: [] }] })
  }

  function setOffset(cat: TechnicalCategory, patch: Partial<Pick<TimelineOffset, 'subType' | 'minusDays' | 'endMinusDays'>>) {
    if (!ms) return
    onChange({
      timelineTemplate: template.map((t) => {
        if (t.category !== cat) return t
        const cur = offsetOf(t)
        const next: TimelineOffset = {
          milestoneId: ms.id,
          subType: 'subType' in patch ? patch.subType ?? '' : cur?.subType ?? '',
          minusDays: 'minusDays' in patch ? patch.minusDays ?? 0 : cur?.minusDays ?? 0,
          ...(('endMinusDays' in patch ? patch.endMinusDays : cur?.endMinusDays) !== undefined
            ? { endMinusDays: 'endMinusDays' in patch ? patch.endMinusDays : cur?.endMinusDays }
            : {}),
        }
        return { ...t, offsets: [next] }
      }),
    })
  }

  if (!arc || !ms) {
    return (
      <div className="space-y-3">
        <h2 className="m-0 text-lg font-semibold text-[var(--color-text)]">Timeline</h2>
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          This activity isn’t under a milestone in an archetype’s WBS, so it has no planned dates to link to.
          {arc && <> Place it under a milestone in <Link to={`/governance/${arc.id}`} className="font-semibold text-[var(--color-accent)] hover:underline">{arc.name}</Link>.</>}
        </p>
      </div>
    )
  }

  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(Number(v))))
  const numInput = 'h-8 w-16 rounded border border-[var(--color-border)] bg-white px-1.5 text-right text-[11.5px] text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] disabled:opacity-50'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="m-0 text-lg font-semibold text-[var(--color-text)]">Timeline</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          This activity sits under milestone <strong className="text-[var(--color-text)]">{ms.name}</strong>. For each part category, pick which of
          its planned dates the activity is planned against and set the start and end as “date − X days”. Parts of other
          categories follow the {ms.name} date with the section template’s offsets. Planned dates are defined on the
          milestone in <Link to={`/governance/${arc.id}`} className="font-semibold text-[var(--color-accent)] hover:underline">Governance → {arc.name}</Link>.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <span className="mb-2 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Part categories</span>
        <div className="flex flex-wrap gap-2">
          {TECHNICAL_CATEGORIES.map((c) => {
            const on = selected.has(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${on ? 'border-[#bfdbfe] bg-secondary text-primary' : 'border-[var(--color-border)] bg-white text-[#344054] hover:border-[#bfdbfe]'}`}>
                {on ? <FbIcon name="check" size={12} className="mr-1" /> : null}{c.label}
              </button>
            )
          })}
        </div>
      </div>

      {template.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          No category selected: every part follows the {ms.name} date with the section template’s offsets.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[10.5px] font-medium text-[#344054]">
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Planned date</th>
                <th className="px-4 py-2.5">Start</th>
                <th className="px-4 py-2.5">End</th>
              </tr>
            </thead>
            <tbody>
              {template.map((entry) => {
                const off = offsetOf(entry)
                const linked = off ? options.find((o) => o.typeId === (off.subType ?? '')) : undefined
                const stale = !!off && !linked
                const label = linked?.label ?? 'date'
                return (
                  <tr key={entry.category} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 font-medium text-[#101828]">{TECHNICAL_CATEGORIES.find((c) => c.id === entry.category)?.label}</td>
                    <td className="px-4 py-2">
                      <select value={off ? off.subType ?? '' : '__none'} aria-label={`${entry.category} planned date`}
                        onChange={(e) => (e.target.value === '__none'
                          ? onChange({ timelineTemplate: template.map((t) => (t.category === entry.category ? { ...t, offsets: [] } : t)) })
                          : setOffset(entry.category, { subType: e.target.value }))}
                        className={`h-8 min-w-[200px] rounded border bg-white px-2 text-[11.5px] ${stale ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}`}>
                        <option value="__none">Select a planned date…</option>
                        {options.map((o) => <option key={o.typeId || '_own'} value={o.typeId}>{o.label}</option>)}
                        {stale && <option value={off!.subType}>{off!.subType} (removed from milestone)</option>}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-[10.5px] text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-1.5">{label} −
                        <input type="number" min={0} disabled={!off} value={off?.minusDays ?? ''} aria-label={`${entry.category} start days`}
                          onChange={(e) => setOffset(entry.category, { minusDays: num(e.target.value) ?? 0 })} className={numInput} /> d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[10.5px] text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-1.5">{label} −
                        <input type="number" min={0} disabled={!off} value={off?.endMinusDays ?? ''} placeholder="0" aria-label={`${entry.category} end days`}
                          onChange={(e) => setOffset(entry.category, { endMinusDays: num(e.target.value) })} className={numInput} /> d
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
