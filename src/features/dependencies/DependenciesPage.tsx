/**
 * Activity Dependencies — read-only view. Dependencies are now defined per WBS object in each project archetype
 * (Governance → Manage Archetypes → Archetype Details → Dependency). This page lists them for review.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { DEP_LABEL, WBS_TYPE_LABEL } from '../../domain/governance'

export function DependenciesPage() {
  const { archetypes } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const [arcId, setArcId] = useState(archetypes[0]?.id ?? '')
  const arc = archetypes.find((a) => a.id === arcId)

  const rows = useMemo(() => {
    if (!arc) return []
    const byId = new Map(arc.wbs.map((o, i) => [o.id, { o, no: i + 1 }]))
    return arc.wbs
      .map((o, i) => ({ o, no: i + 1, on: o.dependency ? byId.get(o.dependency.onObjectId) : undefined }))
      .filter((r) => r.o.dependency && r.on)
  }, [arc])

  return (
    <div>
      <PageHeader
        title="Activity Dependencies"
        section="Project Execution"
        actions={isAdmin && arc ? (
          <Link to={`/governance/${arc.id}`} className="inline-flex items-center rounded-[10px] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-105">
            Edit in archetype →
          </Link>
        ) : undefined}
      />

      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Project archetype
          <select value={arcId} onChange={(e) => setArcId(e.target.value)} className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] font-normal normal-case text-[#344054]">
            {archetypes.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
          </select>
        </label>
        <span className="ml-auto text-[11px] text-[var(--color-muted)]">
          Read-only · dependencies are set on each WBS object in Governance → Manage Archetypes.
        </span>
      </section>

      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[#dce8fb] text-left text-[11px] font-medium text-[#344054]">
                <th className="min-w-[260px] px-4 py-3">WBS object (dependent)</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Depends on (predecessor)</th>
                <th className="px-4 py-3">Dependency type</th>
                <th className="px-4 py-3 text-right">Lag (days)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  {arc ? `No dependencies defined in ${arc.name} yet.` : 'No archetypes yet.'}
                </td></tr>
              ) : rows.map(({ o, no, on }) => (
                <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium text-[#101828]"><span className="mr-1.5 tabular-nums text-[var(--color-muted)]">{no}.</span>{o.name}</td>
                  <td className="px-4 py-2.5 text-[#344054]">{WBS_TYPE_LABEL[o.type]}</td>
                  <td className="px-4 py-2.5 text-[#344054]"><span className="mr-1.5 tabular-nums text-[var(--color-muted)]">{on!.no}.</span>{on!.o.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-primary">{DEP_LABEL[o.dependency!.type]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{o.dependency!.lagDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
