/**
 * Project Initiation → project list. The Division Model Coordinator initiates projects; Admin, DPM and SIC view.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, PageHeader } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { PROJECT_INITIATOR, PROJECT_MASTER_LABEL, PROJECT_STATUS_LABEL, projectParts } from '../../domain/projects'
import type { ProjectStatus } from '../../domain/projects'
import { fmtDate } from '../scope'

export const PROJECT_VIEWERS = ['ModelCoordinator', 'Admin', 'DPM', 'SIC'] as const

export function NoProjectAccess() {
  return (
    <Card>
      <p className="py-10 text-center text-sm text-[var(--color-muted)]">
        Projects are available to the Division Model Coordinator, Admin, DPM and SIC. Switch persona to see them.
      </p>
    </Card>
  )
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, archetypes, parts } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canInitiate = currentPersona === PROJECT_INITIATOR
  const canView = (PROJECT_VIEWERS as readonly string[]).includes(currentPersona)
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')

  const rows = useMemo(
    () => [...projects].reverse().filter((p) => status === 'all' || p.status === status),
    [projects, status]
  )

  if (!canView) return (<div><PageHeader title="Project Initiation" section="Project" /><NoProjectAccess /></div>)

  return (
    <div>
      <PageHeader
        title="Project Initiation"
        section="Project"
        actions={
          <>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'all' | ProjectStatus)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px] text-[#344054]">
              <option value="all">All projects</option>
              <option value="InExecution">In Execution</option>
              <option value="Closed">Closed</option>
            </select>
            {canInitiate && <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>+ Initiate Project</Button>}
          </>
        }
      />
      {!canInitiate && (
        <p className="mb-3 text-[11px] text-[var(--color-muted)]">Read-only · projects are initiated by the Division Model Coordinator.</p>
      )}
      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                <th className="px-4 py-3">Project No.</th>
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3">Archetype</th>
                <th className="px-4 py-3">Project Master</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-center">Parts</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Initiated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">No projects yet.{canInitiate ? ' Click “+ Initiate Project”.' : ''}</td></tr>
              ) : rows.map((p) => (
                <tr key={p.no} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40" onClick={() => navigate(`/projects/${p.no}`)}>
                  <td className="px-4 py-2.5"><Link to={`/projects/${p.no}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[11px] font-semibold text-[var(--color-accent)] underline">{p.no}</Link></td>
                  <td className="px-4 py-2.5 font-medium text-[#101828]">{p.name}</td>
                  <td className="px-4 py-2.5 text-[#344054]">{archetypes.find((a) => a.id === p.archetypeId)?.name ?? p.archetypeId}</td>
                  <td className="px-4 py-2.5">{PROJECT_MASTER_LABEL[p.master]}</td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-[#344054]" title={p.modelNames.join(', ')}>{p.modelNames.join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{p.master === 'Vehicle' ? projectParts(p, parts).length : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${p.status === 'InExecution' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-muted)]">{fmtDate(p.initiatedAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
