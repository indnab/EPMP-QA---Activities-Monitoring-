/**
 * THE work-screen gate: parts whose model belongs to a project In Execution. Use this instead of the store's raw
 * `parts` on every work screen (My Work, Activities, Bulk Entry, dashboards …). Master screens (Part Intake,
 * Models & MRDs, PIC Assignments) keep using raw parts so parts can be set up before a project exists.
 */
import { useMemo } from 'react'
import { useQAStore } from '../store/qaStore'
import { gateParts } from '../domain/projects'
import type { PartRecord } from '../domain'

export function useWorkParts(): PartRecord[] {
  const parts = useQAStore((s) => s.parts)
  const projects = useQAStore((s) => s.projects)
  return useMemo(() => gateParts(parts, projects), [parts, projects])
}
