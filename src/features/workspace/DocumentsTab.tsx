import { useRef, useState } from 'react'
import { Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { getBlob } from '../../store/docBlobs'
import type { PersonaId } from '../../store/personaStore'
import { downloadBlob } from '../excel/xlsxIO'
import { fmtDate } from '../scope'

const MAX_BYTES = 10 * 1024 * 1024
/** Roles that may attach a document to a part's activity. Only the SIC may delete one. */
const CAN_UPLOAD: PersonaId[] = ['Vendor', 'PIC', 'SIC', 'DPM']

interface Props {
  entryId: string
  templateRowId: string
  activityId: string
  partNo: string
  persona: PersonaId
  /** Name logged against the person: the vendor company for a Vendor, the part's PIC for PIC roles. */
  actorName: string
  /** False when the activity is read-only for this part (for example Not applicable). */
  open: boolean
}

function fmtSize(b: number): string {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
}

/** Document list for one part's activity. Vendors see their own uploads, every other role sees all; only the SIC deletes. */
export function DocumentsTab({ entryId, templateRowId, activityId, partNo, persona, actorName, open }: Props) {
  const { documents, addDocument, deleteDocument, logAudit } = useQAStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const all = documents.filter((d) => d.entryId === entryId)
  const list = (persona === 'Vendor' ? all.filter((d) => d.uploadedBy === 'Vendor') : all).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const canUpload = open && CAN_UPLOAD.includes(persona)

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size === 0) { setError(`${file.name} is empty.`); continue }
        if (file.size > MAX_BYTES) { setError(`${file.name} is larger than 10 MB.`); continue }
        await addDocument(
          { entryId, templateRowId, activityId, partNo, name: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', uploadedBy: persona, uploadedByName: actorName },
          file
        )
      }
    } catch {
      setError('The file could not be stored in this browser.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  async function download(id: string, name: string) {
    const blob = await getBlob(id)
    if (!blob) { setError(`${name} is no longer stored in this browser.`); return }
    downloadBlob(blob, name)
    logAudit({ persona, actorName, action: 'Document downloaded', partNo, activityId, templateRowId, detail: name })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--color-muted)]">
          {persona === 'Vendor'
            ? 'Documents you uploaded for this part and activity.'
            : 'All documents uploaded for this part and activity, by the vendor and by MSIL.'}{' '}
          Uploads, downloads and deletions are recorded in the audit log.
        </p>
        {canUpload && (
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Uploading…' : '+ Upload document'}
            </Button>
            <input ref={input} type="file" multiple className="hidden" aria-label="Upload document" onChange={(e) => onFiles(e.target.files)} />
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {list.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--color-border)] py-8 text-center text-xs text-[var(--color-muted)]">
          No documents yet.{canUpload ? ' Use “+ Upload document” to add one (up to 10 MB each).' : ''}
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <th className="py-1.5 pr-2 font-medium">Document</th>
              <th className="py-1.5 pr-2 font-medium">Size</th>
              <th className="py-1.5 pr-2 font-medium">Uploaded by</th>
              <th className="py-1.5 pr-2 font-medium">On</th>
              <th className="py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id} className="border-b border-[var(--color-border)]">
                <td className="py-2 pr-2 font-medium text-[var(--color-text)] break-all">{d.name}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{fmtSize(d.sizeBytes)}</td>
                <td className="py-2 pr-2">{d.uploadedByName} <span className="text-[var(--color-muted)]">({d.uploadedBy})</span></td>
                <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(d.uploadedAt.slice(0, 10))}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => download(d.id, d.name)}>Download</Button>
                  {persona === 'SIC' &&
                    (confirmId === d.id ? (
                      <>
                        <Button variant="danger" size="sm" onClick={() => { deleteDocument(d.id, persona, actorName); setConfirmId(null) }}>Confirm delete</Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setConfirmId(d.id)}>Delete</Button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {persona !== 'SIC' && list.length > 0 && <p className="text-[11px] text-[var(--color-muted)]">Only the SIC can delete a document.</p>}
    </div>
  )
}
