import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PartIntakePage } from '../intake/PartIntakePage'
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

/** CSV cell escaping. */
function csvCell(v: string | number | undefined): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function PartsPage() {
  const {
    parts: allParts,
    partEvents,
    entries,
    templateRows,
    activities,
    picAssignments,
    transferPart,
    releasePart
  } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [params, setParams] = useSearchParams()
  const canManage = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  /** Dummy part numbers are raised by the Department Co-ordinator, a PIC or Admin. */
  const canRelease = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const doRelease = (part: PartRecord, next: boolean) => {
    const actorName = currentPersona === 'PIC' ? getPicOn(part, picAssignments, DEMO_TODAY).name || undefined : undefined
    releasePart({ partNo: part.partNo, released: next, by: currentPersona, actorName })
  }

  type PartsTab = 'intake' | 'audit'
  const urlTab = params.get('tab')
  const tab: PartsTab = urlTab === 'audit' ? 'audit' : 'intake'
  const setTab = (t: PartsTab) => setParams(t === 'intake' ? {} : { tab: t })

  const intakeActions = useMemo(
    () => ({ canRelease, canEcn: canManage, onRelease: doRelease, onEcn: (p: PartRecord) => openXfer(p) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canRelease, canManage]
  )

  // Parts the persona may see (hide superseded by default)
  const showSuperseded = false
  const visibleParts = useMemo(
    () => allParts.filter((p) => partInScope(p, currentPersona) && (showSuperseded || !p.supersededBy)),
    [allParts, currentPersona, showSuperseded]
  )
  const scopeParts = useMemo(() => allParts.filter((p) => partInScope(p, currentPersona)), [allParts, currentPersona])

  // ── ECN transfer dialog ──────────────────────────────────────────────────
  const [xfer, setXfer] = useState<PartRecord | null>(null)
  const [toNo, setToNo] = useState('')
  const [toName, setToName] = useState('')
  const [xreason, setXreason] = useState('')

  const openXfer = (part: PartRecord) => {
    setXfer(part)
    setToNo('')
    setToName('')
    setXreason('')
  }

  const xferEntryCount = xfer ? entries.filter((e) => e.partNo === xfer.partNo).length : 0
  const toTarget = allParts.find((p) => p.partNo === toNo.trim())
  const toExists = !!toTarget
  // ECN transfer must stay within the same vendor: an existing target part must belong to the source's vendor.
  const vendorMismatch = !!(xfer && toTarget && toTarget.vendorName !== xfer.vendorName)
  const xferValid = !!(xfer && toNo.trim() && toNo.trim() !== xfer.partNo && !vendorMismatch)

  const submitXfer = () => {
    if (!xfer || !xferValid) return
    const actorName =
      currentPersona === 'PIC' ? getPicOn(xfer, picAssignments, DEMO_TODAY).name || undefined : undefined
    transferPart({
      fromPartNo: xfer.partNo,
      toPartNo: toNo.trim(),
      newPartName: toName.trim() || undefined,
      by: currentPersona,
      actorName,
      reason: xreason.trim() || undefined
    })
    setXfer(null)
  }

  // ── Audit report ─────────────────────────────────────────────────────────
  const [completedOnly, setCompletedOnly] = useState(true)
  const [personFilter, setPersonFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [partFilter, setPartFilter] = useState('')

  const log = useMemo(() => {
    const inScope = new Set(scopeParts.map((p) => p.partNo))
    return buildActivityLog(entries, allParts, templateRows, activities, picAssignments).filter((l) =>
      inScope.has(l.partNo)
    )
  }, [entries, allParts, templateRows, activities, picAssignments, scopeParts])

  const people = useMemo(() => Array.from(new Set(log.map((l) => l.person))).sort(), [log])

  const filteredLog = useMemo(
    () =>
      log.filter(
        (l) =>
          (!completedOnly || l.action === 'Approved') &&
          (personFilter === 'All' || l.person === personFilter) &&
          (vendorFilter === 'All' || l.vendorName === vendorFilter) &&
          (!partFilter || `${l.partNo} ${l.partName}`.toLowerCase().includes(partFilter.toLowerCase()))
      ),
    [log, completedOnly, personFilter, vendorFilter, partFilter]
  )

  const logVendors = useMemo(() => Array.from(new Set(log.map((l) => l.vendorName).filter(Boolean))).sort(), [log])

  // Per-PIC completion summary: how many activities each person has completed (Approved)
  const summary = useMemo(() => {
    const map = new Map<string, { completed: number; parts: Set<string> }>()
    for (const l of log) {
      if (l.action !== 'Approved') continue
      const e = map.get(l.person) ?? { completed: 0, parts: new Set<string>() }
      e.completed += 1
      e.parts.add(l.partNo)
      map.set(l.person, e)
    }
    return Array.from(map.entries())
      .map(([person, v]) => ({ person, completed: v.completed, parts: v.parts.size }))
      .sort((a, b) => b.completed - a.completed)
  }, [log])

  const exportCsv = () => {
    const header = ['When', 'PIC / Person', 'Role', 'Part No', 'Part Name', 'Section', 'Vendor', 'Vendor Code', 'Activity', 'Milestone', 'Action', 'Comment']
    const body = filteredLog.map((l) =>
      [
        fmtDateTime(l.timestamp),
        l.person,
        l.role,
        l.partNo,
        l.partName,
        l.section,
        l.vendorName,
        l.vendorCode,
        l.activityName,
        l.milestoneId,
        l.action,
        l.comment ?? ''
      ]
        .map(csvCell)
        .join(',')
    )
    const csv = [header.map(csvCell).join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qa-audit-report-${DEMO_TODAY}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }


  return (
    <div>
      <PageHeader
        title="Part Intake"
        section="Modules"
        description="Parts received from SAP and ENOVIA, adding a part by hand, releasing parts to the vendor, ECN history transfer, and which PIC completed what."
      />

      <Tabs
        className="mb-4"
        activeId={tab}
        onChange={(id) => setTab(id as PartsTab)}
        items={[
          { id: 'intake', label: 'Part intake', badge: visibleParts.length },
          { id: 'audit', label: 'Audit report', badge: summary.reduce((n, s) => n + s.completed, 0) }
        ]}
      />

      {tab === 'intake' && <PartIntakePage embedded actions={intakeActions} />}

      {tab === 'audit' && (
        <>
          <Card flush className="mb-4 !overflow-visible">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>PIC / Person</th>
                    <th className={thCls}>Activities completed</th>
                    <th className={thCls}>Distinct parts</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.person} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#101828]">{s.person}</td>
                      <td className="px-4 py-3">{s.completed}</td>
                      <td className="px-4 py-3">{s.parts}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        No completed activities yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            <label className="flex items-center gap-2 text-[11px] text-[#344054]">
              <input type="checkbox" checked={completedOnly} onChange={(e) => setCompletedOnly(e.target.checked)} />
              Completed (Approved) only
            </label>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className={inputCls}>
              <option value="All">All people</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className={inputCls}>
              <option value="All">All vendors</option>
              {logVendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
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
            <div className="ml-auto">
              <Button variant="secondary" size="md" onClick={exportCsv} disabled={filteredLog.length === 0}>
                Export CSV
              </Button>
            </div>
          </section>

          <Card flush className="!overflow-visible">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>When</th>
                    <th className={thCls}>PIC / Person</th>
                    <th className={thCls}>Part</th>
                    <th className={thCls}>Vendor</th>
                    <th className={thCls}>Activity</th>
                    <th className={thCls}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map((l, i) => (
                    <tr key={`${l.templateRowId}-${l.timestamp}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[var(--color-muted)]">{fmtDateTime(l.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-[#101828]">{l.person}</td>
                      <td className="px-4 py-3 text-[12px]">
                        <div>{l.partNo}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{l.partName}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        <div>{l.vendorName}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{l.vendorCode}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        {l.activityName} <span className="text-[var(--color-muted)]">({l.milestoneId})</span>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        <span className={l.action === 'Approved' ? 'font-medium text-emerald-700' : ''}>{l.action}</span>
                        {l.comment && <div className="text-[11px] text-[var(--color-muted)]">{l.comment}</div>}
                      </td>
                    </tr>
                  ))}
                  {filteredLog.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">
                        No activity matches the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {partEvents.length > 0 && (
            <Card className="mt-4" title="Part-number events">
              <ul className="space-y-1.5 text-[12px]">
                {[...partEvents]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2 text-[#344054]">
                      <span className="text-[var(--color-muted)]">{fmtDateTime(e.at)}</span>
                      {e.kind === 'Created' ? (
                        <span>
                          <strong>{e.by}</strong> created dummy part <strong>{e.partNo}</strong>
                        </span>
                      ) : (
                        <span>
                          <strong>{e.by}</strong> transferred <strong>{e.fromPartNo}</strong> → <strong>{e.partNo}</strong>{' '}
                          ({e.entriesMoved} activities){e.reason ? ` — ${e.reason}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* ECN transfer modal */}
      <Modal
        open={xfer !== null}
        onClose={() => setXfer(null)}
        title={xfer ? `ECN transfer — ${xfer.partNo}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setXfer(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={submitXfer} disabled={!xferValid}>
              Transfer history
            </Button>
          </>
        }
      >
        {xfer && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              Moves this part's history and in-progress activities ({xferEntryCount}) to the revised part number. The old
              part is then retired and only the new number is tracked.
            </p>
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] text-[#344054]">
              ECN transfer stays within the same vendor: <strong>{xfer.vendorName}</strong>. The revised part must belong to this vendor.
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">New (revised) part number</span>
              <input value={toNo} onChange={(e) => setToNo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 31100-M74LD9" />
              {toNo.trim() === xfer.partNo && (
                <span className="mt-1 block text-[11px] text-red-600">The new number must differ from the old one.</span>
              )}
              {vendorMismatch && (
                <span className="mt-1 block text-[11px] text-red-600">
                  {toTarget!.partNo} belongs to {toTarget!.vendorName}, not {xfer.vendorName}. ECN transfer is only allowed within the same vendor.
                </span>
              )}
              {toExists && !vendorMismatch && toNo.trim() !== xfer.partNo && (
                <span className="mt-1 block text-[11px] text-amber-700">
                  This part already exists (same vendor) — history will be merged onto it (existing entries are kept).
                </span>
              )}
              {!toExists && toNo.trim() && (
                <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
                  New part will be created under {xfer.vendorName}.
                </span>
              )}
            </label>
            {!toExists && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">New part name (optional)</span>
                <input
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder={xfer.partName}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason / ECN reference (optional)</span>
              <input value={xreason} onChange={(e) => setXreason(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
