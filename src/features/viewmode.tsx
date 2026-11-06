/**
 * Card ⇄ Table view preference.
 *
 * A tiny segmented toggle that lets the user switch any "list of items" between the card/tile look and a
 * dense table. The choice is remembered per list (keyed in localStorage) so it survives reloads and tab
 * switches. Use <ViewModeToggle value onChange /> with the useViewMode(key) hook.
 */
import { useCallback, useState } from 'react'
import { Icon } from '../components/Icon'

export type ViewMode = 'card' | 'table'

const STORE_PREFIX = 'qa-viewmode:'

function read(key: string): ViewMode | null {
  try {
    const v = localStorage.getItem(STORE_PREFIX + key)
    return v === 'card' || v === 'table' ? v : null
  } catch {
    return null
  }
}

/** Remembered card/table preference for one list. `key` namespaces the preference. */
export function useViewMode(key: string, fallback: ViewMode = 'card'): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => read(key) ?? fallback)
  const set = useCallback(
    (m: ViewMode) => {
      setMode(m)
      try {
        localStorage.setItem(STORE_PREFIX + key, m)
      } catch {
        /* ignore storage failures (private mode etc.) */
      }
    },
    [key],
  )
  return [mode, set]
}

/** Two-button segmented control: Cards | Table. */
export function ViewModeToggle({
  value,
  onChange,
  size = 'sm',
}: {
  value: ViewMode
  onChange: (m: ViewMode) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'md' ? 'px-2.5 py-1.5' : 'px-2 py-1'
  const btn = (m: ViewMode, icon: string, label: string) => {
    const active = value === m
    return (
      <button
        type="button"
        onClick={() => onChange(m)}
        aria-pressed={active}
        title={`${label} view`}
        data-export-ignore="true"
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition ${pad} ${
          active
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-white text-[#344054] hover:bg-[#fafafa]'
        }`}
      >
        <Icon name={icon as never} size={13} /> {label}
      </button>
    )
  }
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]"
      role="group"
      aria-label="View as cards or table"
    >
      {btn('card', 'grid', 'Cards')}
      <span className="w-px bg-[var(--color-border)]" aria-hidden="true" />
      {btn('table', 'table', 'Table')}
    </div>
  )
}
