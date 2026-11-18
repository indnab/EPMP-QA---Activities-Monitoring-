/** Collapsible page sections: a chevron button in the section header; the open/closed state is remembered per section. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon } from '../components/Icon'

const useCollapseStore = create<{ closed: Record<string, boolean>; toggle: (id: string) => void }>()(
  persist(
    (set) => ({ closed: {}, toggle: (id) => set((s) => ({ closed: { ...s.closed, [id]: !s.closed[id] } })) }),
    { name: 'qa-tracker-collapsed', version: 1 }
  )
)

/** [collapsed, toggle] for one section id. */
export function useCollapsed(id: string): [boolean, () => void] {
  const closed = useCollapseStore((s) => !!s.closed[id])
  const toggle = useCollapseStore((s) => s.toggle)
  return [closed, () => toggle(id)]
}

export function CollapseButton({ collapsed, onToggle, label }: { collapsed: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
      title={collapsed ? 'Expand' : 'Collapse'} data-export-ignore="true"
      className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]">
      <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} />
    </button>
  )
}
