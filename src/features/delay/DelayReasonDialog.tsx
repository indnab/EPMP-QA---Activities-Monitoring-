import { useEffect, useState } from 'react'
import { Button, Modal } from '../../components'
import { DELAY_REASON_CATEGORIES, DELAY_REASON_OTHERS } from '../../domain'
import { fmtDate } from '../scope'
import type { DelayItem } from './delay'

interface Props {
  open: boolean
  onClose: () => void
  /** Late activities that need a reason. All are ticked to start with. */
  items: DelayItem[]
  onSubmit: (items: DelayItem[], category: string, remark: string, revisedDate: string) => void
}

const fieldCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'

/**
 * Pop-up the vendor sees when an activity it holds is late. One reason can cover several activities. The PIC then accepts
 * the reason or sends it back, and a sent-back reason comes here again.
 */
export function DelayReasonDialog({ open, onClose, items, onSubmit }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState('')
  const [remark, setRemark] = useState('')
  const [revised, setRevised] = useState('')

  useEffect(() => {
    if (open) {
      setPicked(new Set(items.map((i) => i.key)))
      setCategory('')
      setRemark('')
      setRevised('')
    }
  }, [open, items])

  const chosen = items.filter((i) => picked.has(i.key))
  const needsRemark = category === DELAY_REASON_OTHERS
  const valid = chosen.length > 0 && !!category && (!needsRemark || remark.trim().length > 0)
  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={items.length > 1 ? 'Reason for delay' : 'Reason for delay'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Not now
          </Button>
          <Button variant="primary" size="md" disabled={!valid} onClick={() => onSubmit(chosen, category, remark.trim(), revised)}>
            Submit reason{chosen.length > 1 ? ` for ${chosen.length}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
          {items.length === 1 ? 'This activity is' : `${items.length} activities are`} past the planned end date. Tell the PIC why. The PIC will
          accept the reason or send it back. You cannot submit the activity until a reason is given.
        </div>

        <div className="max-h-[200px] overflow-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[11.5px]">
            <tbody>
              {items.map((i) => (
                <tr key={i.key} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="w-8 px-3 py-2 align-top">
                    <input type="checkbox" aria-label={`Include ${i.partNo} ${i.activityName}`} checked={picked.has(i.key)} onChange={() => toggle(i.key)} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-[#101828]">{i.activityName}</div>
                    <div className="text-[10.5px] text-[var(--color-muted)]">
                      {i.partName} · <span className="font-mono">{i.partNo}</span> · {i.milestoneId}
                    </div>
                    {i.sentBackComment && (
                      <div className="mt-1 rounded bg-[#fff7ed] px-2 py-1 text-[10.5px] text-[#9a3412]">
                        Sent back by the PIC: “{i.sentBackComment}”
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top text-[11px]">
                    <div className="text-[var(--color-muted)]">Planned end {fmtDate(i.plannedEnd)}</div>
                    <div className="font-semibold text-[#b91c1c]">{i.daysLate} day{i.daysLate === 1 ? '' : 's'} late</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason (required)</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls} aria-label="Reason for delay">
            <option value="">Choose a reason…</option>
            {DELAY_REASON_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">
            Remark {needsRemark ? '(required for Others)' : '(optional)'}
          </span>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className={fieldCls} placeholder="What happened, and what is being done" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">New expected completion date (optional)</span>
          <input type="date" value={revised} onChange={(e) => setRevised(e.target.value)} className={`${fieldCls} w-48`} />
        </label>
      </div>
    </Modal>
  )
}
