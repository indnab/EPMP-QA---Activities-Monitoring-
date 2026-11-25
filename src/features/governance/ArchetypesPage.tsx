/**
 * Governance → Manage Archetypes. Admin maintains project archetypes (reusable WBS templates). Each archetype's QA
 * WBS objects become activities in the Activity Builder. "Projects associated" = projects initiated from it.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader, Card, Button, Modal } from '../../components'
import { Icon } from '../../components/Icon'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { isBuildable } from '../../domain'
import { DownloadMenu } from '../export/DownloadMenu'
import { ExportSection } from '../export/ExportSection'

type ActiveFilter = 'all' | 'active' | 'inactive'

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-none items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[var(--color-primary)]' : 'bg-[#cbd5e1]'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function ArchetypesPage({ embedded }: { embedded?: boolean } = {}) {
  const { archetypes, projects, activities, setArchetypeActive, deleteArchetype } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ActiveFilter>('all')
  const [toDelete, setToDelete] = useState<{ id: string; name: string; projects: number } | null>(null)
  const [error, setError] = useState('')

  const rows = useMemo(
    () =>
      archetypes
        .filter((a) => filter === 'all' || (filter === 'active' ? a.active : !a.active))
        .map((a) => {
          const qa = a.wbs.filter((o) => isBuildable(o))
          const configured = qa.filter((o) => activities.some((x) => x.id === o.activityId && x.published !== false && !x.retired)).length
          return { a, projects: projects.filter((p) => p.archetypeId === a.id).length, objects: a.wbs.length, qa: qa.length, configured }
        }),
    [archetypes, projects, activities, filter]
  )

  return (
    <div>
      {embedded ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <>
            <label className="sr-only" htmlFor="arc-filter">Show</label>
            <select id="arc-filter" value={filter} onChange={(e) => setFilter(e.target.value as ActiveFilter)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10.5px] text-[#344054]">
              <option value="all">All archetypes</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <DownloadMenu title="Manage Archetypes" />
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => navigate('/governance/new')}>+ Add</Button>
            )}
          </>
        </div>
      ) : (
        <PageHeader
          title="Manage Archetypes"
          section="Governance"
          actions={
          <>
            <label className="sr-only" htmlFor="arc-filter">Show</label>
            <select id="arc-filter" value={filter} onChange={(e) => setFilter(e.target.value as ActiveFilter)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10.5px] text-[#344054]">
              <option value="all">All archetypes</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <DownloadMenu title="Manage Archetypes" />
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => navigate('/governance/new')}>+ Add</Button>
            )}
          </>
          }
        />
      )}

      <ExportSection id="arc-list" label="Project archetypes">
        <Card flush className="!overflow-visible">
          <div className="table-scroll cta-pin">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[10.5px] font-medium text-[#344054]">
                  <th className="px-4 py-3">Archetype ID</th>
                  <th className="px-4 py-3">Project Archetype</th>
                  <th className="px-4 py-3 text-center">Number of Projects Associated</th>
                  <th className="px-4 py-3 text-center">WBS Objects</th>
                  <th className="px-4 py-3 text-center">QA Activities (configured)</th>
                  <th className="px-4 py-3 text-center">Active</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-muted)]">No archetypes yet.{isAdmin ? ' Click “+ Add” to create one.' : ''}</td></tr>
                ) : rows.map(({ a, projects, objects, qa, configured }) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/governance/${a.id}`} className="font-mono text-[10.5px] font-semibold text-[var(--color-accent)] underline">{a.id}</Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[#101828]">{a.name}</div>
                      {a.description && <div className="max-w-[420px] truncate text-[10.5px] text-[var(--color-muted)]" title={a.description}>{a.description}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{projects}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{objects}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{qa} <span className="text-[var(--color-muted)]">({configured})</span></td>
                    <td className="px-4 py-2.5 text-center" data-export-ignore="true">
                      <span className="inline-flex justify-center">
                        <Switch checked={a.active} disabled={!isAdmin} label={`${a.name} active`} onChange={(v) => setArchetypeActive(a.id, v)} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button type="button" onClick={() => navigate(`/governance/${a.id}`)} title={isAdmin ? 'Edit archetype' : 'View archetype'}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
                        <Icon name={isAdmin ? 'pen' : 'eye'} size={15} />
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => { setError(''); setToDelete({ id: a.id, name: a.name, projects }) }} title="Delete archetype" aria-label={`Delete ${a.name}`}
                          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </ExportSection>
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.name}?` : 'Delete archetype'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setToDelete(null)}>{toDelete && toDelete.projects > 0 ? 'Close' : 'Cancel'}</Button>
            {toDelete && toDelete.projects === 0 && (
              <Button variant="primary" size="md" onClick={() => {
                const r = deleteArchetype(toDelete.id)
                if (r.ok) setToDelete(null); else setError(r.reason ?? 'Could not delete.')
              }}>Confirm delete</Button>
            )}
          </>
        }
      >
        {toDelete && toDelete.projects > 0 ? (
          <p className="text-[11.5px] text-[#344054]">
            This archetype has <strong>{toDelete.projects}</strong> project{toDelete.projects === 1 ? '' : 's'} initiated from it, so it cannot be deleted. Switch it to <strong>inactive</strong> to stop new projects from using it.
          </p>
        ) : (
          <div className="space-y-2 text-[11.5px] text-[#344054]">
            <p>No project uses this archetype. Deleting removes it from Governance and the Project Initiation list. This cannot be undone.</p>
            <p>Its Activity Builder activities are retired: work already built on them keeps going, but they cannot be used for anything new.</p>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[11.5px] text-red-700">{error}</p>}
      </Modal>
      <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">
        Projects associated = projects initiated from the archetype (Project Initiation). WBS objects of type Activity Builder appear in the Activity Builder.
      </p>
    </div>
  )
}
