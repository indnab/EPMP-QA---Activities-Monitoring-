import { Icon as FbIcon } from '../../components/Icon'
/**
 * BuilderPage — landing page of the Activity Builder.
 *
 * The Builder is an extension of Governance: activities are not created here. Each QA object in a project
 * archetype's WBS template (Governance → Manage Archetypes) shows up here as an activity to configure — fields,
 * flow and timeline — and publish. Opening one goes to the wizard at /builder/:activityId.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { Button, Card, PageHeader } from '../../components'
import type { ActivityDefinition } from '../../domain'

type Status = 'Not configured' | 'Draft in progress' | 'Published'
const STATUS_CLS: Record<Status, string> = {
  'Not configured': 'bg-amber-100 text-amber-800',
  'Draft in progress': 'bg-blue-100 text-blue-800',
  Published: 'bg-emerald-100 text-emerald-800',
}

export function BuilderPage() {
  const navigate = useNavigate()
  const { archetypes, activities, drafts, milestones } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const [arcFilter, setArcFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')

  const statusOf = (a: ActivityDefinition): Status =>
    drafts.some((d) => d.sourceId === a.id) ? 'Draft in progress' : a.published === false ? 'Not configured' : 'Published'
  const trialLabel = (id?: string) => milestones.find((m) => m.id === id)?.label ?? id ?? '—'

  // One group per archetype (its QA objects, in WBS order), plus any older activity not tied to an archetype.
  const groups = useMemo(() => {
    const live = activities.filter((a) => !a.retired)
    const out = archetypes.map((arc) => ({
      key: arc.id,
      title: arc.name,
      sub: `${arc.id}${arc.active ? '' : ' · inactive'}`,
      rows: arc.wbs
        .filter((o) => o.type === 'QA' && o.activityId)
        .map((o) => live.find((a) => a.id === o.activityId))
        .filter((a): a is ActivityDefinition => !!a),
    }))
    const linked = new Set(out.flatMap((g) => g.rows.map((a) => a.id)))
    const loose = live.filter((a) => !linked.has(a.id))
    if (loose.length) out.push({ key: '_loose', title: 'Not in an archetype', sub: 'Older activities; add them to an archetype’s WBS to manage them there', rows: loose })
    return out
  }, [archetypes, activities])

  const shown = groups
    .filter((g) => arcFilter === 'all' || g.key === arcFilter)
    .map((g) => ({ ...g, rows: g.rows.filter((a) => statusFilter === 'all' || statusOf(a) === statusFilter) }))
  const counts = useMemo(() => {
    const all = groups.flatMap((g) => g.rows)
    return { total: all.length, todo: all.filter((a) => statusOf(a) === 'Not configured').length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, drafts])

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Activity Builder" section="Governance" />
        <Card>
          <div className="py-10 text-center text-[var(--color-muted)]">
            <p className="mb-3"><FbIcon name="lock" size={32} /></p>
            <p className="font-medium">Admin access required</p>
            <p className="mt-1 text-sm">Switch to the <strong>Admin</strong> persona to configure activity definitions.</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Activity Builder"
        section="Governance"
        actions={
          <>
            <select aria-label="Archetype" value={arcFilter} onChange={(e) => setArcFilter(e.target.value)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px] text-[#344054]">
              <option value="all">All archetypes</option>
              {groups.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px] text-[#344054]">
              <option value="all">All statuses</option>
              <option>Not configured</option>
              <option>Draft in progress</option>
              <option>Published</option>
            </select>
            <Button variant="secondary" size="sm" onClick={() => navigate('/governance')}>Manage Archetypes</Button>
          </>
        }
      />

      <div className="mb-4 rounded-lg border border-[#bfdbfe] bg-secondary px-4 py-2.5 text-[12px] text-primary">
        Activities come from the QA objects in each archetype’s WBS template. Add or rename them in{' '}
        <Link to="/governance" className="font-semibold underline">Governance → Manage Archetypes</Link>, then configure fields, flow and timeline here.
        {counts.todo > 0 && <strong> {counts.todo} of {counts.total} still need configuring.</strong>}
      </div>

      <div className="space-y-4">
        {shown.map((g) => (
          <Card flush key={g.key} className="!overflow-visible">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="m-0 text-[13px] font-semibold text-[#101828]">{g.title}</h3>
              <span className="text-[11px] text-[var(--color-muted)]">{g.sub}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{g.rows.length}</span>
              {g.key !== '_loose' && (
                <Link to={`/governance/${g.key}`} className="ml-auto text-[11px] font-semibold text-[var(--color-accent)] hover:underline">Edit WBS →</Link>
              )}
            </div>
            {g.rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--color-muted)]">
                {statusFilter === 'all' ? 'No QA objects in this archetype yet.' : `No activities with status “${statusFilter}”.`}
              </p>
            ) : (
              <div className="table-scroll cta-pin">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                      <th className="px-4 py-2.5">Activity</th>
                      <th className="px-4 py-2.5">Trial</th>
                      <th className="px-4 py-2.5 text-center">Fields</th>
                      <th className="px-4 py-2.5 text-center">Flow steps</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((a) => {
                      const st = statusOf(a)
                      return (
                        <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-[#101828]">{a.name}</div>
                            <div className="font-mono text-[10px] text-[var(--color-muted)]">{a.id}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{trialLabel(a.defaultMilestoneId)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">{a.fields.length}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums">{a.flow.steps.length}</td>
                          <td className="px-4 py-2.5">
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLS[st]}`}>{st}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button variant={st === 'Published' ? 'secondary' : 'primary'} size="sm" onClick={() => navigate(`/builder/${a.id}`)}>
                              {st === 'Not configured' ? 'Configure' : st === 'Draft in progress' ? 'Continue' : 'Edit'}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
