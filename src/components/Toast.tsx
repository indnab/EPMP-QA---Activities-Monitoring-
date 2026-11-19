/** Small app-wide notice (bottom right), e.g. "Saved as draft" after a form auto-saves on close. */
import { useEffect } from 'react'
import { create } from 'zustand'
import { Icon } from './Icon'

const useToastStore = create<{ msg: string | null; n: number; show: (m: string) => void; hide: () => void }>()((set) => ({
  msg: null,
  n: 0,
  show: (msg) => set((s) => ({ msg, n: s.n + 1 })),
  hide: () => set({ msg: null }),
}))

/** Show a notice for a few seconds. */
export const toast = (msg: string) => useToastStore.getState().show(msg)

export function Toaster() {
  const { msg, n, hide } = useToastStore()
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(hide, 4000)
    return () => clearTimeout(t)
  }, [msg, n, hide])
  if (!msg) return null
  return (
    <div role="status" aria-live="polite"
      className="fixed bottom-5 right-5 z-[80] flex max-w-sm items-start gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-[11.5px] text-[#101828] shadow-lg">
      <Icon name="check-circle" size={15} className="mt-px flex-none text-emerald-600" />
      <span className="min-w-0 flex-1">{msg}</span>
      <button type="button" onClick={hide} aria-label="Dismiss" className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><Icon name="close" size={13} /></button>
    </div>
  )
}
