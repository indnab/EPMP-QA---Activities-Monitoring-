import { useMemo, useState } from 'react'
import { PageHeader, Card, Button, Modal, Tabs } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { getPicOn, buildActivityLog } from '../../engine'
import type { PartRecord } from '../../domain'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'

const inputCls =
  'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054] placeholder-[var(--color-muted)]'
const thCls = 'text-left px-4 py-3 font-medium text-[var(--color-muted)]'

function fmtDateTime(ts: string): string {
  return `${fmtDate(ts.slice(0, 10))} ${ts.slice(11, 16)}`
}

export function PicsPage() {
  const { picAssignments, entries, templateRows, activities, parts: allParts, assignPic } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canAssign = currentPersona === 'SIC' || currentPersona === 'Admin'

  const [tab, setTab] = useState<'assign' | 'report'>('assign')
  const [search, setSearch] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  // Assign modal state
  const [target, setTarget] = useState<PartRecord | null>(null)
  const [pic, setPic] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(DEMO_TODAY)
  const [reason, setReason] = useState('')

  // Report filters
  const [personFilter, setPersonFilter] = useState('All')
  const [partFilter, setPartFilter] = useState('')
  const [applicabilityOnly, setApplicabilityOnly] = useState(false)

  const parts = useMemo(
    () => allParts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)),
    [allParts, currentPersona]
  )

  // Known people for the datalist: SAP PICs plus anyone assigned so far
  const knownPeople = useMemo(
    () => Array.from(new Set([...allParts.map((p) => p.pic), ...picAssignments.map((a) => a.pic)].filter(Boolean))).sort(),
    [allParts, picAssignments]
  )

  const rows = useMemo(
    () =>
      parts
        .map((part) => ({ part, current: getPicOn(part, picAssignments, DEMO_TODAY) }))
        .filter(({ part, current }) => {
          if (unassignedOnly && current.name) return false
          if (search) {
            const q = search.toLowerCase()
            if (!`${part.partNo} ${part.partName} ${current.name}`.toLowerCase().includes(q)) return false
          }
          return true
        }),
    [parts, picAssignments, unassignedOnly, search]
  )

  const log = useMemo(() => {
    const inScope = new Set(parts.map((p) => p.partNo))
    return buildActivityLog(entries, allParts, templateRows, activities, picAssignments).filter((l) =>
      inScope.has(l.partNo)
    )
  }, [entries, allParts, templateRows, activities, picAssignments, parts])

  const people = useMemo(() => Array.from(new Set(log.map((l) => l.person))).sort(), [log])

  const filteredLog = log.filter(
    (l) =>
      (personFilter === 'All' || l.person === personFilter) &&
      (!applicabilityOnly || l.action.startsWith('Marked ')) &&
      (!partFilter || `${l.partNo} ${l.partName}`.toLowerCase().includes(partFilter.toLowerCase()))
  )

  const summary = useMemo(() => {
    const map = new Map<string, { actions: number; parts: Set<string> }>()
    for (const l of log) {
      const e = map.get(l.person) ?? { actions: 0, parts: new Set<string>() }
      e.actions += 1
      e.parts.add(l.partNo)
      map.set(l.person, e)
    }
    return Array.from(map.entries())
      .map(([person, v]) => ({ person, actions: v.actions, parts: v.parts.size }))
      .sort((a, b) => b.actions - a.actions)
  }, [log])

  const openAssign = (part: PartRecord) => {
    setTarget(part)
    setPic('')
    setEffectiveFrom(DEMO_TODAY)
    setReason('')
  }

  const submitAssign = () => {
    if (!target || !pic.trim() || !effectiveFrom) return
    assignPic({
      partNo: target.partNo,
      pic: pic.trim(),
      effectiveFrom,
      reason: reason.trim() || undefined,
      assignedBy: currentPersona
    })
    setTarget(null)
  }

  const targetHistory = target
    ? picAssignments
        .filter((a) => a.partNo === target.partNo)
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.assignedAt.localeCompare(b.assignedAt))
    : []

  const unassignedCount = parts.filter((p) => !getPicOn(p, picAssignments, DEMO_TODAY).name).length

  return (
    <div>
      <PageHeader
        title="PIC Assignments"
        section="Modules"
        description="PICs are ingested from SAP. When SAP has none, SIC assigns a PIC; a later assignment replaces the earlier one from its effective date forward. The report shows who did what."
      />

      <Tabs
        className="mb-4"
        activeId={tab}
        onChange={(id) => setTab(id as 'assign' | 'report')}
        items={[
          { id: 'assign', label: 'Assignments', badge: unassignedCount > 0 ? `${unassignedCount} unassigned` : undefined },
          { id: 'report', label: 'Who did what', badge: log.length }
        ]}
      />

      {tab === 'assign' && (
        <>
          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            <input
              type="text"
              placeholder="Search part or PIC…"
              aria-label="Search parts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} w-64 max-w-full`}
            />
            <label className="flex items-center gap-2 text-[11px] text-[#344054]">
              <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
              Unassigned only
            </label>
            {!canAssign && (
              <span className="text-[11px] text-[var(--color-muted)]">Read-only. SIC or Admin can assign a PIC.</span>
            )}
          </section>

          <Card flush className="!overflow-visible">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>Part</th>
                    <th className={thCls}>Section</th>
                    <th className={thCls}>Vendor</th>
                    <th className={thCls}>SAP PIC</th>
                    <th className={thCls}>Current PIC</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ part, current }) => (
                    <tr key={part.partNo} className="border-b border-[var(--color-border)] hover:bg-secondary/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--color-text)]">{part.partName}</div>
                        <div className="font-mono text-[10px] text-[var(--color-muted)]">{part.partNo}</div>
                      </td>
                      <td className="px-4 py-3">{part.section}</td>
                      <td className="px-4 py-3">{part.vendorName}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{part.pic || '—'}</td>
                      <td className="px-4 py-3">
                        {current.name ? (
                          <>
                            <span className="font-medium">{current.name}</span>
                            {current.assignment && (
                              <div className="text-[10px] text-[var(--color-muted)]">
                                Assigned · from {fmtDate(current.assignment.effectiveFrom)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="rounded px-2 py-0.5 text-xs font-medium bg-[#fef2f2] text-[#b91c1c]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAssign && (
                          <Button variant="secondary" size="sm" onClick={() => openAssign(part)}>
                            {current.name ? 'Change PIC' : 'Assign PIC'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'report' && (
        <>
          <Card title="Actions by person" flush className="mb-4">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>Person</th>
                    <th className={thCls}>Actions</th>
                    <th className={thCls}>Parts touched</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.person} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-2.5 font-medium">{s.person}</td>
                      <td className="px-4 py-2.5">{s.actions}</td>
                      <td className="px-4 py-2.5">{s.parts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              aria-label="Filter by person"
              className={inputCls}
            >
              <option value="All">All people</option>
              {people.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter by part…"
              aria-label="Filter by part"
              value={partFilter}
              onChange={(e) => setPartFilter(e.target.value)}
              className={`${inputCls} w-56 max-w-full`}
            />
            <label className="flex items-center gap-2 text-[11px] text-[#344054]">
              <input type="checkbox" checked={applicabilityOnly} onChange={(e) => setApplicabilityOnly(e.target.checked)} />
              Applicability changes only
            </label>
          </section>

          <Card flush className="!overflow-visible">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>When</th>
                    <th className={thCls}>Person</th>
                    <th className={thCls}>Role</th>
                    <th className={thCls}>Action</th>
                    <th className={thCls}>Activity</th>
                    <th className={thCls}>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map((l, i) => (
                    <tr key={`${l.templateRowId}-${l.partNo}-${l.timestamp}-${i}`} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-muted)]">{fmtDateTime(l.timestamp)}</td>
                      <td className="px-4 py-2.5 font-medium">{l.person}</td>
                      <td className="px-4 py-2.5">{l.role}</td>
                      <td className="px-4 py-2.5">
                        {l.action}
                        {l.comment && <div className="text-[10px] italic text-[var(--color-muted)]">"{l.comment}"</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {l.activityName}
                        <div className="text-[10px] text-[var(--color-muted)]">{l.milestoneId}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {l.partName}
                        <div className="font-mono text-[10px] text-[var(--color-muted)]">{l.partNo}</div>
                      </td>
                    </tr>
                  ))}
                  {filteredLog.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">No activity recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Assign PIC — ${target.partName}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submitAssign} disabled={!pic.trim() || !effectiveFrom}>
              Assign
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              The new PIC replaces the current one from the effective date forward. Work already done stays credited to the earlier PIC.
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">PIC name</span>
              <input
                list="known-pics"
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Select or type a name"
              />
              <datalist id="known-pics">
                {knownPeople.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Effective from</span>
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={`${inputCls} w-full`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-full`} />
            </label>

            <div>
              <div className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">Assignment history</div>
              <ul className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
                <li>SAP: <strong>{target.pic || 'no PIC'}</strong></li>
                {targetHistory.map((a) => (
                  <li key={a.id}>
                    {fmtDate(a.effectiveFrom)}: <strong>{a.pic}</strong> by {a.assignedBy}
                    {a.reason ? ` — ${a.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
