/**
 * MRD date inputs for one model: own-date milestones (SOP and the optional ones) plus PP / MPP / Pilot sub-type dates,
 * with the non-blocking "out of order" warning. Shared by Models & MRDs and Project Initiation.
 */
import { useMemo } from 'react'
import type { MilestoneDef } from '../../domain'
import { TIMELINE_MILESTONES, SUBTYPE_LABEL, subTypesFor, subTypeMrdKey } from '../../domain/timelineCatalog'
import { findOutOfOrderMilestones } from '../../domain/mrds'

export interface MrdEditorProps {
  milestones: MilestoneDef[]
  mrds: Record<string, string>
  onChange: (next: Record<string, string>) => void
  /** milestone/sub-type key → message */
  errors?: Record<string, string>
  /** Unique prefix for input ids when several editors are on one page. */
  idPrefix?: string
}

export function MrdEditor({ milestones, mrds, onChange, errors = {}, idPrefix = 'mrd' }: MrdEditorProps) {
  const outOfOrder = useMemo(() => findOutOfOrderMilestones(milestones, mrds), [milestones, mrds])
  const setMrd = (key: string, val: string) => {
    const next = { ...mrds }
    if (val) next[key] = val
    else delete next[key]
    onChange(next)
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
            Dates appear out of chronological order for milestone(s): <strong>{[...outOfOrder].join(', ')}</strong>. Save is
            still allowed — verify before proceeding.
          </span>
        </div>
      )}

      <p className="mb-3 text-[11px] text-[var(--color-muted)]">
        SOP is required (<span className="text-[var(--color-destructive)]">*</span>). PP, MPP and Pilot have no single date —
        set their dates under the sub-types below. Other milestones may be left blank — activities for those show
        "Awaiting MRD".
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {milestones.filter((m) => !TIMELINE_MILESTONES.includes(m.id)).map((m) => (
          <div key={m.id}>
            <label htmlFor={`${idPrefix}-${m.id}`} className="mb-1 block text-xs font-medium text-[var(--color-text)]">
              {m.label}
              {m.mandatory && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
            </label>
            <input
              id={`${idPrefix}-${m.id}`}
              type="date"
              value={mrds[m.id] ?? ''}
              onChange={(e) => setMrd(m.id, e.target.value)}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]
                ${errors[m.id] ? 'border-[var(--color-destructive)]' : outOfOrder.has(m.id) ? 'border-[#f59e0b]' : 'border-[var(--color-border)]'}`}
            />
            {errors[m.id] && <p className="mt-1 text-[11px] text-[var(--color-destructive)]">{errors[m.id]}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-[var(--color-border)] pt-4">
        <p className="mb-3 text-[11px] text-[var(--color-muted)]">
          Sub-type MRD dates per milestone. All sub-types are shown (Kani / Jig apply to Weld parts). Leave blank where not
          applicable — blanks show as “Awaiting MRD”.
        </p>
        <div className="space-y-4">
          {TIMELINE_MILESTONES.map((ms) => (
            <div key={ms}>
              <div className="mb-1.5 text-[11px] font-semibold text-primary">{ms} sub-types</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subTypesFor(ms, null).map((st) => {
                  const key = subTypeMrdKey(ms, st)
                  return (
                    <div key={key}>
                      <label htmlFor={`${idPrefix}-${key}`} className="mb-1 block text-[11px] font-medium text-[var(--color-text)]">{SUBTYPE_LABEL[st]}</label>
                      <input
                        id={`${idPrefix}-${key}`}
                        type="date"
                        value={mrds[key] ?? ''}
                        onChange={(e) => setMrd(key, e.target.value)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
