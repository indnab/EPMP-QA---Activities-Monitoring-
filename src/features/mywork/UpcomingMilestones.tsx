/**
 * "Next 30 Days · N upcoming milestones" pill on My Work. It lists the planned dates (a milestone's own date or one
 * of its MRD types) of the user's models that fall in the next 30 days. Picking one filters the page to that model
 * and trial (milestone); picking it again clears the filter.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon as FbIcon } from '../../components/Icon'
import { projectOfModel } from '../../domain/projects'
import { plannedDateFields } from '../../domain/wbsTree'
import { useQAStore } from '../../store/qaStore'
import { DEMO_TODAY, fmtDate } from '../scope'
import { QUICK_DAYS } from './quickRange'

const dayMs = 86_400_000
const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs)

interface Upcoming { key: string; model: string; milestoneId: string; label: string; date: string; days: number }

export function UpcomingMilestones({ models: modelNames, selModel, selMilestone, onPick }: {
  /** Models in the user's scope. */
  models: string[]
  selModel: string[]
  selMilestone: string[]
  /** Apply (or, with null, clear) the model + trial filter. */
  onPick: (pick: { model: string; milestoneId: string } | null) => void
}) {
  const { models, projects, archetypes, milestones } = useQAStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  const items = useMemo<Upcoming[]>(() => {
    const out: Upcoming[] = []
    for (const name of modelNames) {
      const m = models.find((x) => x.name === name)
      if (!m) continue
      const arc = archetypes.find((a) => a.id === projectOfModel(name, projects)?.archetypeId)
      const fields = plannedDateFields(arc)
      for (const [k, date] of Object.entries(m.mrds)) {
        const days = date ? daysFrom(DEMO_TODAY, date) : -1
        if (days < 0 || days > QUICK_DAYS) continue
        const f = fields.find((x) => x.key === k)
        const msId = f?.milestoneId ?? k.split(':')[0]
        // Only real trial milestones (so picking one always filters to something).
        if (!milestones.some((x) => x.id === msId)) continue
        const msName = f?.milestoneName ?? msId
        const label = f && f.typeId ? `${msName} ${f.label}` : `${msName} MRD`
        out.push({ key: `${name}|${k}`, model: name, milestoneId: msId, label, date, days })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model))
  }, [modelNames, models, projects, archetypes, milestones])
  const modelCount = new Set(items.map((i) => i.model)).size
  const isOn = (u: Upcoming) => selModel.length === 1 && selModel[0] === u.model && selMilestone.length === 1 && selMilestone[0] === u.milestoneId
  const active = items.find(isOn)

  return (
    <div ref={ref} className="relative" data-export-ignore="true">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        title="Planned dates (milestones and MRDs) in the next 30 days. Pick one to filter by it."
        className="relative inline-flex h-9 items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#047857] via-[#059669] to-[#34d399] px-3.5 text-white shadow-[0_3px_8px_rgba(5,150,105,.35)] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6ee7b7]">
        <FbIcon name="calendar-month" size={15} />
        <span className="text-[11.5px] font-bold">Next {QUICK_DAYS} Days</span>
        <span className="h-4 w-px bg-white/40" aria-hidden="true" />
        <span className="text-[11px]">{active ? `${active.model} · ${active.label}` : `${items.length} upcoming milestone${items.length === 1 ? '' : 's'}`}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Upcoming milestones"
          className="absolute right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-2xl">
          <div className="flex items-start gap-2.5 bg-gradient-to-r from-[#047857] via-[#059669] to-[#34d399] px-4 py-3 text-white">
            <FbIcon name="calendar-month" size={16} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">Upcoming Milestones</div>
              <div className="text-[10.5px] text-white/90">Next {QUICK_DAYS} days · {items.length} milestone{items.length === 1 ? '' : 's'} across {modelCount} model{modelCount === 1 ? '' : 's'}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 hover:bg-white/30"><FbIcon name="close" size={14} /></button>
          </div>
          {active && (
            <button type="button" onClick={() => { onPick(null); setOpen(false) }}
              className="flex w-full items-center gap-1.5 border-b border-[var(--color-border)] px-4 py-2 text-left text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
              <FbIcon name="close" size={11} /> Clear milestone filter ({active.model} · {active.label})
            </button>
          )}
          <ul className="max-h-[420px] divide-y divide-[var(--color-border)] overflow-y-auto px-2 py-1">
            {items.map((u) => {
              const on = isOn(u)
              return (
                <li key={u.key}>
                  <button type="button" aria-pressed={on}
                    onClick={() => { onPick(on ? null : { model: u.model, milestoneId: u.milestoneId }); setOpen(false) }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left ${on ? 'bg-[#ecfdf5] ring-1 ring-[#6ee7b7]' : 'hover:bg-[var(--color-surface)]'}`}>
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 border-[#059669]">
                      <span className="h-2.5 w-2.5 rounded-[3px] border-2 border-[#059669]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-[#101828]">{u.model} · {u.label}</span>
                      <span className="block text-[10.5px] text-[var(--color-muted)]">{fmtDate(u.date)}</span>
                    </span>
                    <span className="flex-none whitespace-nowrap rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[10.5px] font-semibold text-[#047857]">
                      {u.days === 0 ? 'Today' : `${u.days} day${u.days === 1 ? '' : 's'} to go`}
                    </span>
                  </button>
                </li>
              )
            })}
            {items.length === 0 && <li className="px-2 py-8 text-center text-[11.5px] text-[var(--color-muted)]">No milestones in the next {QUICK_DAYS} days.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
