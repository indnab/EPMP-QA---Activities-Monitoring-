/**
 * Trial (milestone) names for display. Template rows and entries store the milestone id; milestones added in the
 * WBS editor get generated ids (e.g. "ms-mwiw1k83oa4"), so screens must show the milestone's name, never the id.
 */
import { useQAStore } from '../store/qaStore'

/** Name of a trial (milestone) id; falls back to the id for unknown ones. Not reactive: for strings in handlers / memos. */
export function trialLabelOf(id: string | undefined): string {
  if (!id) return ''
  return useQAStore.getState().milestones.find((m) => m.id === id)?.label ?? id
}

/** Reactive version for components. */
export function useTrialLabel(): (id: string | undefined) => string {
  const milestones = useQAStore((s) => s.milestones)
  return (id) => (id ? milestones.find((m) => m.id === id)?.label ?? id : '')
}

/** Inline trial name, for JSX. */
export function TrialName({ id }: { id: string | undefined }) {
  return <>{useTrialLabel()(id)}</>
}
