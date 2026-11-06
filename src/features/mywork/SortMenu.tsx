/**
 * Shared sort control for the worklist/insights lists.
 *
 * A small dropdown of sortable fields plus an asc/desc toggle, so sorting works the same in both the card
 * and table views (the table's clickable headers stay in sync with this via the same state). Matches the
 * MultiSelect filter look for a consistent toolbar.
 */
import { useEffect, useRef, useState } from 'react'
import { Icon as FbIcon } from '../../components/Icon'

export type SortDir = 'asc' | 'desc'

export interface SortOption<K extends string = string> {
  key: K
  label: string
}

export function SortMenu<K extends string>({
  options,
  sortKey,
  sortDir,
  onChange,
}: {
  options: SortOption<K>[]
  sortKey: K
  sortDir: SortDir
  onChange: (key: K, dir: SortDir) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const active = options.find((o) => o.key === sortKey)
  return (
    <div ref={ref} className="relative" data-export-ignore="true">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Sort"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] font-medium text-[#344054] hover:bg-[#fafafa]"
      >
        <FbIcon name="caret-sort" size={13} />
        <span className="whitespace-nowrap">Sort: {active?.label ?? '—'}</span>
        <FbIcon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} className="text-[var(--color-accent)]" />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 z-30 mt-1 max-h-72 min-w-[190px] overflow-auto rounded-lg border border-[var(--color-border)] bg-white p-1.5 shadow-lg">
          {options.map((o) => {
            const isActive = o.key === sortKey
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => onChange(o.key, isActive ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc')}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface)] ${
                  isActive ? 'font-semibold text-[var(--color-accent)]' : 'text-[#344054]'
                }`}
              >
                <span>{o.label}</span>
                {isActive && <FbIcon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} />}
              </button>
            )
          })}
          <div className="mt-1 border-t border-[var(--color-border)] pt-1">
            <button
              type="button"
              onClick={() => onChange(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]"
            >
              <FbIcon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} />
              {sortDir === 'asc' ? 'Ascending' : 'Descending'} (toggle)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
