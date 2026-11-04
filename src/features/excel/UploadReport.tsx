import { Button } from '../../components'

export interface UploadIssue {
  /** Excel row number, 0 when the whole file is the problem. */
  row: number
  part: string
  message: string
}
export interface UploadSummary {
  fileName: string
  rowsRead: number
  rowsApplied: number
  cellsStaged: number
  issues: UploadIssue[]
}

/** Result of an Excel upload: what was staged for review and what was left out, with the reason for each. */
export function UploadReport({ summary, onClose }: { summary: UploadSummary; onClose: () => void }) {
  const shown = summary.issues.slice(0, 60)
  return (
    <div role="status" className="epmp-card mb-4 border-l-4 border-l-[#2266f5] px-4 py-3 text-[12px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--color-text)]">Excel loaded: {summary.fileName}</div>
          <p className="mt-0.5 text-[var(--color-muted)]">
            {summary.rowsRead} row{summary.rowsRead !== 1 ? 's' : ''} read, {summary.cellsStaged} value{summary.cellsStaged !== 1 ? 's' : ''} staged on {summary.rowsApplied} row
            {summary.rowsApplied !== 1 ? 's' : ''}. <strong>Nothing is saved or submitted yet.</strong> Review the staged values, then save or submit them.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Dismiss</Button>
      </div>
      {summary.issues.length > 0 && (
        <div className="mt-2 rounded border border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-[#78350f]">
          <div className="mb-1 font-semibold">{summary.issues.length} thing{summary.issues.length !== 1 ? 's' : ''} left out</div>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-4">
            {shown.map((i, n) => (
              <li key={n}>{i.row ? `Row ${i.row}` : 'File'}{i.part ? ` (${i.part})` : ''}: {i.message}</li>
            ))}
            {summary.issues.length > shown.length && <li>…and {summary.issues.length - shown.length} more</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
