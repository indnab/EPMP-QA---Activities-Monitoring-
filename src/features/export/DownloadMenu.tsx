/**
 * Page-level "Download" control.
 *
 * Drop <DownloadMenu title="Exception Management" /> into a page's PageHeader `actions` slot (or any
 * toolbar). On click it scans the page for <ExportSection> blocks, lists them as checkboxes (all ticked
 * by default) and lets the user pick PDF, PowerPoint or Excel. Unticking a section leaves it out.
 */
import { useState } from 'react'
import { Button } from '../../components'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { collectSections } from './ExportSection'
import { runExport, type ExportFormat } from './exportPage'

const FORMATS: { id: ExportFormat; label: string; icon: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', icon: 'file-lines', hint: 'One page per section' },
  { id: 'pptx', label: 'PowerPoint', icon: 'presentation', hint: 'One slide per section' },
  { id: 'xlsx', label: 'Excel', icon: 'table', hint: 'Tables as sheets' },
]

interface DownloadMenuProps {
  /** Document title — used for the cover and the filename. Defaults to the page breadcrumb if omitted. */
  title: string
  /** Button size, to match the host toolbar. */
  size?: 'sm' | 'md'
  variant?: 'primary' | 'secondary'
}

interface Row {
  id: string
  label: string
  el: HTMLElement
  checked: boolean
}

export function DownloadMenu({ title, size = 'sm', variant = 'secondary' }: DownloadMenuProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    const found = collectSections().map((s) => ({ id: s.id, label: s.label, el: s.el, checked: s.defaultOn }))
    setRows(found)
    setError(null)
    setOpen(true)
  }

  const selectedCount = rows.filter((r) => r.checked).length
  const allOn = rows.length > 0 && selectedCount === rows.length

  function toggle(id: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)))
  }
  function toggleAll() {
    const next = !allOn
    setRows((rs) => rs.map((r) => ({ ...r, checked: next })))
  }

  async function doExport() {
    const chosen = rows.filter((r) => r.checked)
    if (chosen.length === 0) {
      setError('Pick at least one section to download.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await runExport({
        format,
        title,
        sections: chosen.map((r) => ({ id: r.id, label: r.label, el: r.el })),
      })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={openDialog}
        data-export-ignore="true"
        aria-label="Download this page"
      >
        <Icon name="download" size={14} /> Download
      </Button>

      <Modal
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        title="Download page"
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={doExport} disabled={busy || selectedCount === 0}>
              {busy ? 'Preparing…' : `Download ${format.toUpperCase()}`}
            </Button>
          </>
        }
      >
        {/* Format picker */}
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Format</p>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => {
              const active = format === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-secondary)]'
                      : 'border-[var(--color-border)] hover:bg-[#fafafa]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-text)]">
                    <Icon name={f.icon as never} size={14} /> {f.label}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]">{f.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Section checklist */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Include ({selectedCount}/{rows.length})
            </p>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] font-medium text-[var(--color-primary)] hover:underline"
              >
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-[12px] text-[var(--color-muted)]">
              Nothing on this page is marked for export yet.
            </p>
          ) : (
            <ul className="max-h-[40vh] overflow-auto rounded-lg border border-[var(--color-border)]">
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-2.5 px-3 py-2 text-[12px] ${
                    i > 0 ? 'border-t border-[var(--color-border)]' : ''
                  }`}
                >
                  <input
                    id={`exp-${r.id}`}
                    type="checkbox"
                    checked={r.checked}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <label htmlFor={`exp-${r.id}`} className="flex-1 cursor-pointer text-[var(--color-text)]">
                    {r.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-2 text-[11px] text-[var(--color-ryg-red,#dc2626)]">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
