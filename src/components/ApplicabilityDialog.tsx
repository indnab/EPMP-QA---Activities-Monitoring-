import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ApplicabilityDialogProps {
  open: boolean
  /** true = marking Not applicable, false = marking applicable again */
  markNotApplicable: boolean
  /** Short description of what is being changed, e.g. "3 parts" or "Starter Motor Assembly". */
  subject: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}

/**
 * Confirm dialog for changing part applicability. One optional reason applies to every selected part.
 * The body is mounted only while open, so the reason field resets each time.
 */
export function ApplicabilityDialog({ open, markNotApplicable, subject, onCancel, onConfirm }: ApplicabilityDialogProps) {
  if (!open) return null
  return (
    <ApplicabilityDialogBody
      markNotApplicable={markNotApplicable}
      subject={subject}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function ApplicabilityDialogBody({
  markNotApplicable,
  subject,
  onCancel,
  onConfirm
}: Omit<ApplicabilityDialogProps, 'open'>) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title={markNotApplicable ? 'Mark Not applicable' : 'Mark applicable again'}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant={markNotApplicable ? 'primary' : 'secondary'} size="sm" onClick={() => onConfirm(reason)}>
            {markNotApplicable ? 'Mark Not applicable' : 'Mark applicable'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-text)]">
        {markNotApplicable
          ? `This activity will be marked Not applicable for ${subject}. They stay in the totals as their own "Not applicable" group, are excluded from completion %, and become read-only until reversed.`
          : `This activity will apply again for ${subject}. Anything already entered is kept.`}
      </p>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason (optional)</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={markNotApplicable ? 'e.g. Plastic part, no sheet metal content' : 'e.g. Marked by mistake'}
          className="w-full rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          autoFocus
        />
      </label>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        This is logged with your name and the date in each part's history.
      </p>
    </Modal>
  )
}
