/**
 * Planned-date (MRD) inputs for one model, as the archetype defines them: per milestone, its own date plus the MRD
 * types the Admin added (Governance → archetype WBS). Shows the non-blocking "out of order" warning on milestone
 * dates. Shared by Models & MRDs and Project Initiation.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ProjectArchetype } from '../../domain'
import { findOutOfOrderMilestones } from '../../domain/mrds'
import { deriveMilestones, plannedDateFields } from '../../domain/wbsTree'

export interface MrdEditorProps {
  archetype: ProjectArchetype | undefined
  mrds: Record<string, string>
  onChange: (next: Record<string, string>) => void
  /** planned-date key → message */
  errors?: Record<string, string>
  /** Unique prefix for input ids when several editors are on one page. */
  idPrefix?: string
}

export function MrdEditor({ archetype, mrds, onChange, errors = {}, idPrefix = 'mrd' }: MrdEditorProps) {
  const fields = useMemo(() => plannedDateFields(archetype), [archetype])
  const msList = useMemo(() => (archetype ? deriveMilestones([archetype]) : []), [archetype])
  const outOfOrder = useMemo(() => findOutOfOrderMilestones(msList, mrds), [msList, mrds])
  const groups = useMemo(() => {
    const out: { id: string; name: string; fields: typeof fields }[] = []
    for (const f of fields) {
      const g = out.find((x) => x.id === f.milestoneId)
      if (g) g.fields.push(f)
      else out.push({ id: f.milestoneId, name: f.milestoneName, fields: [f] })
    }
    return out
  }, [fields])
  const setMrd = (key: string, val: string) => {
    const next = { ...mrds }
    if (val) next[key] = val
    else delete next[key]
    onChange(next)
  }

  if (!archetype) {
    return <p className="text-[10.5px] text-[var(--color-muted)]">Select the project archetype to see the planned dates it needs.</p>
  }
  if (fields.length === 0) {
    return (
      <p className="text-[10.5px] text-[var(--color-muted)]">
        <strong>{archetype.name}</strong> has no milestones yet. Add them in{' '}
        <Link to={`/governance/${archetype.id}`} className="font-semibold text-[var(--color-accent)] hover:underline">Governance</Link>.
      </p>
    )
  }

  return (
    <div>
      {outOfOrder.size > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-xs text-[#92400e]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Milestone dates appear out of order: <strong>{msList.filter((m) => outOfOrder.has(m.id)).map((m) => m.label).join(', ')}</strong>. Save is
            still allowed — verify before proceeding.
          </span>
        </div>
      )}
      <p className="mb-3 text-[10.5px] text-[var(--color-muted)]">
        Planned dates from the <strong>{archetype.name}</strong> milestones. Required dates are marked
        <span className="text-[var(--color-destructive)]"> *</span>; blank dates show “Awaiting MRD” on the activities linked to them.
      </p>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 text-[10.5px] font-semibold text-primary">{g.name}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.fields.map((f) => {
                const id = `${idPrefix}-${f.key.replace(/[^\w-]/g, '_')}`
                return (
                  <div key={f.key}>
                    <label htmlFor={id} className="mb-1 block text-[10.5px] font-medium text-[var(--color-text)]">
                      {f.label}{f.required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
                    </label>
                    <input
                      id={id}
                      type="date"
                      value={mrds[f.key] ?? ''}
                      onChange={(e) => setMrd(f.key, e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
                        ${errors[f.key] ? 'border-[var(--color-destructive)]' : outOfOrder.has(f.key) ? 'border-[#f59e0b]' : 'border-[var(--color-border)]'}`}
                    />
                    {errors[f.key] && <p className="mt-1 text-[10.5px] text-[var(--color-destructive)]">{errors[f.key]}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
