import { useMemo, useState } from 'react'
import { PageHeader, Card, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { useWorkParts } from '../../hooks/useWorkParts'
import { usePersonaStore } from '../../store/personaStore'
import { getPicOn } from '../../engine'
import { DEMO_TODAY, partInScope, fmtDate } from '../scope'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'

/**
 * History Transfer: pick a source part, pick one or more target parts, choose whether the source stays active,
 * and copy the source's activity history into every selected target at once.
 */
export function HistoryTransferPage() {
  const { entries, activities, templateRows, picAssignments, requestHistoryTransfer, decideHistoryTransfer, historyTransferRequests, partEvents } = useQAStore()
  const parts = useWorkParts()
  const { currentPersona } = usePersonaStore()
  const canTransfer = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  const isSic = currentPersona === 'SIC'

  // Active parts the persona may see (no superseded parts).
  const activeParts = useMemo(
    () => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)).sort((a, b) => a.partNo.localeCompare(b.partNo)),
    [parts, currentPersona]
  )
  const models = useMemo(() => Array.from(new Set(activeParts.map((p) => p.model).filter(Boolean))).sort(), [activeParts])
  // Vendor code options as "code — vendor name".
  const vendorCodes = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of activeParts) if (p.vendorCode) m.set(p.vendorCode, p.vendorName)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [activeParts])

  const [fromPartNo, setFromPartNo] = useState('')
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set())
  const [keepActive, setKeepActive] = useState(true)
  const [reason, setReason] = useState('')
  // Source picker filters.
  const [srcModel, setSrcModel] = useState('All')
  const [srcVendorCode, setSrcVendorCode] = useState('All')
  // Target picker filters.
  const [tgtModel, setTgtModel] = useState('All')
  const [filter, setFilter] = useState('')
  // Activities to transfer (template row ids excluded). Empty set = all.
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<string | null>(null)

  const sourceOptions = useMemo(
    () => activeParts.filter((p) => (srcModel === 'All' || p.model === srcModel) && (srcVendorCode === 'All' || p.vendorCode === srcVendorCode)),
    [activeParts, srcModel, srcVendorCode]
  )
  const source = activeParts.find((p) => p.partNo === fromPartNo)

  // The source's activities, with name + milestone, de-duped by template row.
  const sourceActivities = useMemo(() => {
    if (!source) return []
    const tplMilestone = new Map(templateRows.map((r) => [r.id, r.milestoneId]))
    const rows = entries
      .filter((e) => e.partNo === fromPartNo)
      .map((e) => ({ templateRowId: e.templateRowId, name: activities.find((a) => a.id === e.activityId)?.name ?? e.activityId, milestone: tplMilestone.get(e.templateRowId) ?? 'Other' }))
    const seen = new Set<string>()
    return rows.filter((r) => (seen.has(r.templateRowId) ? false : (seen.add(r.templateRowId), true))).sort((a, b) => a.name.localeCompare(b.name))
  }, [source, entries, fromPartNo, activities, templateRows])
  const selectedActivityCount = sourceActivities.filter((a) => !excludedRows.has(a.templateRowId)).length

  // Group the source activities by milestone for display (PP → MPP → Pilot → SOP → others).
  const MS_ORDER = ['PP', 'MPP', 'Pilot', 'SOP']
  const activityGroups = useMemo(() => {
    const by = new Map<string, typeof sourceActivities>()
    for (const a of sourceActivities) {
      if (!by.has(a.milestone)) by.set(a.milestone, [])
      by.get(a.milestone)!.push(a)
    }
    return [...by.entries()].sort((x, y) => {
      const ix = MS_ORDER.indexOf(x[0]); const iy = MS_ORDER.indexOf(y[0])
      return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy) || x[0].localeCompare(y[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceActivities])

  // Reset activity selection + targets when the source changes.
  const onPickSource = (pn: string) => {
    setFromPartNo(pn)
    setTargetIds(new Set())
    setExcludedRows(new Set())
  }

  // Targets can only be parts with the SAME vendor code as the source (history moves within one vendor code).
  const sameVendorParts = useMemo(
    () => (source ? activeParts.filter((p) => p.partNo !== source.partNo && p.vendorCode === source.vendorCode) : []),
    [activeParts, source]
  )
  // Candidate targets: same-vendor-code parts, by the target model filter + search.
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return sameVendorParts
      .filter((p) => tgtModel === 'All' || p.model === tgtModel)
      .filter((p) => !q || `${p.partNo} ${p.partName} ${p.model} ${p.vendorName}`.toLowerCase().includes(q))
  }, [sameVendorParts, tgtModel, filter])

  const selected = candidates.filter((p) => targetIds.has(p.partNo))
  const selectedCount = sameVendorParts.filter((p) => targetIds.has(p.partNo)).length
  const valid = !!source && selectedCount > 0 && selectedActivityCount > 0

  const toggle = (partNo: string) =>
    setTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(partNo)) next.delete(partNo)
      else next.add(partNo)
      return next
    })
  const toggleActivity = (rowId: string) =>
    setExcludedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })

  function reset() {
    setFromPartNo('')
    setTargetIds(new Set())
    setKeepActive(true)
    setReason('')
    setFilter('')
    setExcludedRows(new Set())
    setTgtModel('All')
  }

  function submit() {
    if (!valid || !source) return
    // Guard: only same-vendor-code parts can receive the history.
    const toPartNos = [...targetIds].filter((id) => id !== fromPartNo && sameVendorParts.some((p) => p.partNo === id))
    const templateRowIds = sourceActivities.filter((a) => !excludedRows.has(a.templateRowId)).map((a) => a.templateRowId)
    const actorName = currentPersona === 'PIC' ? getPicOn(source, picAssignments, DEMO_TODAY).name || undefined : undefined
    requestHistoryTransfer({ fromPartNo: source.partNo, toPartNos, keepSourceActive: keepActive, templateRowIds, by: currentPersona, actorName, reason: reason.trim() || undefined })
    setDone(
      isSic
        ? `History of ${source.partNo} (${templateRowIds.length} activit${templateRowIds.length === 1 ? 'y' : 'ies'}) transferred into ${toPartNos.length} part${toPartNos.length === 1 ? '' : 's'}. The source was ${keepActive ? 'kept active' : 'made inactive'}.`
        : `Request raised: transfer ${templateRowIds.length} activit${templateRowIds.length === 1 ? 'y' : 'ies'} of ${source.partNo} into ${toPartNos.length} part${toPartNos.length === 1 ? '' : 's'}. Awaiting SIC approval.`
    )
    reset()
    setTimeout(() => setDone(null), 7000)
  }

  const partName = (pn: string) => parts.find((p) => p.partNo === pn)?.partName ?? ''
  const activityNameOf = (rowId: string) => {
    const aId = templateRows.find((r) => r.id === rowId)?.activityId
    return activities.find((a) => a.id === aId)?.name ?? rowId
  }
  const pendingRequests = useMemo(() => historyTransferRequests.filter((r) => r.status === 'Pending'), [historyTransferRequests])
  const [decideComment, setDecideComment] = useState<Record<string, string>>({})
  function decide(reqId: string, d: 'Approve' | 'Reject') {
    decideHistoryTransfer(reqId, d, currentPersona, currentPersona, decideComment[reqId]?.trim() || undefined)
  }

  const recent = useMemo(
    () => [...partEvents].filter((e) => e.kind === 'Transferred').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    [partEvents]
  )

  if (!canTransfer) {
    return (
      <div>
        <PageHeader title="History Transfer" section="Modules" description="Transfer a part's activity history to one or more other parts." />
        <Card><p className="py-8 text-center text-sm text-[var(--color-muted)]">History transfer is available to the PIC, SIC and Admin roles.</p></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="History Transfer"
        section="Modules"
        description="Copy one part's activity history into one or more other parts. Choose whether the source part stays active or is made inactive afterwards."
      />

      {done && (
        <div role="status" className="epmp-card mb-4 border-l-4 border-l-emerald-500 px-4 py-3 text-[12px] text-emerald-800">
          {done}
        </div>
      )}

      <Card flush className="!overflow-visible">
        <div className="space-y-5 p-5">
          {/* Step 1: source part */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">1 · Part whose history is transferred</div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={srcModel} onChange={(e) => { setSrcModel(e.target.value); if (source && e.target.value !== 'All' && source.model !== e.target.value) onPickSource('') }} className={`${inputCls} w-40`} aria-label="Filter source by model">
                <option value="All">All models</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={srcVendorCode} onChange={(e) => { setSrcVendorCode(e.target.value); if (source && e.target.value !== 'All' && source.vendorCode !== e.target.value) onPickSource('') }} className={`${inputCls} w-56`} aria-label="Filter source by vendor code">
                <option value="All">All vendor codes</option>
                {vendorCodes.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
              </select>
              <select value={fromPartNo} onChange={(e) => onPickSource(e.target.value)} className={`${inputCls} min-w-[280px] flex-1`}>
                <option value="">— select source part —</option>
                {sourceOptions.map((p) => (
                  <option key={p.partNo} value={p.partNo}>{p.partNo} — {p.partName} ({p.model} · {p.vendorName} / {p.vendorCode})</option>
                ))}
              </select>
            </div>
            {source && (
              <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
                {sourceActivities.length} activit{sourceActivities.length === 1 ? 'y' : 'ies'} with history. Section {source.section} · Type {source.type} · Vendor {source.vendorName} ({source.vendorCode}).
              </p>
            )}
          </div>

          {/* Step 2: which activities */}
          {source && sourceActivities.length > 0 && (
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  2 · Activities to transfer <span className="text-primary">· {selectedActivityCount} of {sourceActivities.length}</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setExcludedRows(new Set())} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">Select all</button>
                  <button onClick={() => setExcludedRows(new Set(sourceActivities.map((a) => a.templateRowId)))} className="text-[11px] font-medium text-[var(--color-muted)] hover:underline">Clear</button>
                </div>
              </div>
              <p className="mb-2 text-[11px] text-[var(--color-muted)]">All activities are selected by default. Untick any you do not want to transfer.</p>
              <div className="space-y-3">
                {activityGroups.map(([milestone, items]) => {
                  const ids = items.map((i) => i.templateRowId)
                  const onCount = ids.filter((id) => !excludedRows.has(id)).length
                  return (
                    <div key={milestone}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">{milestone}</span>
                        <span className="text-[10px] text-[var(--color-muted)]">{onCount} of {items.length}</span>
                        <button onClick={() => setExcludedRows((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })} className="text-[10px] font-medium text-[var(--color-accent)] hover:underline">Select all</button>
                        <button onClick={() => setExcludedRows((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n })} className="text-[10px] font-medium text-[var(--color-muted)] hover:underline">Clear</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {items.map((a) => {
                          const on = !excludedRows.has(a.templateRowId)
                          return (
                            <label key={a.templateRowId} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${on ? 'border-[var(--color-accent)] bg-[#eff6ff] text-[#1d4ed8]' : 'border-[var(--color-border)] bg-white text-[var(--color-muted)]'}`}>
                              <input type="checkbox" checked={on} onChange={() => toggleActivity(a.templateRowId)} />
                              {a.name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: targets */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                3 · Parts to receive the history {selectedCount > 0 && <span className="text-primary">· {selectedCount} selected</span>}
              </span>
              {source && <span className="text-[10px] text-[var(--color-muted)]">Only parts with vendor code <strong>{source.vendorCode}</strong> ({source.vendorName}) can receive this history.</span>}
            </div>
            {source && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select value={tgtModel} onChange={(e) => setTgtModel(e.target.value)} className={`${inputCls} w-40`} aria-label="Filter targets by model">
                  <option value="All">All models</option>
                  {Array.from(new Set(sameVendorParts.map((p) => p.model))).sort().map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search part no / name…"
                  aria-label="Filter target parts"
                  className="h-9 w-56 max-w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054]"
                />
                <button onClick={() => setTargetIds(new Set(sameVendorParts.map((p) => p.partNo)))} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">Select all ({sameVendorParts.length})</button>
                {candidates.length > 0 && candidates.length !== sameVendorParts.length && (
                  <button onClick={() => setTargetIds((prev) => new Set([...prev, ...candidates.map((p) => p.partNo)]))} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">Select shown ({candidates.length})</button>
                )}
                <button onClick={() => setTargetIds(new Set())} className="text-[11px] font-medium text-[var(--color-muted)] hover:underline">Clear</button>
              </div>
            )}
            {!source ? (
              <p className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-[12px] text-[var(--color-muted)]">Select a source part first.</p>
            ) : sameVendorParts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-[12px] text-[var(--color-muted)]">No other parts with vendor code {source.vendorCode} to transfer into.</p>
            ) : candidates.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-[12px] text-[var(--color-muted)]">No parts match the filter.</p>
            ) : (
              <div className="table-scroll max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                      <th className="w-10 px-2 py-1.5 text-center">Pick</th>
                      <th className="px-2 py-1.5">Part No</th>
                      <th className="px-2 py-1.5">Part name</th>
                      <th className="px-2 py-1.5">Model</th>
                      <th className="px-2 py-1.5">Vendor (code)</th>
                      <th className="px-2 py-1.5">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((p) => {
                      const on = targetIds.has(p.partNo)
                      return (
                        <tr key={p.partNo} className={`border-b border-[var(--color-border)] last:border-0 cursor-pointer ${on ? 'bg-[#eff6ff]' : 'hover:bg-[var(--color-surface)]'}`} onClick={() => toggle(p.partNo)}>
                          <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={on} onChange={() => toggle(p.partNo)} onClick={(e) => e.stopPropagation()} /></td>
                          <td className="px-2 py-1.5 font-medium text-[#101828]">{p.partNo}</td>
                          <td className="px-2 py-1.5 text-[var(--color-muted)]">{p.partName}</td>
                          <td className="px-2 py-1.5 text-[var(--color-muted)]">{p.model}</td>
                          <td className="px-2 py-1.5 text-[var(--color-muted)]">{p.vendorName} ({p.vendorCode})</td>
                          <td className="px-2 py-1.5 text-[var(--color-muted)]">{p.type}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Step 3: source disposition + reason */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">4 · After the transfer</div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px] text-[#344054]">
                <input type="radio" name="disposition" checked={keepActive} onChange={() => setKeepActive(true)} />
                Keep the source part <strong>{source?.partNo ?? ''}</strong> active (history is copied, both parts stay tracked)
              </label>
              <label className="flex items-center gap-2 text-[12px] text-[#344054]">
                <input type="radio" name="disposition" checked={!keepActive} onChange={() => setKeepActive(false)} />
                Make the source part inactive after the transfer (it drops out of tracking views)
              </label>
            </div>
            <label className="mt-3 block max-w-xl">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason / reference (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ECN-1234, second sourcing" className={inputCls} />
            </label>
          </div>

          {/* Summary + action */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <p className="text-[12px] text-[var(--color-muted)]">
              {valid
                ? <>Transfer <strong className="text-[#101828]">{selectedActivityCount}</strong> activit{selectedActivityCount === 1 ? 'y' : 'ies'} from <strong className="text-[#101828]">{source!.partNo}</strong> into <strong className="text-[#101828]">{selectedCount}</strong> part{selectedCount === 1 ? '' : 's'}; source will be <strong className="text-[#101828]">{keepActive ? 'kept active' : 'made inactive'}</strong>.</>
                : 'Select a source part, at least one activity, and at least one target part.'}
            </p>
            <Button variant="primary" size="md" disabled={!valid} onClick={submit}>
              {isSic ? 'Transfer history' : 'Request transfer (SIC approval)'}
            </Button>
          </div>
          {!isSic && <p className="text-[11px] text-[var(--color-muted)]">A PIC's transfer is applied only after the SIC approves it.</p>}
        </div>
      </Card>

      {selected.length > 0 && source && (
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Existing work on a target part is kept — only activities the target does not already have are copied from {source.partNo}.
        </p>
      )}

      {pendingRequests.length > 0 && (
        <Card flush className="mt-4 !overflow-visible">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="m-0 text-[13px] font-semibold text-[var(--color-text)]">
              History transfers awaiting SIC approval ({pendingRequests.length})
            </h3>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {isSic ? 'Approve to run the transfer, or reject it.' : 'Raised by a PIC; the SIC approves or rejects.'}
            </p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {pendingRequests.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#101828]">
                      {r.fromPartNo} <span className="font-normal text-[var(--color-muted)]">{partName(r.fromPartNo)}</span>
                      <span className="mx-1 text-[var(--color-muted)]">→</span>
                      {r.toPartNos.length} part{r.toPartNos.length === 1 ? '' : 's'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      Targets: {r.toPartNos.join(', ')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      Activities: {r.templateRowIds.length === 0 ? 'all' : r.templateRowIds.map(activityNameOf).join(', ')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      Source will be {r.keepSourceActive ? 'kept active' : 'made inactive'} · requested by {r.requestedByName} on {fmtDate(r.requestedAt.slice(0, 10))}{r.reason ? ` · "${r.reason}"` : ''}
                    </div>
                  </div>
                  {isSic && (
                    <div className="flex flex-col items-end gap-1.5">
                      <input
                        value={decideComment[r.id] ?? ''}
                        onChange={(e) => setDecideComment((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Comment (optional)"
                        className="h-8 w-56 max-w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054]"
                      />
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm" onClick={() => decide(r.id, 'Reject')}>Reject</Button>
                        <Button variant="primary" size="sm" onClick={() => decide(r.id, 'Approve')}>Approve & transfer</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card className="mt-4" title="Recent transfers">
          <ul className="space-y-1.5 text-[12px] text-[#344054]">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2">
                <span className="text-[var(--color-muted)]">{fmtDate(e.at.slice(0, 10))}</span>
                <span><strong>{e.by}</strong> transferred <strong>{e.fromPartNo}</strong> → <strong>{e.partNo}</strong> ({e.entriesMoved} activities){e.reason ? ` — ${e.reason}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
