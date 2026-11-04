import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ActivityDefinition } from '../../domain'
import { getMilestoneMrd } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { RygDot, StatusPill } from '../../components'
import type { StatusValue } from '../../components/StatusPill'
import { listCellTexts, listColumnFields } from '../listColumns'
import { toRygStatus } from '../scope'
import { usePersonaStore } from '../../store/personaStore'

const LIMIT = 25

const STATUS_PILL: Record<string, StatusValue> = {
  NotStarted: 'NotStarted',
  Draft: 'Draft',
  Submitted: 'Submitted',
  'Sent back': 'SentBack',
  Approved: 'Approved'
}

interface DrillPartsListProps {
  /** The instances matching the current filters, already limited to what the persona may see. */
  instances: FilteredInstance[]
  /** The dashboard's activity; undefined on the Overview (standard columns only). */
  activity?: ActivityDefinition
}

/**
 * "View parts": the parts behind the filtered charts, one row per part x activity, each linking to that part's form
 * in the Workspace. On an activity dashboard it adds the columns the Admin ticked as "Drill-down" in the Builder.
 */
export function DrillPartsList({ instances, activity }: DrillPartsListProps) {
  const [showAll, setShowAll] = useState(false)
  const currentPersona = usePersonaStore((st) => st.currentPersona)
  const fields = activity ? listColumnFields(activity, 'drill', currentPersona) : []
  const shown = showAll ? instances : instances.slice(0, LIMIT)
  const th = 'text-left px-3 py-2 font-medium text-[var(--color-muted)] whitespace-nowrap'

  return (
    <div className="epmp-card mb-4 overflow-hidden" data-tour="drill-parts">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <span className="text-xs font-bold text-[var(--color-text)]">
          View parts <span className="font-normal text-[var(--color-muted)]">· {instances.length} {instances.length === 1 ? 'match' : 'matches'}</span>
        </span>
        {instances.length > LIMIT && (
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-[var(--color-accent)] hover:underline">
            {showAll ? `Show first ${LIMIT}` : `Show all ${instances.length}`}
          </button>
        )}
      </div>
      {instances.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No parts match these filters.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className={th}>Part No.</th>
                <th className={th}>Part Name</th>
                {!activity && <th className={th}>Activity</th>}
                <th className={th}>Milestone</th>
                <th className={th}>Section</th>
                <th className={th}>Model</th>
                <th className={th}>Dept</th>
                {fields.map((f) => (
                  <th key={f.key} className={th}>{f.label}</th>
                ))}
                <th className={th}>Status</th>
                <th className={th}>RYG</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const texts = listCellTexts(d.activity, fields, d.entry, d.part, getMilestoneMrd(d.model, d.row.milestoneId))
                const href = `/activities/${d.row.id}?part=${encodeURIComponent(d.part.partNo)}`
                return (
                  <tr key={`${d.row.id}-${d.part.partNo}`} className="border-b border-[var(--color-border)] hover:bg-secondary/40">
                    <td className="px-3 py-2 font-mono">{d.part.partNo}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate" title={d.part.partName}>{d.part.partName}</td>
                    {!activity && <td className="px-3 py-2 max-w-[160px] truncate" title={d.activity.name}>{d.activity.name}</td>}
                    <td className="px-3 py-2 text-[var(--color-muted)]">{d.row.milestoneId}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{d.row.section}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{d.part.model}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{d.part.department}</td>
                    {texts.map((text, k) => (
                      <td key={fields[k].key} className="px-3 py-2 text-[var(--color-muted)] max-w-[160px] truncate" title={text}>{text}</td>
                    ))}
                    <td className="px-3 py-2">
                      {d.notApplicable ? (
                        <span className="text-[10px] text-[var(--color-muted)]">Not applicable</span>
                      ) : (
                        <StatusPill status={STATUS_PILL[d.status] ?? 'Draft'} size="sm" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {d.notApplicable ? <span className="text-[var(--color-muted)]">—</span> : <RygDot status={toRygStatus(d.ryg)} size={10} />}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link to={href} className="text-[var(--color-accent)] hover:underline">Open →</Link>
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
