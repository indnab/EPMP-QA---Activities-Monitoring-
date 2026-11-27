/** Bundling, for screens: which part numbers are main parts with bundled parts (their number is shown in blue). */
import { useMemo } from 'react'
import { MAIN_PART_CLS, bundleMains } from '../domain/bundling'
import { useQAStore } from '../store/qaStore'

/** (partNo) => the extra class for a main part with bundled parts, or ''. */
export function useMainPartCls(): (partNo: string) => string {
  const parts = useQAStore((s) => s.parts)
  const mains = useMemo(() => bundleMains(parts), [parts])
  return (partNo: string) => (mains.has(partNo) ? MAIN_PART_CLS : '')
}
