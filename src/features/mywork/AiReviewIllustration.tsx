import { useState } from 'react'
import { Button, Modal } from '../../components'
import type { PersonaId } from '../../store/personaStore'

type Decision = 'pending' | 'accepted' | 'edited' | 'rejected'

/**
 * For fields that only accept listed values (dropdowns). AI may read free text and pick the nearest allowed value, but the
 * pick is always shown: 'exact' = the text names the value, 'closest' = AI interpreted the text. Closest picks are never
 * accepted in bulk; they need an explicit decision.
 */
interface DropdownMatch {
  kind: 'exact' | 'closest'
  allowed: string[]
  /** One line on how the text was read, e.g. "on going" read as "Under testing". */
  why: string
}

interface Proposal {
  id: string
  source: string
  part: string
  partNo: string
  field: string
  current: string
  proposed: string
  confidence: number
  match?: DropdownMatch
}

/** An update the AI could not make. Always listed, never silently dropped. */
interface Failure {
  id: string
  source: string
  part: string
  partNo: string
  field: string
  reason: string
  /** When set, the person can pick a valid value here instead. */
  allowed?: string[]
}

interface Skipped {
  source: string
  reason: string
}

interface Sample {
  fileName: string
  proposals: Proposal[]
  failures: Failure[]
  skipped: Skipped[]
}

// Static sample content. Part numbers and field names come from the seed data, but none of this is read from a file.
const TESTING = ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected']
const SUBMISSION = ['Submitted', 'Not submitted']
const AVAIL = ['Available', 'Not available']
const CLASS = ['MSIL', 'Proprietary']
const APPLIC = ['Applicable', 'Not applicable']
const SAMPLES: Record<'Vendor' | 'PIC', Sample> = {
  Vendor: {
    fileName: 'minda_status_mail.eml',
    proposals: [
      { id: 'v1', source: '"Starter motor inspection done"', part: 'Starter Motor Assembly', partNo: '31100-M74LD0', field: 'Inspection completed', current: '—', proposed: 'Yes', confidence: 96 },
      { id: 'v2', source: '"Alternator HO – target 30 Oct"', part: 'Alternator High-Output', partNo: '31100-M74LD2', field: 'Target date for achieving accuracy', current: '—', proposed: '30 Oct 2026', confidence: 88 },
      { id: 'v3', source: '"ORVM LH around 90 something %"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Accuracy achieved (%)', current: '—', proposed: '92', confidence: 61 },
      { id: 'v4', source: '"ORVM LH lab testing is on going"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Testing status', current: '—', proposed: 'Under testing', confidence: 84,
        match: { kind: 'closest', allowed: TESTING, why: 'Read “on going” as Under testing' } },
      { id: 'v5', source: '"Samples submitted"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Sample submission', current: '—', proposed: 'Submitted', confidence: 95,
        match: { kind: 'exact', allowed: SUBMISSION, why: 'Text names the value' } }
    ],
    failures: [
      { id: 'vf1', source: '"Testing mostly done, a few pending"', part: 'Alternator High-Output', partNo: '31100-M74LD2', field: 'Testing status',
        reason: '“mostly done, a few pending” does not fit any allowed value, so nothing was changed.', allowed: TESTING },
      { id: 'vf2', source: '"Deviation approved last week"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Deviation approval status',
        reason: 'This field is fetched from E-Doc and cannot be set from a file. Nothing was changed.' },
      { id: 'vf3', source: '"Door skin LH ready"', part: '—', partNo: 'not found', field: '—',
        reason: 'No part matching this text is released to you, so no field could be chosen.' }
    ],
    skipped: [{ source: '"Photos attached"', reason: 'Attachment fields are never filled by AI. Add the file in the part form.' }]
  },
  PIC: {
    fileName: 'drawing_review_minutes.pdf',
    proposals: [
      { id: 'p1', source: '"ORVM LH drawing available"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Drawing availability', current: '—', proposed: 'Available', confidence: 97,
        match: { kind: 'exact', allowed: AVAIL, why: 'Text names the value' } },
      { id: 'p2', source: '"…proprietary…"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Part classification', current: '—', proposed: 'Proprietary', confidence: 93,
        match: { kind: 'closest', allowed: CLASS, why: 'Matched the word “proprietary” inside a longer sentence' } },
      { id: 'p3', source: '"…target 12 Nov"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Target date – Proprietary part', current: '—', proposed: '12 Nov 2026', confidence: 90 },
      { id: 'p4', source: '"alternator drawing – not needed?"', part: 'Alternator High-Output', partNo: '31100-M74LD2', field: 'Drawing – Applicable / Not applicable', current: '—', proposed: 'Not applicable', confidence: 54,
        match: { kind: 'closest', allowed: APPLIC, why: 'Read “not needed?” as Not applicable (the text is a question)' } }
    ],
    failures: [
      { id: 'pf1', source: '"classification: bought-out"', part: 'Alternator High-Output', partNo: '31100-M74LD2', field: 'Part classification',
        reason: '“bought-out” is not MSIL or Proprietary and is too far from either, so nothing was changed.', allowed: CLASS },
      { id: 'pf2', source: '"target date 31 Feb"', part: 'ORVM Outer Mirror LH', partNo: '84701-M55R10', field: 'Target date – Proprietary part',
        reason: '31 Feb is not a real date. Nothing was changed. Enter the date in the part form.' }
    ],
    skipped: [
      { source: '"Approve the vendor submission for the sill"', reason: 'AI never approves, edits or sends back on the PIC’s behalf.' },
      { source: '"Door skin drawing – Dzire"', reason: 'This part is outside your section.' }
    ]
  }
}

function confTone(c: number): string {
  if (c >= 90) return 'bg-[#ecfdf5] text-[#047857]'
  if (c >= 75) return 'bg-[#fffbeb] text-[#b45309]'
  return 'bg-[#fef2f2] text-[#b91c1c]'
}

const decisionLabel: Record<Decision, string> = { pending: 'Needs your decision', accepted: 'Accepted', edited: 'Edited by you', rejected: 'Rejected' }

function AiFilledFlagDemo() {
  const [value, setValue] = useState('Available')
  const [aiFilled, setAiFilled] = useState(true)
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
      <p className="mb-2 text-[11px] font-semibold text-[var(--color-text)]">In the grid, AI-filled cells are flagged until you review them</p>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={value}
          aria-label="Drawing availability (illustration)"
          onChange={(e) => {
            setValue(e.target.value)
            setAiFilled(false)
          }}
          className={`h-8 w-40 rounded-md border px-2 text-[11px] ${aiFilled ? 'border-[#c4b5fd] bg-[#f5f3ff]' : 'border-[var(--color-border)] bg-white'}`}
        />
        {aiFilled ? (
          <span className="flex flex-col gap-0.5">
            <span className="w-fit rounded bg-[#ede9fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#6d28d9]">AI-filled</span>
            <span className="text-[10px] text-[var(--color-muted)]">Closest match to “ORVM LH drawing available”; allowed: Available · Not available</span>
          </span>
        ) : (
          <span className="text-[11px] text-[var(--color-muted)]">Edited by you — flag removed and recorded in the history</span>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-[var(--color-muted)]">Try changing the text: the flag clears when you edit.</p>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  role: PersonaId
}

/**
 * Static illustration of the AI review screen (user stories AI-1 and AI-2). Nothing here reads a file or calls an
 * AI: the rows are fixed samples, and no button saves or submits anything.
 */
export function AiReviewIllustration({ open, onClose, role }: Props) {
  const sample = SAMPLES[role === 'PIC' ? 'PIC' : 'Vendor']
  const [threshold, setThreshold] = useState(90)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  const decisionOf = (id: string): Decision => decisions[id] ?? 'pending'
  const pendingCount = sample.proposals.filter((p) => decisionOf(p.id) === 'pending').length
  const failedOpen = sample.failures.filter((f) => !resolved[f.id]).length
  const closestCount = sample.proposals.filter((p) => p.match?.kind === 'closest').length

  function acceptAbove() {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const p of sample.proposals) if (p.confidence >= threshold && p.match?.kind !== 'closest' && (next[p.id] ?? 'pending') === 'pending') next[p.id] = 'accepted'
      return next
    })
  }

  function edit(id: string, value: string) {
    setEdited((prev) => ({ ...prev, [id]: value }))
    setDecisions((prev) => ({ ...prev, [id]: 'edited' }))
  }

  function inactive(label: string) {
    setMessage(`“${label}” is not active in this prototype. Nothing was saved or submitted.`)
  }

  const submitLocked = !reviewed

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review AI-filled values"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => inactive('Save as draft')}>
            Save as draft
          </Button>
          <Button variant="secondary" size="sm" disabled={submitLocked} onClick={() => inactive('Edit and submit')}>
            Edit and submit
          </Button>
          <Button variant="primary" size="sm" disabled={submitLocked} onClick={() => inactive('Confirm and submit')}>
            Confirm and submit
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11px] text-[#92400e]">
          <strong>Illustration only.</strong> This shows how the review step is intended to work. The rows below are fixed samples
          for the file <span className="font-mono">{sample.fileName}</span>; no AI runs and no data changes.
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <label className="flex items-center gap-2">
            Accept everything at or above
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              aria-label="Confidence threshold"
            />
            <strong className="w-9 text-[var(--color-text)]">{threshold}%</strong>
          </label>
          <Button variant="secondary" size="sm" onClick={acceptAbove}>
            Accept these
          </Button>
          <span className="ml-auto text-[var(--color-muted)]">
            {pendingCount} still need your decision
            {failedOpen > 0 && <span className="font-medium text-[#b91c1c]"> · {failedOpen} could not be updated</span>}
          </span>
        </div>
        {closestCount > 0 && (
          <p className="-mt-1 text-[10.5px] text-[var(--color-muted)]">
            Where a field only accepts listed values, AI picks the nearest one and shows how. Closest-match rows are never accepted in bulk.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[var(--color-surface)] text-left text-[10.5px] uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-2 py-2 font-semibold">Source text</th>
                <th className="px-2 py-2 font-semibold">Part</th>
                <th className="px-2 py-2 font-semibold">Field</th>
                <th className="px-2 py-2 font-semibold">Current</th>
                <th className="px-2 py-2 font-semibold">Proposed</th>
                <th className="px-2 py-2 font-semibold">Confidence</th>
                <th className="px-2 py-2 font-semibold">Decision</th>
              </tr>
            </thead>
            <tbody>
              {sample.proposals.map((p) => {
                const d = decisionOf(p.id)
                return (
                  <tr key={p.id} className={`border-t border-[var(--color-border)] ${d === 'rejected' ? 'opacity-55' : ''}`}>
                    <td className="px-2 py-1.5 italic text-[var(--color-muted)]">{p.source}</td>
                    <td className="px-2 py-1.5">
                      <span className="block font-medium text-[var(--color-text)]">{p.part}</span>
                      <span className="font-mono text-[10px] text-[var(--color-muted)]">{p.partNo}</span>
                    </td>
                    <td className="px-2 py-1.5">{p.field}</td>
                    <td className="px-2 py-1.5 text-[var(--color-muted)]">{p.current}</td>
                    <td className="px-2 py-1.5">
                      {editing === p.id ? (
                        p.match ? (
                          <select
                            autoFocus
                            value={edited[p.id] ?? p.proposed}
                            aria-label={`Choose value for ${p.field}`}
                            onChange={(e) => { edit(p.id, e.target.value); setEditing(null) }}
                            onBlur={() => setEditing(null)}
                            className="h-7 w-32 rounded-md border border-[var(--color-border)] bg-white px-1 text-[11px]"
                          >
                            {p.match.allowed.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            type="text"
                            value={edited[p.id] ?? p.proposed}
                            aria-label={`Edit proposed value for ${p.field}`}
                            onChange={(e) => edit(p.id, e.target.value)}
                            onBlur={() => setEditing(null)}
                            className="h-7 w-28 rounded-md border border-[var(--color-border)] px-2 text-[11px]"
                          />
                        )
                      ) : (
                        <div className="max-w-[210px]">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-[var(--color-text)]">{edited[p.id] ?? p.proposed}</span>
                            {d !== 'edited' && d !== 'rejected' && (
                              <span className="rounded bg-[#ede9fe] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#6d28d9]">AI-filled</span>
                            )}
                          </span>
                          {p.match && d !== 'edited' && (
                            <div className="mt-1 text-[10px] leading-snug">
                              <span
                                className={`rounded px-1.5 py-0.5 font-semibold ${
                                  p.match.kind === 'closest' ? 'bg-[#fff7ed] text-[#c2410c]' : 'bg-[#f1f5f9] text-[#475569]'
                                }`}
                              >
                                {p.match.kind === 'closest' ? 'Closest match' : 'Exact match'}
                              </span>
                              <span className="ml-1 text-[var(--color-muted)]">{p.match.why}</span>
                              <div className="mt-0.5 text-[var(--color-muted)]">Allowed: {p.match.allowed.join(' · ')}</div>
                            </div>
                          )}
                          {p.match && d === 'edited' && (
                            <div className="mt-1 text-[10px] text-[var(--color-muted)]">Chosen by you from: {p.match.allowed.join(' · ')}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${confTone(p.confidence)}`}>{p.confidence}%</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" onClick={() => setDecisions((x) => ({ ...x, [p.id]: 'accepted' }))} className="rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 hover:border-[#a7f3d0]">
                          Accept
                        </button>
                        <button type="button" onClick={() => setEditing(p.id)} className="rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 hover:border-[#bfdbfe]">
                          Edit
                        </button>
                        <button type="button" onClick={() => setDecisions((x) => ({ ...x, [p.id]: 'rejected' }))} className="rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 hover:border-[#fecaca]">
                          Reject
                        </button>
                      </div>
                      <span className={`mt-0.5 block text-[10px] ${d === 'pending' ? 'font-medium text-[#b45309]' : 'text-[var(--color-muted)]'}`}>
                        {decisionLabel[d]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {sample.failures.length > 0 && (
          <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[11px]">
            <p className="mb-1 font-semibold text-[#991b1b]">
              Could not update ({failedOpen} of {sample.failures.length} still open)
            </p>
            <p className="mb-2 text-[10.5px] text-[#7f1d1d]">
              These were found in the file but could not be applied. Nothing was changed for them and they will not be submitted.
            </p>
            <div className="overflow-x-auto rounded-md border border-[#fecaca] bg-white">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#fff5f5] text-left text-[10.5px] uppercase tracking-wide text-[#991b1b]">
                    <th className="px-2 py-1.5 font-semibold">Source text</th>
                    <th className="px-2 py-1.5 font-semibold">Part</th>
                    <th className="px-2 py-1.5 font-semibold">Field</th>
                    <th className="px-2 py-1.5 font-semibold">Why it failed</th>
                    <th className="px-2 py-1.5 font-semibold">What you can do</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.failures.map((f) => (
                    <tr key={f.id} className="border-t border-[#fee2e2] align-top">
                      <td className="px-2 py-1.5 italic text-[var(--color-muted)]">{f.source}</td>
                      <td className="px-2 py-1.5">
                        <span className="block font-medium text-[var(--color-text)]">{f.part}</span>
                        <span className="font-mono text-[10px] text-[var(--color-muted)]">{f.partNo}</span>
                      </td>
                      <td className="px-2 py-1.5">{f.field}</td>
                      <td className="px-2 py-1.5 text-[#991b1b]">{f.reason}</td>
                      <td className="px-2 py-1.5">
                        {resolved[f.id] ? (
                          <span className="text-[var(--color-muted)]">
                            Set by you: <strong className="text-[var(--color-text)]">{resolved[f.id]}</strong>
                          </span>
                        ) : f.allowed ? (
                          <label className="block">
                            <span className="mb-0.5 block text-[10px] text-[var(--color-muted)]">Pick a valid value</span>
                            <select
                              value=""
                              aria-label={`Pick a value for ${f.field}`}
                              onChange={(e) => e.target.value && setResolved((r) => ({ ...r, [f.id]: e.target.value }))}
                              className="h-7 w-36 rounded-md border border-[var(--color-border)] bg-white px-1 text-[11px]"
                            >
                              <option value="">Choose…</option>
                              {f.allowed.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <span className="text-[var(--color-muted)]">Fix it in the part form.</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px]">
          <p className="mb-1 font-semibold text-[var(--color-text)]">Skipped by rule, not applied</p>
          <ul className="space-y-0.5 text-[var(--color-muted)]">
            {sample.skipped.map((s) => (
              <li key={s.source}>
                <span className="italic">{s.source}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>

        <AiFilledFlagDemo />

        <label className="flex items-start gap-2 text-[11px] text-[var(--color-text)]">
          <input type="checkbox" className="mt-0.5" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>
            I have reviewed the AI-filled values.
            <span className="block text-[var(--color-muted)]">
              Required before “Confirm and submit” or “Edit and submit”. Rows that still miss mandatory fields, and updates that
              could not be made, are listed and not submitted. {role === 'Vendor' ? 'A Vendor submit goes to the PIC for validation.' : 'A PIC submit follows the activity’s flow.'}
            </span>
          </span>
        </label>

        {message && (
          <p className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[11px] text-[var(--color-muted)]" role="status">
            {message}
          </p>
        )}
      </div>
    </Modal>
  )
}
