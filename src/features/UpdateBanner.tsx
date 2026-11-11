/**
 * "A newer version is live" banner.
 *
 * GitHub Pages caches index.html for ~10 minutes, so after a deploy an open tab keeps running the old build. In a
 * production build this checks version.json (no-store) on load, every minute and whenever the tab regains focus;
 * if the deployed build id differs from the one this tab is running, it offers a one-click reload.
 */
import { useEffect, useState } from 'react'

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

export function UpdateBanner() {
  const [newer, setNewer] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD) return // the dev server hot-reloads; nothing to check
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { id } = (await res.json()) as { id?: string }
        if (!stopped && id && id !== BUILD_ID) setNewer(id)
      } catch {
        /* offline or blocked — try again later */
      }
    }
    check()
    const timer = window.setInterval(check, 60_000)
    const onFocus = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onFocus) }
  }, [])

  if (!newer) return null
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#bfdbfe] bg-white px-4 py-2.5 text-[12px] text-[var(--color-text)] shadow-[0_10px_30px_rgba(2,6,23,.18)]">
      <span>A newer version of the app is live.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-[10px] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-105"
      >
        Reload
      </button>
    </div>
  )
}
