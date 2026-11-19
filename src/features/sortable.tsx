/**
 * Drag-to-reorder for page sections and cards. Each list keeps its order (remembered in this browser). An item is
 * only draggable while its grip is held, so text, inputs and buttons inside it work as usual; the grip also moves
 * the item with the arrow keys.
 */
import { useState } from 'react'
import type { DragEvent, KeyboardEvent, ReactNode } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useLayoutStore = create<{ order: Record<string, string[]>; setOrder: (list: string, ids: string[]) => void }>()(
  persist(
    (set) => ({ order: {}, setOrder: (list, ids) => set((s) => ({ order: { ...s.order, [list]: ids } })) }),
    { name: 'qa-tracker-layout', version: 1 }
  )
)

/** Saved order, keeping only known ids; ids not in it (new sections) keep their default place. */
function merged(saved: string[] | undefined, ids: string[]): string[] {
  if (!saved?.length) return ids
  const known = saved.filter((x) => ids.includes(x))
  const out = [...known]
  ids.forEach((id, n) => { if (!out.includes(id)) out.splice(Math.min(n, out.length), 0, id) })
  return out
}

export function useSortable(listKey: string, defaultIds: string[]) {
  const saved = useLayoutStore((s) => s.order[listKey])
  const setOrder = useLayoutStore((s) => s.setOrder)
  const ids = merged(saved, defaultIds)
  const [armed, setArmed] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const move = (from: string, to: string) => {
    if (from === to) return
    const down = ids.indexOf(from) < ids.indexOf(to)
    const list = ids.filter((x) => x !== from)
    list.splice(list.indexOf(to) + (down ? 1 : 0), 0, from)
    setOrder(listKey, list)
  }
  const moveBy = (id: string, delta: number) => {
    const k = ids.indexOf(id) + delta
    if (k < 0 || k >= ids.length) return
    move(id, ids[k])
  }

  /** Props for the item's wrapper. Only drag events that start on this item itself count (not nested lists). */
  const itemProps = (id: string) => ({
    draggable: armed === id,
    onDragStart: (e: DragEvent) => {
      if (e.target !== e.currentTarget) return
      setDragId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    onDragOver: (e: DragEvent) => { if (dragId && dragId !== id) { e.preventDefault(); setOverId(id) } },
    onDrop: (e: DragEvent) => { if (!dragId) return; e.preventDefault(); move(dragId, id); setOverId(null) },
    onDragEnd: (e: DragEvent) => { if (e.target !== e.currentTarget) return; setDragId(null); setOverId(null); setArmed(null) },
    'data-dragging': dragId === id ? 'true' : undefined,
    'data-drop-target': overId === id && dragId !== id ? 'true' : undefined,
  })
  /** Props for the grip button (hold to drag, or arrow keys to move). */
  const gripProps = (id: string, label: string, axis: 'vertical' | 'horizontal' = 'vertical') => ({
    onMouseDown: () => setArmed(id),
    onMouseUp: () => setArmed(null),
    onKeyDown: (e: KeyboardEvent) => {
      const prev = axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
      const next = axis === 'vertical' ? 'ArrowDown' : 'ArrowRight'
      if (e.key === prev) { e.preventDefault(); moveBy(id, -1) }
      if (e.key === next) { e.preventDefault(); moveBy(id, 1) }
    },
    'aria-label': `Move ${label} (drag, or use the arrow keys)`,
    title: 'Drag to move',
  })
  return { ids, itemProps, gripProps, dragId, overId, customized: !!saved?.length, reset: () => setOrder(listKey, []) }
}

/** Classes for a sortable item while dragging / as a drop target. */
export const sortableCls = 'data-[dragging=true]:opacity-40 data-[drop-target=true]:rounded-xl data-[drop-target=true]:outline data-[drop-target=true]:outline-2 data-[drop-target=true]:outline-offset-2 data-[drop-target=true]:outline-[var(--color-primary)]'

/** Six-dot drag grip. */
export function Grip(props: ReturnType<ReturnType<typeof useSortable>['gripProps']> & { className?: string }) {
  const { className = '', ...rest } = props
  return (
    <button type="button" data-export-ignore="true" {...rest}
      className={`inline-flex h-6 w-5 flex-none cursor-grab items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${className}`}>
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="2.5" r="1.3" /><circle cx="7.5" cy="2.5" r="1.3" />
        <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
        <circle cx="2.5" cy="11.5" r="1.3" /><circle cx="7.5" cy="11.5" r="1.3" />
      </svg>
    </button>
  )
}

/**
 * Page sections stacked vertically, in the list's saved order. Each has a grip in the left gutter (shown on hover
 * or keyboard focus) to drag it up or down, or move it with the arrow keys.
 */
export function SortableSections({ sort, sections }: {
  sort: ReturnType<typeof useSortable>
  sections: { id: string; label: string; node: ReactNode }[]
}) {
  const byId = new Map(sections.map((x) => [x.id, x]))
  return (
    <>
      {sort.ids.map((id) => {
        const sec = byId.get(id)
        if (!sec) return null
        return (
          <div key={id} {...sort.itemProps(id)} data-section={id} className={`group/sec relative mb-3 ${sortableCls}`}>
            <Grip {...sort.gripProps(id, sec.label)}
              className="absolute -left-[18px] top-2.5 z-10 opacity-30 transition-opacity group-hover/sec:opacity-100 focus-visible:opacity-100 lg:-left-6" />
            {sec.node}
          </div>
        )
      })}
    </>
  )
}
