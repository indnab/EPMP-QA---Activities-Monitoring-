/**
 * Project detail: header, Execution (the archetype's WBS for this project; QA activities roll up from the project's
 * parts and open their forms) and Team (derived — no tagging). The Model Coordinator can close the project.
 */
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Modal, PageHeader, Tabs } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { PROJECT_INITIATOR, PROJECT_MASTER_LABEL, PROJECT_STATUS_LABEL } from '../../domain/projects'
import { buildExecutionRows, deriveTeam } from '../../engine/projectRollup'
import type { ExecutionRyg } from '../../engine/projectRollup'
import { DEMO_TODAY, fmtDate } from '../scope'
import { NoProjectAccess, PROJECT_VIEWERS } from './ProjectsPage'

const RYG_CLS: Record<ExecutionRyg, string> = {
  Red: 'bg-[#ef4444]', Yellow: 'bg-[#f59e0b]', Green: 'bg-[#10b981]', NA: 'bg-[#cbd5e1]',
}

export function ProjectDetailsPage() {
  const { no } = useParams<{ no: string }>()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'team' ? 'team' : 'execution'
  const { projects, archetypes, entries, activities, parts, templateRows, models, picAssignments, closeProject } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [confirmClose, setConfirmClose] = useState(false)
  const project = projects.find((p) => p.no === no)
  const archetype = project ? archetypes.find((a) => a.id === project.archetypeId) : undefined

  const rows = useMemo(
    () => (project && archetype ? buildExecutionRows({ project, archetype, entries, activities, parts, templateRows, models, persona: currentPersona, today: DEMO_TODAY }) : []),
    [project, archetype, entries, activities, parts, templateRows, models, currentPersona]
  )
  const team = useMemo(
    () => (project ? deriveTeam({ project, parts, picAssignments, persona: currentPersona, today: DEMO_TODAY }) : null),
    [project, parts, picAssignments, currentPersona]
  )

  if (!(PROJECT_VIEWERS as readonly string[]).includes(currentPersona)) {
    return (<div><PageHeader title="Project" section="Project Initiation" /><NoProjectAccess /></div>)
  }
  if (!project) {
    return (
      <div className="py-20 text-center text-[var(--color-muted)]">
        <p className="font-medium">Project not found</p>
        <Link to="/projects" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">← Back to Project Initiation</Link>
      </div>
    )
  }

  const isOpen = project.status === 'InExecution'
  const isVehicle = project.master === 'Vehicle'
  const canClose = currentPersona === PROJECT_INITIATOR && isOpen
  const qaRows = rows.filter((r) => r.kind === 'qa')
  const notApproved = qaRows.reduce((n, r) => n + Math.round((r.partsInScope * (100 - r.completionPct)) / 100), 0)

  return (
    <div>
      <PageHeader title={project.no} section="Project Initiation" crumb={`${project.no} · ${project.name}`}
        actions={canClose ? <Button variant="secondary" size="sm" onClick={() => setConfirmClose(true)}>Close project</Button> : undefined} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--color-muted)]">{project.no}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{PROJECT_MASTER_LABEL[project.master]}</span>
            </div>
            <h1 className="m-0 text-[20px] font-semibold text-[#101828]">{project.name}</h1>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              Archetype <strong className="text-[#344054]">{archetype?.name ?? project.archetypeId}</strong> · initiated {fmtDate(project.initiatedAt.slice(0, 10))}
              {project.closedAt && <> · closed {fmtDate(project.closedAt.slice(0, 10))}</>}
            </p>
          </div>
          {isVehicle && (
            <div className="flex flex-wrap gap-2">
              {project.modelNames.map((m) => {
                const mr = models.find((x) => x.name === m)
                return (
                  <div key={m} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px]">
                    <div className="font-semibold text-[#101828]">{m}</div>
                    <div className="text-[var(--color-muted)]">SOP {mr?.mrds.SOP ? fmtDate(mr.mrds.SOP) : '—'}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Tabs className="mb-4" activeId={tab} onChange={(id) => setParams(id === 'execution' ? {} : { tab: id })}
        items={[{ id: 'execution', label: 'Execution', badge: qaRows.length || undefined }, { id: 'team', label: 'Team' }]} />

      {tab === 'execution' && (
        <>
          {!isVehicle && (
            <div className="mb-3 rounded-lg border border-[#bfdbfe] bg-secondary px-4 py-2.5 text-[12px] text-primary">Tracked at project level — no parts.</div>
          )}
          {!isOpen && (
            <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[12px] text-[var(--color-muted)]">This project is closed. Its activities are read-only.</div>
          )}
          {!archetype ? (
            <Card><p className="py-8 text-center text-sm text-[var(--color-muted)]">Archetype not found.</p></Card>
          ) : (
            <Card flush className="!overflow-visible">
              <div className="table-scroll cta-pin">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                      <th className="w-12 px-3 py-2.5">No.</th>
                      <th className="min-w-[260px] px-3 py-2.5">WBS Object</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Dependency</th>
                      {isVehicle && <>
                        <th className="px-3 py-2.5 text-center">Parts</th>
                        <th className="px-3 py-2.5">Complete</th>
                        <th className="px-3 py-2.5 text-center">RYG</th>
                        <th className="px-3 py-2.5 text-center">Delayed</th>
                        <th className="px-3 py-2.5 text-center">NG</th>
                      </>}
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.obj.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                        <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-[#101828]">{r.obj.name}</td>
                        <td className="px-3 py-2.5 text-[#344054]">{r.typeLabel}</td>
                        <td className="max-w-[240px] truncate px-3 py-2.5 text-[11px] text-[var(--color-muted)]" title={r.dependencyLabel}>{r.dependencyLabel || '—'}</td>
                        {isVehicle && (r.kind === 'qa' ? <>
                          <td className="px-3 py-2.5 text-center tabular-nums">{r.partsInScope}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-[var(--color-surface)]"><div className="h-1.5 rounded-full bg-[#10b981]" style={{ width: `${r.completionPct}%` }} /></div>
                              <span className="tabular-nums text-[11px]">{r.completionPct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center"><span className={`inline-block h-2.5 w-2.5 rounded-full ${RYG_CLS[r.ryg]}`} title={r.ryg} /></td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{r.delayed || '—'}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{r.ng || '—'}</td>
                        </> : <td colSpan={5} className="px-3 py-2.5 text-center text-[11px] text-[var(--color-muted)]">Tracked outside QA</td>)}
                        <td className="px-3 py-2.5 text-right">
                          {r.kind === 'qa' && r.links.length > 0 && isOpen ? (
                            <span className="inline-flex flex-wrap justify-end gap-1.5">
                              {r.links.map((l) => (
                                <Link key={l.rowId} to={`/activities/${l.rowId}?project=${project.no}`} title={l.label}
                                  className="inline-flex items-center rounded-[10px] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-105">
                                  {r.links.length > 1 ? l.label : 'Open'}
                                </Link>
                              ))}
                            </span>
                          ) : r.kind === 'qa' ? (
                            <span className="text-[11px] text-[var(--color-muted)]">{!isOpen ? 'Closed' : !isVehicle ? 'Project level' : r.activity?.published === false ? 'Not built yet' : 'No parts'}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'team' && team && (
        isVehicle ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {([['PICs', team.pics], ['Vendors', team.vendors], ['Sections', team.sections.map((s) => ({ name: s.section, parts: s.parts }))]] as const).map(([title, list]) => (
              <Card key={title} flush>
                <div className="border-b border-[var(--color-border)] px-4 py-3 text-[13px] font-semibold text-[#101828]">{title} <span className="font-normal text-[var(--color-muted)]">({list.length})</span></div>
                {list.length === 0 ? <p className="px-4 py-6 text-center text-[12px] text-[var(--color-muted)]">None</p> : (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {list.map((x) => (
                      <li key={x.name} className="flex items-center justify-between px-4 py-2 text-[12px]">
                        <span className="text-[#101828]">{x.name}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">{x.parts} part{x.parts === 1 ? '' : 's'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
            <p className="text-[11px] text-[var(--color-muted)] lg:col-span-3">Derived from the parts — PIC per part (incl. PIC Assignments), vendor and section. No manual tagging; SIC and DPM cover the sections listed.</p>
          </div>
        ) : (
          <Card><p className="py-8 text-center text-sm text-[var(--color-muted)]">A non-vehicle project has no parts, so no part-based team.</p></Card>
        )
      )}

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title={`Close ${project.no}?`} size="sm"
        footer={<>
          <Button variant="secondary" size="md" onClick={() => setConfirmClose(false)}>Cancel</Button>
          <Button variant="danger" size="md" onClick={() => { closeProject(project.no, currentPersona); setConfirmClose(false) }}>Close project</Button>
        </>}>
        <p className="text-sm text-[#344054]">
          The project becomes read-only and its parts leave the work screens. Its models are freed for a new project.
          {notApproved > 0 && <> About <strong>{notApproved}</strong> activity item{notApproved === 1 ? ' is' : 's are'} not yet approved.</>}
        </p>
      </Modal>
    </div>
  )
}
