import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { activeModelNames } from '../../domain/projects'
import { Link } from 'react-router-dom'
import { ACK_SLA_DAYS, PLAN_SLA_DAYS, RELEASE_SLA_DAYS, usePlanningSla } from '../vendorplanning/planningSla'
import type { PartSla } from '../vendorplanning/planningSla'
import { usePicViewMatch } from './picView'
import { Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { useWorkParts } from '../../hooks/useWorkParts'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { getPicOn, getReleaseState, latestReturn } from '../../engine'
import type { PartRecord, ReleaseState } from '../../domain'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'

/** Which slice of parts the list below the tiles shows. */
type Slice = 'pending' | 'released' | 'awaiting' | 'acknowledged' | 'returned' | 'deleted' | TimeSlice
/** Timeline tiles: release > 7 d, acknowledgement > 3 d, vendor planned dates pending / past ack + 15 d. */
type TimeSlice = 'relOverdue' | 'ackOverdue' | 'planPending' | 'planExceeded'
const TIME_TEST: Record<TimeSlice, (s: PartSla) => boolean> = {
  relOverdue: (s) => s.releaseOverdue, ackOverdue: (s) => s.ackOverdue, planPending: (s) => s.planPending, planExceeded: (s) => s.planExceeded,
}
/** 'deleted' is not a release state: it lists parts SAP / ENOVIA deleted (they are recalled automatically). */
const SLICE_STATES: Record<Exclude<Slice, 'deleted' | TimeSlice>, ReleaseState[]> = {
  pending: ['Pending'],
  released: ['Released', 'Acknowledged'],
  awaiting: ['Released'],
  acknowledged: ['Acknowledged'],
  returned: ['Returned']
}

/** State pill per release state, worded like the tiles above (PIC and vendor wording). */
export const RELEASE_LABEL: Record<ReleaseState, string> = {
  Pending: 'Pending release',
  Released: 'Pending acknowledgement',
  Acknowledged: 'Acknowledged',
  Returned: 'Returned by vendor',
}
const VENDOR_LABEL: Record<ReleaseState, string> = { ...RELEASE_LABEL, Released: 'Awaiting my acknowledgement', Returned: 'Returned by me' }
const STATE_CLS: Record<ReleaseState, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Released: 'bg-violet-100 text-violet-800',
  Acknowledged: 'bg-emerald-100 text-emerald-800',
  Returned: 'bg-red-100 text-red-800',
}

function Tile(props: { title: string; count: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      aria-pressed={props.active}
      className="epmp-card flex flex-col items-start px-3 py-2 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
      style={props.active ? { boxShadow: `inset 0 0 0 2px ${props.color}` } : undefined}
    >
      <span className="flex w-full items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: props.color }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: props.color }} />
        {props.title}
        <span className="ml-auto text-[18px] font-bold leading-none">{props.count}</span>
      </span>
    </button>
  )
}

/**
 * Release handshake summary on My Work.
 * PIC / SIC / DPM: how many parts are released to the vendor, pending release and returned by the vendor; the PIC can
 * release several parts together. Vendor: the parts released to it, to acknowledge or return together.
 */
export function ReleasePanel({ partFilter }: { partFilter?: (p: PartRecord) => boolean } = {}) {
  const { partReleases, partAcks, picAssignments, releasePart, acknowledgeParts, returnParts, entries } = useQAStore()
  const storeParts = useQAStore((s) => s.parts)
  const projects = useQAStore((s) => s.projects)
  const parts = useWorkParts()
  const { currentPersona } = usePersonaStore()
  const isVendor = currentPersona === 'Vendor'
  const inView = usePicViewMatch()
  const canReleaseParts = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const rows = useMemo(
    () =>
      parts
        .filter((p) => !p.supersededBy && partInScope(p, currentPersona) && inView(p) && (!partFilter || partFilter(p)))
        .map((p) => ({ part: p, state: getReleaseState(p.partNo, partReleases, partAcks) }))
        // The vendor never sees parts the PIC has not released.
        .filter((r) => !isVendor || r.state !== 'Pending'),
    [parts, partReleases, partAcks, currentPersona, isVendor, inView, partFilter]
  )
  // Parts deleted in SAP / ENOVIA (off the work screens; recalled from the vendor). PIC side only.
  const deletedRows = useMemo(() => {
    if (isVendor) return []
    const live = activeModelNames(projects)
    return storeParts
      .filter((p) => p.sourceDeleted && !p.supersededBy && live.has(p.model) && partInScope(p, currentPersona) && inView(p) && (!partFilter || partFilter(p)))
      .map((p) => ({ part: p, state: getReleaseState(p.partNo, partReleases, partAcks) }))
  }, [storeParts, projects, partReleases, partAcks, currentPersona, isVendor, inView, partFilter])
  const n = (states: ReleaseState[]) => rows.filter((r) => states.includes(r.state)).length
  const counts = {
    pending: n(['Pending']),
    released: n(['Released', 'Acknowledged']),
    awaiting: n(['Released']),
    acknowledged: n(['Acknowledged']),
    returned: n(['Returned'])
  }

  // ?slice=deleted (from the Scope "Part Deleted" tile) opens the deleted parts.
  const [searchParams] = useSearchParams()
  const [slice, setSlice] = useState<Slice>(!isVendor && searchParams.get('slice') === 'deleted' ? 'deleted' : isVendor ? 'awaiting' : 'pending')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [returnOpen, setReturnOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [recallOpen, setRecallOpen] = useState(false)
  const [recallReason, setRecallReason] = useState('')
  const [notice, setNotice] = useState('')

  const slaRows = usePlanningSla()
  const sla = useMemo(() => new Map(slaRows.map((s) => [s.part.partNo, s])), [slaRows])
  const tcount = (t: TimeSlice) => rows.filter((r) => { const s = sla.get(r.part.partNo); return s ? TIME_TEST[t](s) : false }).length
  const isTime = (s: Slice): s is TimeSlice => s in TIME_TEST
  const shown = slice === 'deleted' ? deletedRows
    : isTime(slice) ? rows.filter((r) => { const s = sla.get(r.part.partNo); return s ? TIME_TEST[slice](s) : false })
      : rows.filter((r) => SLICE_STATES[slice].includes(r.state))
  /** Where the part stands against its timeline, in words. */
  const timeline = (no: string): { text: string; late: boolean } | null => {
    const s = sla.get(no)
    if (!s) return null
    if (s.releaseDays !== undefined) return { text: `With PIC ${s.releaseDays} d (received ${fmtDate(s.receivedAt!)}) · release due within ${RELEASE_SLA_DAYS} d`, late: s.releaseOverdue }
    if (s.ackDays !== undefined) return { text: `With vendor ${s.ackDays} d for acknowledgement · due within ${ACK_SLA_DAYS} d`, late: s.ackOverdue }
    if (s.planRequired) {
      const left = s.planDaysLeft ?? 0
      return {
        text: `Planned dates ${s.planFilled} of ${s.planRequired} · ${s.planDaysWithVendor} d with vendor · due ${fmtDate(s.planDue!)} (ack + ${PLAN_SLA_DAYS} d)${s.planPending ? (left < 0 ? ` · ${-left} d late` : ` · ${left} d left`) : ' · complete'}${s.planAwaiting ? ` · ${s.planAwaiting} awaiting PIC` : ''}${s.rejections.length ? ` · ${s.rejections.length} sent back` : ''}`,
        late: s.planExceeded,
      }
    }
    return null
  }
  // Deleted parts cannot be released (SAP / ENOVIA has to activate them first).
  // PIC side: Pending / Returned parts can be released; Released / Acknowledged parts can be recalled.
  const pickable = (state: ReleaseState, part?: PartRecord) =>
    !part?.sourceDeleted && (isVendor ? state === 'Released' : canReleaseParts)
  const pickedRows = shown.filter((r) => picked.has(r.part.partNo) && pickable(r.state, r.part))
  const pickedHere = isVendor
    ? pickedRows.map((r) => r.part.partNo)
    : pickedRows.filter((r) => r.state === 'Pending' || r.state === 'Returned').map((r) => r.part.partNo)
  const pickedRecall = isVendor ? [] : pickedRows.filter((r) => r.state === 'Released' || r.state === 'Acknowledged').map((r) => r.part.partNo)
  const recallAcked = pickedRows.filter((r) => r.state === 'Acknowledged').length
  const allPickable = shown.filter((r) => pickable(r.state, r.part)).map((r) => r.part.partNo)
  const allPicked = allPickable.length > 0 && allPickable.every((no) => picked.has(no))

  const choose = (s: Slice) => {
    setSlice(s)
    setPicked(new Set())
    setNotice('')
  }
  const toggle = (no: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })

  const picName = (p: PartRecord) => (currentPersona === 'PIC' ? getPicOn(p, picAssignments, DEMO_TODAY).name || undefined : undefined)
  const doRelease = () => {
    for (const no of pickedHere) {
      const part = parts.find((p) => p.partNo === no)
      if (part) releasePart({ partNo: no, released: true, by: currentPersona, actorName: picName(part) })
    }
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} released to the vendor.`)
    setPicked(new Set())
  }
  const doRecall = () => {
    for (const no of pickedRecall) {
      const part = parts.find((p) => p.partNo === no)
      if (part) releasePart({ partNo: no, released: false, by: currentPersona, actorName: picName(part), comment: recallReason })
    }
    setNotice(`${pickedRecall.length} part${pickedRecall.length === 1 ? '' : 's'} recalled from the vendor. They are back under Pending release.`)
    setPicked(new Set())
    setRecallReason('')
    setRecallOpen(false)
  }
  const doAcknowledge = () => {
    acknowledgeParts({ partNos: pickedHere, by: currentPersona, actorName: FIXED_VENDOR_NAME })
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} acknowledged. You can now work on them.`)
    setPicked(new Set())
  }
  const doReturn = () => {
    returnParts({ partNos: pickedHere, by: currentPersona, actorName: FIXED_VENDOR_NAME, reason })
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} returned to the PIC.`)
    setPicked(new Set())
    setReason('')
    setReturnOpen(false)
  }

  if (!isVendor && !canReleaseParts) return null

  return (
    <section className="mb-4" aria-label="Part release status">
      <div className="mb-2 flex items-baseline justify-between gap-3 max-sm:flex-col max-sm:gap-1">
        <h2 className="text-[12px] font-semibold whitespace-nowrap text-[var(--color-text)]">{isVendor ? 'Parts released to you' : 'Release to vendor'}</h2>
        <span className="text-[10.5px] text-[var(--color-muted)]">
          {isVendor
            ? 'Acknowledge a part to start work on it, or return it to the PIC with a reason.'
            : 'Parts released to the vendor, waiting to be released, and returned by the vendor.'}
        </span>
      </div>
      <div className={`grid grid-cols-2 gap-3 ${isVendor ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
        {isVendor ? (
          <>
            <Tile title={`Acknowledgement overdue (> ${ACK_SLA_DAYS} d)`} count={tcount('ackOverdue')} color="#dc2626" active={slice === 'ackOverdue'} onClick={() => choose('ackOverdue')} />
            <Tile title="Planned dates pending" count={tcount('planPending')} color="#ea580c" active={slice === 'planPending'} onClick={() => choose('planPending')} />
            <Tile title={`Planning time exceeded (ack + ${PLAN_SLA_DAYS} d)`} count={tcount('planExceeded')} color="#991b1b" active={slice === 'planExceeded'} onClick={() => choose('planExceeded')} />
          </>
        ) : (
          <>
            <Tile title={`Release overdue (> ${RELEASE_SLA_DAYS} d)`} count={tcount('relOverdue')} color="#b45309" active={slice === 'relOverdue'} onClick={() => choose('relOverdue')} />
            <Tile title={`Acknowledgement overdue (> ${ACK_SLA_DAYS} d)`} count={tcount('ackOverdue')} color="#dc2626" active={slice === 'ackOverdue'} onClick={() => choose('ackOverdue')} />
            <Tile title="Vendor planned dates pending" count={tcount('planPending')} color="#ea580c" active={slice === 'planPending'} onClick={() => choose('planPending')} />
            <Tile title={`Planning time exceeded (ack + ${PLAN_SLA_DAYS} d)`} count={tcount('planExceeded')} color="#991b1b" active={slice === 'planExceeded'} onClick={() => choose('planExceeded')} />
          </>
        )}
      </div>
      <div className={`mt-3 grid grid-cols-2 gap-3 ${isVendor ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
        {isVendor ? (
          <>
            <Tile title="Awaiting my acknowledgement" count={counts.awaiting} color="#2563eb" active={slice === 'awaiting'} onClick={() => choose('awaiting')} />
            <Tile title="Acknowledged" count={counts.acknowledged} color="#16a34a" active={slice === 'acknowledged'} onClick={() => choose('acknowledged')} />
            <Tile title="Returned by me" count={counts.returned} color="#dc2626" active={slice === 'returned'} onClick={() => choose('returned')} />
          </>
        ) : (
          <>
            <Tile title="Released to vendor" count={counts.released} color="#2563eb" active={slice === 'released'} onClick={() => choose('released')} />
            <Tile title="Pending acknowledgement" count={counts.awaiting} color="#7c3aed" active={slice === 'awaiting'} onClick={() => choose('awaiting')} />
            <Tile title="Pending release" count={counts.pending} color="#d97706" active={slice === 'pending'} onClick={() => choose('pending')} />
            <Tile title="Returned by vendor" count={counts.returned} color="#dc2626" active={slice === 'returned'} onClick={() => choose('returned')} />
            <Tile title="Part Deleted" count={deletedRows.length} color="#991b1b" active={slice === 'deleted'} onClick={() => choose('deleted')} />
          </>
        )}
      </div>

      <div className="epmp-card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[11.5px] font-medium text-[var(--color-text)]">
            {shown.length} part{shown.length === 1 ? '' : 's'}
          </span>
          {notice && <span className="text-[10.5px] text-emerald-700" role="status">{notice}</span>}
          <div className="ml-auto flex items-center gap-2">
            {isVendor && (
              <>
                <Button variant="secondary" size="sm" disabled={pickedHere.length === 0} onClick={() => { setReason(''); setReturnOpen(true) }}>
                  Return selected ({pickedHere.length})
                </Button>
                <Button variant="primary" size="sm" disabled={pickedHere.length === 0} onClick={doAcknowledge}>
                  Acknowledge selected ({pickedHere.length})
                </Button>
              </>
            )}
            {!isVendor && canReleaseParts && (
              <>
                <Button variant="secondary" size="sm" disabled={pickedRecall.length === 0} onClick={() => { setRecallReason(''); setRecallOpen(true) }}>
                  Recall selected ({pickedRecall.length})
                </Button>
                <Button variant="primary" size="sm" disabled={pickedHere.length === 0} onClick={doRelease}>
                  Release selected ({pickedHere.length})
                </Button>
              </>
            )}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-center text-[11.5px] text-[var(--color-muted)]">No parts here.</p>
        ) : (
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0 bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="w-8 px-3 py-2">
                    {allPickable.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(allPickable))}
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 font-medium">Part</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ part, state }) => {
                  const ret = state === 'Returned' ? latestReturn(part.partNo, partAcks) : undefined
                  const rel = partReleases
                    .filter((r) => r.partNo === part.partNo)
                    .reduce<typeof partReleases[number] | undefined>((b, r) => (!b || r.at > b.at ? r : b), undefined)
                  return (
                    <tr key={part.partNo} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2">
                        {pickable(state, part) && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${part.partNo}`}
                            checked={picked.has(part.partNo)}
                            onChange={() => toggle(part.partNo)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#101828]">{part.partName}</div>
                        <div className="font-mono text-[10.5px] text-[var(--color-muted)]">{part.partNo}</div>
                      </td>
                      <td className="px-3 py-2">{part.model}</td>
                      <td className="px-3 py-2"><span className="font-mono text-[10.5px] text-[var(--color-muted)]">{part.vendorCode}</span>{part.vendorCode ? ': ' : ''}{part.vendorName}</td>
                      <td className="px-3 py-2">
                        {part.sourceDeleted ? (
                          <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">Deleted in {part.sourceDeleted.system}</span>
                        ) : (
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_CLS[state]}`}>{(isVendor ? VENDOR_LABEL : RELEASE_LABEL)[state]}</span>
                        )}
                      </td>
                      <td className="max-w-[360px] px-3 py-2 text-[10.5px] text-[var(--color-muted)]">
                        {part.sourceDeleted
                          ? `Deleted ${fmtDate(part.sourceDeleted.at.slice(0, 10))} · ${rel?.comment?.startsWith('Recalled automatically') ? 'recalled from the vendor automatically' : 'was not released to the vendor'} · ${entries.filter((e) => e.partNo === part.partNo).length} activity entries kept (back when reactivated)`
                          : state === 'Returned' && ret
                          ? `Returned ${fmtDate(ret.at.slice(0, 10))}: “${ret.reason}”`
                          : state === 'Pending'
                            ? ''
                            : rel
                              ? `Released ${fmtDate(rel.at.slice(0, 10))} by ${rel.by}`
                              : '—'}
                        {!part.sourceDeleted && (() => {
                          const t = timeline(part.partNo)
                          return t ? (
                            <div className={`mt-0.5 ${t.late ? 'font-semibold text-red-700' : 'text-[#475467]'}`}>
                              {t.late && '⚠ '}{t.text}
                              {state === 'Acknowledged' && <> · <Link to="/vendor-planning" className="font-semibold text-[var(--color-accent)] hover:underline">Vendor Planning</Link></>}
                            </div>
                          ) : null
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        title={`Recall ${pickedRecall.length} part${pickedRecall.length === 1 ? '' : 's'} from the vendor`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRecallOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" onClick={doRecall} disabled={!recallReason.trim()}>Recall</Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            The parts go back to <strong>Pending release</strong> and disappear from the vendor's queue until you release them again; the vendor then has to acknowledge them afresh.
            {recallAcked > 0 && <> {recallAcked} of them {recallAcked === 1 ? 'was' : 'were'} already acknowledged. Entries the vendor made are kept.</>}
          </p>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[var(--color-muted)]">Reason (required)</span>
            <textarea
              value={recallReason}
              onChange={(e) => setRecallReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
              placeholder="e.g. Drawing revision changed, part details need correcting"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title={`Return ${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} to the PIC`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={doReturn} disabled={!reason.trim()}>
              Return
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            The PIC sees your reason, fixes the part details and releases the part again. You cannot work on a returned part until then.
          </p>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-medium text-[var(--color-muted)]">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
              placeholder="e.g. Vendor code is wrong for this part"
            />
          </label>
        </div>
      </Modal>
    </section>
  )
}
