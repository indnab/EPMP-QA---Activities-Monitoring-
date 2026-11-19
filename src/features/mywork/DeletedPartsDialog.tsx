/**
 * "Part Deleted" list: parts that SAP or ENOVIA deleted (e.g. dropped during model development). They are off the
 * work screens, but their entries are kept; when the system activates a part again it is back with all its data.
 */
import { Modal } from '../../components'
import type { PartRecord } from '../../domain'
import { vendorLabel } from '../../domain/people'
import { useQAStore } from '../../store/qaStore'
import { fmtDate } from '../scope'

export function DeletedPartsDialog({ parts, onClose }: { parts: PartRecord[]; onClose: () => void }) {
  const { entries } = useQAStore()
  const rows = [...parts].sort((a, b) => (b.sourceDeleted?.at ?? '').localeCompare(a.sourceDeleted?.at ?? ''))
  return (
    <Modal open onClose={onClose} title={`Part Deleted (${parts.length})`} size="lg">
      <p className="mb-3 text-[11.5px] text-[#475467]">
        Parts deleted in SAP or ENOVIA. They are not tracked while deleted, and their data is kept. When SAP or ENOVIA
        activates a part again, it is active in EPMP again with all its previous data.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-[11.5px] text-[var(--color-muted)]">No deleted parts.</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Deleted in</th>
                <th className="px-3 py-2">Deleted on</th>
                <th className="px-3 py-2 text-right">Activity entries kept</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.partNo} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2"><span className="font-mono">{p.partNo}</span> <span className="text-[var(--color-muted)]">{p.partName}</span></td>
                  <td className="px-3 py-2">{p.model}</td>
                  <td className="px-3 py-2">{vendorLabel(p.vendorName, p.vendorCode)}</td>
                  <td className="px-3 py-2"><span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{p.sourceDeleted?.system ?? '—'}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.sourceDeleted ? fmtDate(p.sourceDeleted.at.slice(0, 10)) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{entries.filter((e) => e.partNo === p.partNo).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
