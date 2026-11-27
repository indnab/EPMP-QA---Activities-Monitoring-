import { useMemo, useState } from 'react'
import { PartIntakePage } from '../intake/PartIntakePage'
import { PageHeader, Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { getPicOn } from '../../engine'
import type { PartRecord } from '../../domain'
import { DEMO_TODAY } from '../scope'

const inputCls =
  'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[10.5px] text-[#344054] placeholder-[var(--color-muted)]'

export function PartsPage() {
  const {
    parts: allParts,
    entries,
    picAssignments,
    transferPart,
    releasePart
  } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canManage = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  /** Dummy part numbers are raised by the Department Co-ordinator, a PIC or Admin. */
  const canRelease = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const doRelease = (part: PartRecord, next: boolean) => {
    const actorName = currentPersona === 'PIC' ? getPicOn(part, picAssignments, DEMO_TODAY).name || undefined : undefined
    releasePart({ partNo: part.partNo, released: next, by: currentPersona, actorName })
  }

  const intakeActions = useMemo(
    () => ({ canRelease, canEcn: canManage, onRelease: doRelease, onEcn: (p: PartRecord) => openXfer(p) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canRelease, canManage]
  )

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

  return (
    <div>
      <PageHeader
        title="Part Intake"
        section="Modules"
        description="Parts received from SAP and ENOVIA, adding a part by hand, releasing parts to the vendor and ECN history transfer."
      />

      <PartIntakePage embedded actions={intakeActions} />

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
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[10.5px] text-[#344054]">
              ECN transfer stays within the same vendor: <strong>{xfer.vendorName}</strong>. The revised part must belong to this vendor.
            </p>
            <label className="block">
              <span className="mb-1 block text-[10.5px] font-medium text-[var(--color-muted)]">New (revised) part number</span>
              <input value={toNo} onChange={(e) => setToNo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 31100-M74LD9" />
              {toNo.trim() === xfer.partNo && (
                <span className="mt-1 block text-[10.5px] text-red-600">The new number must differ from the old one.</span>
              )}
              {vendorMismatch && (
                <span className="mt-1 block text-[10.5px] text-red-600">
                  {toTarget!.partNo} belongs to {toTarget!.vendorName}, not {xfer.vendorName}. ECN transfer is only allowed within the same vendor.
                </span>
              )}
              {toExists && !vendorMismatch && toNo.trim() !== xfer.partNo && (
                <span className="mt-1 block text-[10.5px] text-amber-700">
                  This part already exists (same vendor) — history will be merged onto it (existing entries are kept).
                </span>
              )}
              {!toExists && toNo.trim() && (
                <span className="mt-1 block text-[10.5px] text-[var(--color-muted)]">
                  New part will be created under {xfer.vendorName}.
                </span>
              )}
            </label>
            {!toExists && (
              <label className="block">
                <span className="mb-1 block text-[10.5px] font-medium text-[var(--color-muted)]">New part name (optional)</span>
                <input
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder={xfer.partName}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[10.5px] font-medium text-[var(--color-muted)]">Reason / ECN reference (optional)</span>
              <input value={xreason} onChange={(e) => setXreason(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
