import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { partInScope } from '../scope'

interface Hit {
  group: 'Pages' | 'Activities' | 'Parts'
  label: string
  sub: string
  to: string
}

/** Header search: pages, activities and parts the current role can see. */
export function HeaderSearch({ pages }: { pages: { to: string; label: string }[] }) {
  const { activities, templateRows, parts } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out: Hit[] = []
    for (const p of pages) if (p.label.toLowerCase().includes(term)) out.push({ group: 'Pages', label: p.label, sub: 'Open page', to: p.to })
    for (const a of activities) {
      if (!a.name.toLowerCase().includes(term)) continue
      const row = templateRows.find((r) => r.activityId === a.id)
      if (row) out.push({ group: 'Activities', label: a.name, sub: `${row.milestoneId} · activity`, to: `/activities/${row.id}` })
    }
    const canWorkspace = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'
    for (const p of parts) {
      if (p.supersededBy || !partInScope(p, currentPersona)) continue
      if (!`${p.partNo} ${p.partName} ${p.vendorName} ${p.model}`.toLowerCase().includes(term)) continue
      out.push({
        group: 'Parts', label: `${p.partName} · ${p.partNo}`, sub: `${p.model} · ${p.vendorName}`,
        to: canWorkspace ? `/part-workspace?part=${encodeURIComponent(p.partNo)}` : currentPersona === 'Vendor' ? '/mywork' : '/parts'
      })
    }
    return out.slice(0, 12)
  }, [q, pages, activities, templateRows, parts, currentPersona])

  const go = (to: string) => {
    setOpen(false)
    setQ('')
    navigate(to)
  }
  return (
    <div ref={ref} className="relative w-full max-w-[420px]">
      <div className="flex h-11 items-center gap-2.5 rounded-full border border-white bg-white/80 px-4 shadow-[0_4px_14px_rgba(80,90,160,.10)] backdrop-blur focus-within:ring-2 focus-within:ring-[#bfdbfe]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && hits[0]) go(hits[0].to)
          }}
          placeholder="Search anything to begin…"
          aria-label="Search pages, activities and parts"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--color-text)] placeholder-[var(--color-muted)] focus:outline-none"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[50px] z-50 max-h-[360px] overflow-auto rounded-2xl border border-[var(--color-border)] bg-white p-1.5 shadow-xl" role="listbox">
          {hits.length === 0 ? (
            <p className="m-0 px-3 py-3 text-[12px] text-[var(--color-muted)]">No pages, activities or parts match “{q.trim()}”.</p>
          ) : (
            hits.map((h, i) => (
              <div key={h.to + h.label + i}>
                {(i === 0 || hits[i - 1].group !== h.group) && (
                  <p className="m-0 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{h.group}</p>
                )}
                <button
                  role="option"
                  aria-selected={false}
                  onClick={() => go(h.to)}
                  className="flex w-full flex-col rounded-lg px-3 py-1.5 text-left hover:bg-[var(--color-secondary)] focus:bg-[var(--color-secondary)] focus:outline-none"
                >
                  <span className="truncate text-[12.5px] font-medium text-[var(--color-text)]">{h.label}</span>
                  <span className="truncate text-[10.5px] text-[var(--color-muted)]">{h.sub}</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
