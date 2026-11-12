/**
 * Governance → Activity Library (Admin). Every activity definition with where it is used, plus the admin actions:
 * edit in the Activity Builder, restore shipped fields, duplicate and delete (retire). Moved here from the
 * Activities page so Parts Data Entry holds only work screens.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components'
import { useQAStore } from '../../store/qaStore'
import type { ActivityDefinition } from '../../domain'
import { activitiesForNewUse } from '../scope'
import { SEED_ACTIVITIES } from '../../mock'

export function ActivityLibrary() {
  const navigate = useNavigate()
  const { activities, templateRows, archetypes, deleteActivity, addActivity, restoreActivityDefault } = useQAStore()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Deleted (retired) activities are hidden; their template rows and work keep showing on the work screens.
  const library = useMemo(
    () => activitiesForNewUse(activities).filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase())),
    [activities, search]
  )
  const archetypeName = (id?: string) => archetypes.find((a) => a.id === id)?.name

  function handleDuplicate(act: ActivityDefinition) {
    // A copy is not tied to the archetype's WBS row (that row keeps the original).
    addActivity({ ...act, id: `copy-${act.id}-${Date.now()}`, name: `${act.name} (Copy)`, published: false, archetypeId: undefined, wbsObjectId: undefined })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities…" aria-label="Search activities"
          className="h-9 w-64 max-w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-[12px] text-[#344054]" />
        <span className="text-[12px] text-[var(--color-muted)]">{library.length} activit{library.length === 1 ? 'y' : 'ies'}</span>
      </div>
      <Card flush className="!overflow-visible">
        <div className="table-scroll cta-pin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Activity</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Archetype</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Fields</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Scope</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Part N/A allowed</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Used in</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Status</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {library.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">No activities match.</td></tr>
              ) : library.map((act) => {
                const uses = templateRows.filter((r) => r.activityId === act.id).length
                const seed = SEED_ACTIVITIES.find((s) => s.id === act.id)
                return (
                  <tr key={act.id} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{act.name}</td>
                    <td className="px-4 py-3 text-[12px] text-[var(--color-muted)]">{archetypeName(act.archetypeId) ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{act.fields.length}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{act.scope === 'Both' ? 'New Part + ECN' : act.scope === 'NewPart' ? 'New Part' : 'ECN'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{act.allowNotApplicable ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{uses} template row{uses !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{act.published === false ? 'Not configured' : 'Published'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/builder/${act.id}?back=library`)}>Edit</Button>
                        {seed && JSON.stringify(seed.fields) !== JSON.stringify(act.fields) && (
                          <Button variant="secondary" size="sm" onClick={() => {
                            if (window.confirm(`Restore “${act.name}” to its shipped fields? Your edits to this activity’s fields are replaced.`)) restoreActivityDefault(act.id)
                          }}>Restore default</Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => handleDuplicate(act)}>Duplicate</Button>
                        {deleteConfirm === act.id ? (
                          <>
                            <span className="max-w-[260px] text-left text-[11px] text-[var(--color-muted)]">
                              Existing template rows, entries and dashboards keep working. It cannot be used for anything new and cannot be restored.
                            </span>
                            <Button variant="danger" size="sm" onClick={() => { deleteActivity(act.id); setDeleteConfirm(null) }}>Confirm delete</Button>
                            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(act.id)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
