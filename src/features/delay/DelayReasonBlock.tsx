import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '../../components'
import { makeEntryId } from '../../domain'
import type { ActivityDefinition, ActivityEntry, TemplateRow } from '../../domain'
import { useQAStore } from '../../store/qaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { getPicOn } from '../../engine'
import { DEMO_TODAY, fmtDate } from '../scope'
import { DelayReasonDialog } from './DelayReasonDialog'
import { daysBetween, delayStateOf, needsVendorReason, vendorHoldsDelay } from './delay'
import type { DelayItem } from './delay'

interface Props {
  activity: ActivityDefinition
  row: TemplateRow
  partNo: string
  partName: string
  entry: ActivityEntry | undefined
  /** Planned end of the activity; empty while awaiting an MRD. */
  plannedEnd: string
  ryg: string
  notApplicable: boolean
  /** Bump this number to open the vendor pop-up (the form’s Submit does this when a reason is missing). */
  openRequest: number
}

/** Delay-reason card for the part form: vendor pop-up and status, PIC accept / send back. */
export function DelayReasonBlock({ activity, row, partNo, partName, entry, plannedEnd, ryg, notApplicable, openRequest }: Props) {
  const { delayReasons, parts, picAssignments, submitDelayReasons, decideDelayReasons } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const entryId = makeEntryId(row.id, partNo)
  const { state, latest } = delayStateOf(entryId, delayReasons)
  const held = vendorHoldsDelay(activity, entry, ryg, notApplicable)
  const isVendor = currentPersona === 'Vendor'
  const canDecide = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'
  const [dialog, setDialog] = useState(false)
  const [sendBack, setSendBack] = useState(false)
  const [comment, setComment] = useState('')

  const item: DelayItem = useMemo(
    () => ({
      key: entryId, rowId: row.id, partNo, partName, activityId: activity.id, activityName: activity.name, milestoneId: row.milestoneId,
      plannedEnd, daysLate: Math.max(1, plannedEnd ? daysBetween(plannedEnd, DEMO_TODAY) : 1),
      sentBackComment: state === 'SentBack' ? latest?.decisionComment : undefined
    }),
    [entryId, row.id, row.milestoneId, partNo, partName, activity.id, activity.name, plannedEnd, state, latest]
  )
  const mustGive = isVendor && held && needsVendorReason(state)

  // Pop up once when the vendor opens a late activity that still needs a reason.
  useEffect(() => {
    if (mustGive) setDialog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId])
  useEffect(() => {
    if (openRequest > 0 && mustGive) setDialog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest])

  const part = parts.find((p) => p.partNo === partNo)
  const picName = (currentPersona === 'PIC' && part ? getPicOn(part, picAssignments, DEMO_TODAY).name : '') || undefined

  // Nothing to show: not late with the vendor and no reason on file.
  if (!latest && !held) return null

  const submit = (items: DelayItem[], category: string, remark: string, revisedDate: string) => {
    submitDelayReasons({
      items: items.map((i) => ({ rowId: i.rowId, partNo: i.partNo, activityId: i.activityId, plannedEnd: i.plannedEnd })),
      category, remark, revisedDate, by: currentPersona, actorName: FIXED_VENDOR_NAME
    })
    setDialog(false)
  }

  const tone =
    state === 'Accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : state === 'Submitted' ? 'border-blue-200 bg-blue-50 text-blue-900'
        : 'border-red-200 bg-red-50 text-red-900'
  const title =
    state === 'Accepted' ? 'Delay reason accepted'
      : state === 'Submitted' ? 'Delay reason awaiting the PIC'
        : state === 'SentBack' ? 'Delay reason sent back by the PIC'
          : 'Delayed: reason needed from the vendor'

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        {plannedEnd && <span className="text-xs opacity-80">Planned end {fmtDate(plannedEnd)}</span>}
        {mustGive && (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setDialog(true)}>
            {state === 'SentBack' ? 'Give a new reason' : 'Give reason'}
          </Button>
        )}
      </div>
      {latest && (
        <div className="mt-1.5 text-[12px]">
          <div>
            <strong>{latest.category}</strong>
            {latest.remark ? `: ${latest.remark}` : ''}
            {latest.revisedDate ? ` · new date ${fmtDate(latest.revisedDate)}` : ''}
          </div>
          <div className="text-[11px] opacity-80">Given by {latest.by} on {fmtDate(latest.at.slice(0, 10))}</div>
          {state === 'SentBack' && latest.decisionComment && (
            <div className="mt-1 rounded bg-white/70 px-2 py-1 text-[11.5px]">PIC: “{latest.decisionComment}”</div>
          )}
          {state === 'Accepted' && latest.decidedBy && <div className="text-[11px] opacity-80">Accepted by {latest.decidedBy}</div>}
        </div>
      )}
      {!latest && !isVendor && <p className="mt-1 text-[12px]">The activity is past its planned end and the vendor has not yet given a reason.</p>}
      {canDecide && state === 'Submitted' && latest && (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setComment(''); setSendBack(true) }}>
            Send back
          </Button>
          <Button variant="primary" size="sm" onClick={() => decideDelayReasons({ ids: [latest.id], decision: 'Accepted', by: currentPersona, actorName: picName })}>
            Accept reason
          </Button>
        </div>
      )}

      <DelayReasonDialog open={dialog} onClose={() => setDialog(false)} items={[item]} onSubmit={submit} />
      <Modal
        open={sendBack}
        onClose={() => setSendBack(false)}
        title="Send the reason back"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setSendBack(false)}>Cancel</Button>
            <Button
              variant="danger" size="md" disabled={!comment.trim()}
              onClick={() => {
                if (latest) decideDelayReasons({ ids: [latest.id], decision: 'SentBack', comment, by: currentPersona, actorName: picName })
                setSendBack(false)
              }}
            >
              Send back
            </Button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">What should the vendor fix? (required)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px]" placeholder="e.g. Give the date the tool will be ready" />
        </label>
      </Modal>
    </div>
  )
}
