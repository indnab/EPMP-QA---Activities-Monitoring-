import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Button } from '../../components'
import type { PersonaId } from '../../store/personaStore'
import { AiReviewIllustration } from './AiReviewIllustration'

interface Picked {
  kind: 'file' | 'text'
  label: string
}

const COPY: Record<'Vendor' | 'PIC', { brings: string; example: string }> = {
  Vendor: {
    brings: 'tables in Excel or CSV, pasted tables, emails, PDFs, scans, or plain sentences',
    example: 'All Swift parts: PPVT closed, tool ready, target 30 Oct'
  },
  PIC: {
    brings: 'review notes, meeting minutes, email threads, marked-up drawing lists, or typed notes',
    example: 'ORVM LH drawing available, proprietary, target 12 Nov'
  }
}

const RULES = [
  'Nothing is submitted automatically. You review every value first.',
  'Attachments, other roles’ fields, calculated fields, parts outside your scope, and submitted, approved or not-applicable rows are never touched.',
  'AI never approves, edits or sends back on anyone’s behalf.',
  'For fields that only accept listed values, AI may pick the nearest allowed value. The pick is shown as an exact or closest match, with the allowed list, and closest matches always need your decision.',
  'Anything AI could not update (no fitting value, invalid date, fetched field, unknown part) is listed with the reason. Nothing is changed for it.',
  'AI-assisted values are marked in the history with the source file and the person who reviewed them.'
]

interface Props {
  role: PersonaId
  /** Starts expanded on My Work; the grid keeps it folded away so the table stays in view. */
  defaultOpen?: boolean
}

/**
 * Entry point for the planned Gen AI import (user story AI-1). It is a placeholder: choosing a file or pasting text
 * only shows what was picked and states that AI mapping is not part of this prototype. Nothing is read or changed.
 */
export function AiImportPanel({ role, defaultOpen = true }: Props) {
  const copy = COPY[role === 'PIC' ? 'PIC' : 'Vendor']
  const fileRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [pasted, setPasted] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [tried, setTried] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  function pickFile(file: File | undefined) {
    if (!file) return
    setPicked({ kind: 'file', label: `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)` })
    setTried(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files[0])
  }

  function runImport() {
    if (pasted.trim()) setPicked({ kind: 'text', label: `Pasted text (${pasted.trim().length} characters)` })
    setTried(true)
  }

  function reset() {
    setPicked(null)
    setPasted('')
    setTried(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const canImport = !!picked || pasted.trim().length > 0

  return (
    <details open={defaultOpen} data-tour="ai-import" className="epmp-card mb-4 px-5 py-3.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-[var(--color-text)]">Import with AI</span>
        <span className="rounded bg-[#ede9fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#6d28d9]">Placeholder</span>
        <span className="text-[11px] text-[var(--color-muted)]">Upload or paste what you already have instead of typing it in.</span>
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-[11px] leading-5 text-[var(--color-muted)]">
          Bring anything: {copy.brings}. For example: <em>“{copy.example}”</em>. AI will match it to parts and the fields you are allowed
          to fill, then ask you to review before anything is saved.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-center ${dragOver ? 'border-[var(--color-accent)] bg-secondary' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}
          >
            <p className="text-[11px] text-[var(--color-muted)]">Drop a file here — any type</p>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Choose a file
            </Button>
            <input ref={fileRef} type="file" className="sr-only" aria-label="Choose a file to import" onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>

          <label className="flex flex-col gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Or paste text
            <textarea
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value)
                setTried(false)
              }}
              rows={4}
              placeholder="Paste a table, an email, notes or a sentence…"
              className="min-h-[88px] resize-y rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-[var(--color-text)]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" disabled={!canImport} onClick={runImport}>
            Import
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setReviewOpen(true)}>
            See how the review step works
          </Button>
          {(picked || pasted) && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
          {picked && <span className="text-[11px] text-[var(--color-text)]">Selected: {picked.label}</span>}
        </div>

        {tried && (
          <div className="rounded-lg border border-[#ddd6fe] bg-[#f5f3ff] px-3 py-2 text-[11px] text-[#5b21b6]" role="status">
            AI mapping is not part of this prototype, so <strong>nothing was read and nothing changed</strong>. In the real system you
            would now see a review screen with the proposed values. Use “See how the review step works” for an illustration.
          </div>
        )}

        <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-[var(--color-muted)]">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <AiReviewIllustration open={reviewOpen} onClose={() => setReviewOpen(false)} role={role} />
    </details>
  )
}
