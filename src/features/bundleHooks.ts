/** Bundling, for screens: which part numbers are main parts with bundled parts (their number is shown in blue). */
import { useMemo } from 'react'
import { MAIN_PART_CLS, bundleMains, mainPartOf } from '../domain/bundling'
import { useQAStore } from '../store/qaStore'

/** (partNo) => the extra class for a main part with bundled parts, or ''. */
export function useMainPartCls(): (partNo: string) => string {
  const parts = useQAStore((s) => s.parts)
  const mains = useMemo(() => bundleMains(parts), [parts])
  return (partNo: string) => (mains.has(partNo) ? MAIN_PART_CLS : '')
}

/**
 * (partNo) => " (n)" after a main part's name: its bundle size, the main part counted as one of its own bundled parts
 * (e.g. a main part with 2 bundled parts shows "(3)"); '' for every other part.
 */
export function useBundleTag(): (partNo: string) => string {
  const parts = useQAStore((s) => s.parts)
  const sizes = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of parts) {
      if (p.supersededBy) continue
      const main = mainPartOf(p)
      if (main) m.set(main, (m.get(main) ?? 1) + 1)
    }
    return m
  }, [parts])
  return (partNo: string) => { const n = sizes.get(partNo); return n ? ` (${n})` : '' }
}
