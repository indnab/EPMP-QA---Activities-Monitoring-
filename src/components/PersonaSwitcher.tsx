import { useState, useRef, useEffect } from 'react'
import { PERSONAS, usePersonaStore } from '../store/personaStore'

/** Initials for the avatar disc, e.g. "Division Model Coordinator" -> "DM", "PIC" -> "PI". */
function initials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : label.slice(0, 2)).toUpperCase().slice(0, 2)
}

/**
 * EPMP-style user block: gradient avatar + role, with a persona menu.
 * (In EPMP the user is fixed; here it doubles as the persona switcher.)
 */
export function PersonaSwitcher() {
  const { currentPersona, setPersona } = usePersonaStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = PERSONAS.find((p) => p.id === currentPersona)!

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Viewing as ${current.label}. Switch persona`}
      >
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-semibold text-white"
          style={{ background: 'linear-gradient(120deg,#2266f5,#3c39cb)' }}
        >
          {initials(current.label)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-5 text-[var(--color-text)]">{current.label}</span>
          <span className="block text-xs text-[var(--color-muted)]">Viewing as</span>
        </span>
        <svg className="hidden text-[#9ca3af] sm:block" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-[60] w-[260px] rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-[0_16px_40px_rgba(2,6,23,.16)]"
          role="listbox"
        >
          <p className="px-2.5 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[.06em] text-[var(--color-muted)]">
            Switch persona
          </p>
          {PERSONAS.map((p) => {
            const active = p.id === currentPersona
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={active}
                onClick={() => { setPersona(p.id); setOpen(false) }}
                className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface)] ${
                  active ? 'bg-[var(--color-secondary)]' : ''
                }`}
              >
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: p.hex }}
                >
                  {initials(p.label)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-semibold text-[var(--color-text)]">{p.label}</span>
                </span>
                {active && (
                  <svg className="ml-auto flex-none text-[var(--color-primary)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
