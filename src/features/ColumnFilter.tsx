/**
 * Multi-select column filter for table headers: a compact button ("All", the one value picked, or "N selected") that
 * opens a list of the column's values with check boxes, Select all and Clear. Nothing ticked = no filter. The list is
 * drawn over the page (fixed position), so a table that scrolls inside its card does not clip it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function ColumnFilter({ label, options, selected, onChange, format = (v) => v, minWidth = 72 }: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  /** How a value is shown (e.g. dates as dd Mon yyyy). */
  format?: (v: string) => string
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null)
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 260 && r.top > 260
    setPos({ left: Math.min(r.left, window.innerWidth - 250), top: up ? r.top - 4 : r.bottom + 4, up })
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (btn.current?.contains(t) || pop.current?.contains(t)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const scroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  const live = selected.filter((v) => options.includes(v))
  const allOn = options.length > 0 && options.every((v) => live.includes(v))
  const toggle = (v: string) => onChange(live.includes(v) ? live.filter((x) => x !== v) : [...live, v])
  const text = live.length === 0 || allOn ? 'All' : live.length === 1 ? format(live[0]) : `${live.length} selected`
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Filter ${label}`}
        title={live.length ? live.map(format).join(', ') : `Filter ${label}`} data-col-filter={label}
        className={`flex h-6 w-full max-w-[220px] items-center justify-between gap-1 rounded border px-1.5 text-left text-[10px] font-normal ${live.length && !allOn ? 'border-[var(--color-accent)] bg-[#eef4ff] font-semibold text-[var(--color-accent)]' : 'border-[var(--color-border)] bg-white text-[#344054]'}`}
        style={{ minWidth }}>
        <span className="min-w-0 truncate">{text}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="flex-none"><path d="M2 3.5 5 6.5 8 3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={pop} role="listbox" aria-multiselectable="true" aria-label={`${label} values`}
          className="fixed z-[80] max-h-60 w-[240px] overflow-auto rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[10.5px] font-normal normal-case tracking-normal text-[#344054] shadow-lg"
          style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
          {options.length === 0 ? <div className="px-2 py-1.5 text-[var(--color-muted)]">No values</div> : (
            <>
              <label className="mb-1 flex cursor-pointer items-center gap-2 rounded border-b border-[var(--color-border)] px-2 py-1 pb-1.5 font-semibold hover:bg-[var(--color-surface)]">
                <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = !allOn && live.length > 0 }} onChange={() => onChange(allOn ? [] : options)} />
                <span>{allOn ? 'Deselect all' : 'Select all'}</span>
              </label>
              {options.map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-surface)]">
                  <input type="checkbox" checked={live.includes(o)} onChange={() => toggle(o)} />
                  <span className="min-w-0 break-words">{format(o)}</span>
                </label>
              ))}
            </>
          )}
          {live.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded px-2 py-1 text-left font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]">Clear</button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
