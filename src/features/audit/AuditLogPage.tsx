import { useMemo, useState } from 'react'
import { PageHeader, Card, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { buildCsv, downloadCsv } from '../mywork/csv'

const ALLOWED = ['PIC', 'SIC', 'DPM', 'Admin']
const selCls = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** Append-only log of document uploads, downloads and deletions, and Excel template downloads and uploads. */
export function AuditLogPage() {
  const { auditLog, activities } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [action, setAction] = useState('All')
  const [text, setText] = useState('')
  const actions = useMemo(() => Array.from(new Set(auditLog.map((a) => a.action))).sort(), [auditLog])
  const actName = (id?: string) => activities.find((a) => a.id === id)?.name ?? ''
  const rows = useMemo(
    () =>
      [...auditLog]
        .reverse()
        .filter((a) => (action === 'All' || a.action === action))
        .filter((a) => {
          const q = text.trim().toLowerCase()
          if (!q) return true
          return [a.actorName, a.persona, a.action, a.partNo ?? '', actName(a.activityId), a.detail].join(' ').toLowerCase().includes(q)
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditLog, action, text, activities]
  )
  if (!ALLOWED.includes(currentPersona)) {
    return (
      <div>
        <PageHeader title="Audit Log" section="Modules" description="Who uploaded, downloaded or deleted what, and when." />
        <Card><p className="py-8 text-center text-sm text-[var(--color-muted)]">The audit log is available to the PIC, SIC, DPM and Admin roles.</p></Card>
      </div>
    )
  }
  return (
    <div>
      <PageHeader
        title="Audit Log"
        section="Modules"
        description="Every document upload, download and deletion, and every Excel template download and upload. Entries cannot be edited or removed."
        actions={
          <Button
            variant="secondary"
            size="md"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                'audit-log.csv',
                buildCsv(['When', 'Role', 'Person', 'Action', 'Part', 'Activity', 'Detail'], rows.map((a) => [a.at, a.persona, a.actorName, a.action, a.partNo ?? '', actName(a.activityId), a.detail]))
              )
            }
          >
            Download CSV ({rows.length})
          </Button>
        }
      />
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
        <input
          type="text"
          placeholder="Search person, part, activity, file…"
          aria-label="Search the audit log"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-9 w-72 max-w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054]"
        />
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action" className={selCls}>
          <option value="All">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </section>
      <Card flush>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">No log entries yet. Uploading or deleting a document, or using an Excel template, adds one.</p>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Part</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-muted)]">{fmtWhen(a.at)}</td>
                    <td className="px-4 py-2.5">{a.actorName} <span className="text-[var(--color-muted)]">({a.persona})</span></td>
                    <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{a.action}</td>
                    <td className="px-4 py-2.5">{a.partNo ?? '—'}</td>
                    <td className="px-4 py-2.5">{actName(a.activityId) || '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] break-all">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
