import { Icon as FbIcon } from '../../components/Icon'
import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts'
import { PageHeader, Card, Tabs, Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import {
  getFilteredData, isWorkableByVendor, getPicOn, getReleaseState,
  workBucket, bucketTotals, workspaceGroups,
  WORK_BUCKETS, WORK_BUCKET_COLORS, WORK_BUCKET_DESC
} from '../../engine'
import type { WorkBucket } from '../../engine'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'
import { hasMyWork } from './workQueue'
import { ReleasePanel } from './ReleasePanel'
import { DelayPanel } from '../delay/DelayPanel'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useApprovalRows } from './approvalRows'
import type { ApprovalRow, ApprovalType } from './approvalRows'
import { PartDetailDrawer } from '../workspace/PartDetailDrawer'
import { useExceptionData } from '../exceptions/useExceptionData'

const filterCls =
  'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const thCls = 'text-left px-3 py-2.5 font-medium text-[var(--color-muted)] whitespace-nowrap'

// Detail-table columns: sortable + per-column filterable.
type TableColKey = 'status' | 'partNo' | 'partName' | 'model' | 'department' | 'vendorName' | 'milestoneId' | 'activity' | 'planned'
const TABLE_COLS: { key: TableColKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'partNo', label: 'Part code' },
  { key: 'partName', label: 'Part name' },
  { key: 'model', label: 'Model' },
  { key: 'department', label: 'Dept' },
  { key: 'vendorName', label: 'Vendor' },
  { key: 'milestoneId', label: 'Trial' },
  { key: 'activity', label: 'Activity' },
  { key: 'planned', label: 'Planned' }
]


// ── My Approvals ────────────────────────────────────────────────────────────

const APPROVAL_TYPE_STYLE: Record<ApprovalType, string> = {
  'Data Entry': 'bg-slate-100 text-slate-700',
  'Data Validation': 'bg-blue-100 text-blue-800',
  Deviation: 'bg-amber-100 text-amber-800',
  Action: 'bg-violet-100 text-violet-800',
  'Delay Reason': 'bg-red-100 text-red-800'
}
const STATUS_STYLE: Record<string, string> = {
  'Sent back': 'bg-[#fef2f2] text-[#b91c1c]',
  Draft: 'bg-[#eff6ff] text-[#1d4ed8]',
  'Not started': 'bg-[#f3f4f6] text-[#4b5563]'
}
const fmtDateTime = (iso?: string) => (iso ? fmtDate(iso.slice(0, 10)) : '—')

/** One item rendered as a card (the worklist card look), with the My Approvals fields + Department. */
function ApprovalCard({
  r, selected, onToggle, onOpen, onApprove, onSendBack
}: {
  r: ApprovalRow
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onApprove: () => void
  onSendBack: () => void
}) {
  const canBulk = r.mode === 'approve'
  const approveLabel = r.type === 'Delay Reason' ? 'Accept' : r.type === 'Action' ? 'Mark done' : 'Approve'
  return (
    <section className="epmp-card cursor-pointer px-5 py-4 transition-all hover:shadow-sm" onClick={onOpen}>
      <div className="flex flex-wrap items-start gap-3">
        {canBulk && (
          <input type="checkbox" className="mt-1" aria-label={`Select ${r.partNo} ${r.type}`} checked={selected}
            onClick={(e) => e.stopPropagation()} onChange={onToggle} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${APPROVAL_TYPE_STYLE[r.type]}`}>{r.type}</span>
            {r.statusLabel && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[r.statusLabel] ?? 'bg-slate-100 text-slate-700'}`}>{r.statusLabel}</span>}
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{r.trial}</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-text)]">{r.title}</h3>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] text-[var(--color-muted)] sm:grid-cols-3 lg:grid-cols-6">
            <span><span className="text-[var(--color-muted)]">Part </span><span className="font-mono text-[var(--color-text)]">{r.partNo}</span></span>
            <span><span className="text-[var(--color-muted)]">Vendor </span><span className="text-[var(--color-text)]">{r.vendorCode} · {r.vendorName}</span></span>
            <span><span className="text-[var(--color-muted)]">Model </span><span className="text-[var(--color-text)]">{r.model}</span></span>
            <span><span className="text-[var(--color-muted)]">Dept </span><span className="text-[var(--color-text)]">{r.department}</span></span>
            <span><span className="text-[var(--color-muted)]">{r.mode === 'enter' ? 'Updated' : 'Submitted'} by </span><span className="text-[var(--color-text)]">{r.submittedByName || r.submittedByRole || '—'}</span></span>
            <span><span className="text-[var(--color-muted)]">{r.mode === 'enter' ? 'Updated' : 'Submitted'} on </span><span className="text-[var(--color-text)]">{fmtDateTime(r.submittedOn)}</span></span>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {r.mode === 'enter' ? (
            <Button variant="primary" size="sm" onClick={onOpen}>Open form</Button>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={onApprove}>{approveLabel}</Button>
              {r.type !== 'Action' && <Button variant="secondary" size="sm" onClick={onSendBack}>Send back</Button>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Merged Worklist: one card per item for the current role — the work they enter and the things they approve, at the
 * same granularity as before (one activity-part per card). A segment switches between "To enter" and "To approve".
 * Multi-select to approve in one go; clicking a card opens the activity form in a drawer.
 */
interface WorkFilters {
  model: string; dept: string; milestone: string; pic: string
  part: string; partCode: string; vendorCode: string; vendor: string
}

function ApprovalsPanel({ filters, filterBar }: { filters: WorkFilters; filterBar?: React.ReactNode }) {
  const allRows = useApprovalRows()
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (filters.model !== 'All' && r.model !== filters.model) return false
        if (filters.dept !== 'All' && r.department !== filters.dept) return false
        if (filters.milestone !== 'All' && r.trial !== filters.milestone) return false
        if (filters.vendor !== 'All' && r.vendorName !== filters.vendor) return false
        if (filters.vendorCode !== 'All' && r.vendorCode !== filters.vendorCode) return false
        if (filters.pic !== 'All' && r.pic !== filters.pic) return false
        if (filters.part && !r.partName.toLowerCase().includes(filters.part.toLowerCase())) return false
        if (filters.partCode && !r.partNo.toLowerCase().includes(filters.partCode.toLowerCase())) return false
        return true
      }),
    [allRows, filters]
  )
  const { activities, templateRows, transitionEntryState, advanceDeviation, decideDelayReasons, updateAction } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [segment, setSegment] = useState<'all' | 'enter' | 'approve'>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [sendBack, setSendBack] = useState<ApprovalRow | null>(null)
  const [comment, setComment] = useState('')
  // The item whose form is open in the drawer (over this list; closing returns here).
  const [openRow, setOpenRow] = useState<ApprovalRow | null>(null)
  const openActivity = openRow ? activities.find((a) => a.id === (templateRows.find((t) => t.id === openRow.rowId)?.activityId)) : undefined
  const openTemplateRow = openRow ? templateRows.find((t) => t.id === openRow.rowId) : undefined

  const enterRows = rows.filter((r) => r.mode === 'enter')
  const approveRows = rows.filter((r) => r.mode === 'approve')
  const shown = segment === 'enter' ? enterRows : segment === 'approve' ? approveRows : rows

  const keys = useMemo(() => new Set(approveRows.map((r) => r.key)), [approveRows])
  const selected = useMemo(() => new Set([...picked].filter((k) => keys.has(k))), [picked, keys])
  const selectableShown = shown.filter((r) => r.mode === 'approve')

  const approveOne = (r: ApprovalRow) => {
    if (!r.approve) return
    switch (r.approve.kind) {
      case 'entry': transitionEntryState(r.approve.entryId, 'Approve', undefined, currentPersona); break
      case 'deviation': advanceDeviation(r.approve.rowId, r.approve.partNo, r.approve.deviationId, 'Approve', currentPersona, currentPersona); break
      case 'delay': decideDelayReasons({ ids: [r.approve.recordId], decision: 'Accepted', by: currentPersona, actorName: currentPersona }); break
      case 'action': updateAction(r.approve.rowId, r.approve.partNo, r.approve.actionId, { status: 'Done' }, currentPersona, currentPersona); break
    }
  }
  const approveSelected = () => {
    const chosen = approveRows.filter((r) => selected.has(r.key))
    chosen.forEach(approveOne)
    setNotice(`${chosen.length} item${chosen.length === 1 ? '' : 's'} actioned.`)
    setPicked(new Set())
  }
  const runSendBack = () => {
    if (!sendBack || !comment.trim() || !sendBack.approve) return
    if (sendBack.approve.kind === 'deviation') {
      advanceDeviation(sendBack.approve.rowId, sendBack.approve.partNo, sendBack.approve.deviationId, 'Send back', currentPersona, currentPersona, comment.trim())
    } else if (sendBack.approve.kind === 'delay') {
      decideDelayReasons({ ids: [sendBack.approve.recordId], decision: 'SentBack', comment: comment.trim(), by: currentPersona, actorName: currentPersona })
    } else if (sendBack.approve.kind === 'entry') {
      transitionEntryState(sendBack.approve.entryId, 'Send back', comment.trim(), currentPersona)
    }
    setSendBack(null); setComment('')
  }

  const allOn = selectableShown.length > 0 && selectableShown.every((r) => selected.has(r.key))
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div>
      {/* Filters + toolbar pin to the top of the scroll area while the cards scroll under them. */}
      <div className="epmp-sticky-pane sticky top-0 z-20 -mx-4 -mt-1 px-4 pt-2 pb-3 lg:-mx-7 lg:px-7">
      {filterBar}
      <section className="epmp-card flex flex-wrap items-center gap-3 px-4 py-3">
        <Tabs
          activeId={segment}
          onChange={(id) => { setSegment(id as 'all' | 'enter' | 'approve'); setPicked(new Set()) }}
          items={[
            { id: 'all', label: 'All', badge: rows.length || undefined },
            { id: 'enter', label: 'To enter', badge: enterRows.length || undefined },
            { id: 'approve', label: 'To approve', badge: approveRows.length || undefined }
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          {notice && <span className="text-[11px] text-emerald-700" role="status">{notice}</span>}
          {selectableShown.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-[#344054]">
              <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(selectableShown.map((r) => r.key)))} />
              Select all
            </label>
          )}
          <Button variant="primary" size="sm" disabled={selected.size === 0} onClick={approveSelected}>
            Approve selected ({selected.size})
          </Button>
        </div>
      </section>
      </div>

      {shown.length === 0 ? (
        <Card><p className="py-12 text-center text-sm text-[var(--color-muted)]">Nothing here right now.</p></Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <ApprovalCard
              key={r.key}
              r={r}
              selected={selected.has(r.key)}
              onToggle={() => toggle(r.key)}
              onOpen={() => setOpenRow(r)}
              onApprove={() => { approveOne(r); setNotice(r.type === 'Delay Reason' ? 'Accepted.' : r.type === 'Action' ? 'Marked done.' : 'Approved.') }}
              onSendBack={() => { setSendBack(r); setComment('') }}
            />
          ))}
        </div>
      )}

      {/* Send-back reason (required) */}
      <Modal
        open={!!sendBack}
        onClose={() => setSendBack(null)}
        title={sendBack ? `Send back: ${sendBack.title}` : 'Send back'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setSendBack(null)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!comment.trim()} onClick={runSendBack}>Send back</Button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason for sending back</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            placeholder="Tell them what to correct before resubmitting…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]" />
        </label>
      </Modal>

      {/* The activity form opens as a drawer over this list; closing returns here. */}
      {openRow && openActivity && openTemplateRow && (
        <PartDetailDrawer
          activity={openActivity}
          row={openTemplateRow}
          partNo={openRow.partNo}
          onClose={() => setOpenRow(null)}
        />
      )}
    </div>
  )
}

// ── Workspace tile ────────────────────────────────────────────────────────────

function BucketTile({ bucket, count, active, onClick }: { bucket: WorkBucket; count: number; active: boolean; onClick: () => void }) {
  const color = WORK_BUCKET_COLORS[bucket]
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={WORK_BUCKET_DESC[bucket]}
      className={`epmp-card flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${active ? 'ring-2' : 'hover:shadow-sm'}`}
      style={active ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {bucket}
        {bucket === 'NG' && count > 0 && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-[var(--color-ryg-red)]">action</span>}
      </span>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>{count}</span>
    </button>
  )
}

// ── Compact filter bar ─────────────────────────────────────────────────────

interface FilterBarProps {
  model: string; setModel: (v: string) => void; modelOptions: string[]
  dept: string; setDept: (v: string) => void; deptOptions: string[]
  vendor: string; setVendor: (v: string) => void; vendorOptions: string[]
  milestone: string; setMilestone: (v: string) => void; milestoneOptions: string[]
  pic: string; setPic: (v: string) => void; picOptions: string[]
  vendorCode: string; setVendorCode: (v: string) => void; vendorCodeOptions: string[]
  part: string; setPart: (v: string) => void
  partCode: string; setPartCode: (v: string) => void
  hasFilters: boolean; clearFilters: () => void
}

const fbSel = 'h-8 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] pl-2 pr-6 text-[11px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const fbInput = 'h-8 w-36 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[11px] text-[#344054] placeholder-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'

/** Primary filters inline (name shown in the control); the rest hide behind "More filters". */
function CompactFilterBar(f: FilterBarProps) {
  const [more, setMore] = useState(false)
  // A labelled select: the "All" option reads as the field name so no separate label row is needed.
  const sel = (label: string, value: string, onChange: (v: string) => void, options: string[]) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={fbSel}>
      <option value="All">{label}: All</option>
      {options.map((o) => <option key={o} value={o}>{label}: {o}</option>)}
    </select>
  )
  return (
    <section className="epmp-card mb-3 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {sel('Model', f.model, f.setModel, f.modelOptions)}
        {sel('Dept', f.dept, f.setDept, f.deptOptions)}
        {sel('Vendor', f.vendor, f.setVendor, f.vendorOptions)}
        <button
          onClick={() => setMore((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${more ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[#344054]'} hover:bg-[#fafafa]`}
        >
          <FbIcon name="tools" size={12} /> More filters
        </button>
        {f.hasFilters && (
          <button onClick={f.clearFilters} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Clear</button>
        )}
      </div>
      {more && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
          {sel('Trial status', f.milestone, f.setMilestone, f.milestoneOptions)}
          {sel('PIC name', f.pic, f.setPic, f.picOptions)}
          {sel('Vendor code', f.vendorCode, f.setVendorCode, f.vendorCodeOptions)}
          <input aria-label="Part name" value={f.part} onChange={(e) => f.setPart(e.target.value)} placeholder="Part name" className={fbInput} />
          <input aria-label="Part code" value={f.partCode} onChange={(e) => f.setPartCode(e.target.value)} placeholder="Part code" className={fbInput} />
        </div>
      )}
    </section>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function KpiCard({ title, value, color, icon, onClick }: { title: string; value: number; color: string; icon: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="epmp-card flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium leading-tight" style={{ color }}>
        <FbIcon name={icon} size={13} /> {title}
      </span>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>{value}</span>
    </button>
  )
}

/** Overview: key KPIs, the priority actions that need the role now, and an activity snapshot. No full worklist/charts. */
function OverviewTab({
  totals, pendingRelease, awaitingAck, returned, delayReviews, onGo
}: {
  totals: Record<WorkBucket, number>
  pendingRelease: number
  awaitingAck: number
  returned: number
  delayReviews: number
  onGo: (t: 'overview' | 'actions' | 'worklist' | 'insights', payload?: { bucket?: WorkBucket; focus?: string }) => void
}) {
  const priorities: { title: string; sub: string; n: number }[] = []
  if (pendingRelease > 0) priorities.push({ title: `${pendingRelease} part${pendingRelease === 1 ? '' : 's'} pending vendor release`, sub: 'Review and release', n: pendingRelease })
  if (delayReviews > 0) priorities.push({ title: `${delayReviews} vendor delay reason${delayReviews === 1 ? '' : 's'}`, sub: 'Awaiting your review', n: delayReviews })
  if (returned > 0) priorities.push({ title: `${returned} returned part${returned === 1 ? '' : 's'}`, sub: 'Sent back by the vendor', n: returned })

  return (
    <div className="flex min-h-0 flex-col" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {/* Frozen top: KPIs + snapshot stay put; only Priority actions below scrolls. */}
      <div className="flex-none">
      {/* Key KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Pending release" value={pendingRelease} color="#d97706" icon="reply" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Awaiting acknowledgement" value={awaitingAck} color="#2563eb" icon="clipboard" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Returned by vendor" value={returned} color="#dc2626" icon="undo" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Delay reviews" value={delayReviews} color="#2563eb" icon="clipboard-list" onClick={() => onGo('actions', { focus: 'delay' })} />
        <KpiCard title="Delayed activities" value={totals.Delayed} color="#d97706" icon="calendar-month" onClick={() => onGo('insights', { bucket: 'Delayed' })} />
        <KpiCard title="NG / Rework" value={totals.NG} color="#dc2626" icon="exclamation-circle" onClick={() => onGo('insights', { bucket: 'NG' })} />
      </div>

      {/* Activity snapshot */}
      <section className="epmp-card mb-4 px-5 py-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Activity snapshot</h3>
          <button onClick={() => onGo('worklist')} className="text-[12px] font-semibold text-[var(--color-accent)] hover:underline">View worklist →</button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {([['Upcoming', totals.Upcoming, '#2153f5'], ['Completed', totals.Completed, '#10b981'], ['Delayed', totals.Delayed, '#d97706'], ['NG', totals.NG, '#dc2626']] as const).map(([label, n, c]) => (
            <div key={label}>
              <div className="text-[24px] font-bold" style={{ color: c }}>{n}</div>
              <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
            </div>
          ))}
        </div>
      </section>
      </div>

      {/* Priority actions — fills the remaining height; its list scrolls while the top stays frozen. */}
      <section className="epmp-card flex min-h-0 flex-1 flex-col px-5 py-3">
        <div className="mb-2 flex flex-none items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Priority actions</h3>
          {priorities.length > 0 && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-primary">{priorities.length} to act on</span>}
        </div>
        {priorities.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-[var(--color-muted)]">Nothing urgent right now.</p>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-[var(--color-border)] overflow-y-auto">
            {priorities.map((p) => (
              <div key={p.title} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--color-text)]">{p.title}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{p.sub}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onGo('actions')}>Open</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function MyWorkPage() {
  const { activities, entries, templateRows, models, parts, partReleases, partAcks, picAssignments } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const upcomingOnly = useUpcomingOnly()

  // Four-tab information architecture: Overview (KPIs), My Actions (release/returns/delay), Worklist (all
  // assigned activities), Insights (performance charts). ?view= opens a specific tab (worklist/approvals legacy).
  type MwTab = 'overview' | 'actions' | 'worklist' | 'insights'
  const [searchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const [view, setView] = useState<MwTab>(
    viewParam === 'worklist' || viewParam === 'approvals' ? 'worklist'
      : viewParam === 'actions' ? 'actions'
      : viewParam === 'insights' ? 'insights'
      : 'overview'
  )
  // Worklist (merged): work to enter + things to approve, for this role.
  const approvalRows = useApprovalRows()
  // Counts for the Overview KPIs and Activity snapshot.
  const { delays: excDelays } = useExceptionData()
  const releaseCounts = useMemo(() => {
    let pending = 0, returned = 0, awaitingAck = 0
    for (const p of parts) {
      if (p.supersededBy || !partInScope(p, currentPersona)) continue
      const st = getReleaseState(p.partNo, partReleases, partAcks)
      if (st === 'Pending') pending++
      else if (st === 'Returned') returned++
      else if (st === 'Released') awaitingAck++ // released to the vendor, not yet acknowledged
    }
    return { pending, returned, awaitingAck }
  }, [parts, currentPersona, partReleases, partAcks])

  // Filters (the client's set). 'All' by default.
  const [fModel, setFModel] = useState('All')
  const [fDept, setFDept] = useState('All')
  const [fMilestone, setFMilestone] = useState('All')
  const [fPic, setFPic] = useState('All')
  const [fPart, setFPart] = useState('') // Part name (free text)
  const [fPartCode, setFPartCode] = useState('') // Part code (free text)
  const [fVendorCode, setFVendorCode] = useState('All')
  const [fVendor, setFVendor] = useState('All')
  // Workspace drill state.
  const [groupDim, setGroupDim] = useState<'model' | 'vendor' | 'department' | 'milestone'>('model')
  const [selectedBucket, setSelectedBucket] = useState<WorkBucket | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  // Detail-table sort + per-column filter.
  const [sortKey, setSortKey] = useState<TableColKey>('partNo')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilters, setColFilters] = useState<Record<TableColKey, string>>({
    status: '', partNo: '', partName: '', model: '', department: '', vendorName: '', milestoneId: '', activity: '', planned: ''
  })

  // Every in-scope instance (before filters).
  const allInstances = useMemo(
    () =>
      getFilteredData(
        entries, activities, parts, templateRows, models,
        { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
        'overview', DEMO_TODAY
      )
        .filter((i) => partInScope(i.part, currentPersona))
        .filter((i) => currentPersona !== 'Vendor' || isWorkableByVendor(i.part.partNo, partReleases, partAcks))
        .filter((i) => !i.notApplicable)
        // PIC default: only activities due or starting in the next 30 days (the checkbox turns this off).
        .filter((i) => !upcomingOnly || isUpcoming(i.dates)),
    [entries, activities, parts, templateRows, models, currentPersona, partReleases, partAcks, upcomingOnly]
  )

  // Filter option lists (stable across selections).
  const opt = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort()
  const modelOptions = useMemo(() => opt(allInstances.map((i) => i.part.model)), [allInstances])
  const deptOptions = useMemo(() => opt(allInstances.map((i) => i.part.department || 'Other')), [allInstances])
  const milestoneOptions = useMemo(() => opt(allInstances.map((i) => i.row.milestoneId)), [allInstances])
  const vendorOptions = useMemo(() => opt(allInstances.map((i) => i.part.vendorName)), [allInstances])
  const vendorCodeOptions = useMemo(() => opt(allInstances.map((i) => i.part.vendorCode)), [allInstances])
  const picOptions = useMemo(
    () => opt(allInstances.map((i) => getPicOn(i.part, picAssignments, DEMO_TODAY).name)),
    [allInstances, picAssignments]
  )

  const hasFilters = [fModel, fDept, fMilestone, fPic, fVendorCode, fVendor].some((v) => v !== 'All') || fPart !== '' || fPartCode !== ''
  function clearFilters() {
    setFModel('All'); setFDept('All'); setFMilestone('All'); setFPic('All')
    setFPart(''); setFPartCode(''); setFVendorCode('All'); setFVendor('All')
  }

  // Apply the filters.
  const instances = useMemo(
    () =>
      allInstances.filter((i) => {
        if (fModel !== 'All' && i.part.model !== fModel) return false
        if (fDept !== 'All' && (i.part.department || 'Other') !== fDept) return false
        if (fMilestone !== 'All' && i.row.milestoneId !== fMilestone) return false
        if (fVendor !== 'All' && i.part.vendorName !== fVendor) return false
        if (fVendorCode !== 'All' && i.part.vendorCode !== fVendorCode) return false
        if (fPic !== 'All' && getPicOn(i.part, picAssignments, DEMO_TODAY).name !== fPic) return false
        if (fPart && !i.part.partName.toLowerCase().includes(fPart.toLowerCase())) return false
        if (fPartCode && !i.part.partNo.toLowerCase().includes(fPartCode.toLowerCase())) return false
        return true
      }),
    [allInstances, fModel, fDept, fMilestone, fVendor, fVendorCode, fPic, fPart, fPartCode, picAssignments]
  )

  // Workspace rollups.
  const totals = useMemo(() => bucketTotals(instances), [instances])
  const groups = useMemo(() => workspaceGroups(instances, groupDim), [instances, groupDim])

  // Value shown/sorted/filtered for a given column of an instance.
  const plannedText = (i: typeof allInstances[number]) =>
    i.dates.status === 'resolved' ? `${fmtDate(i.dates.start)} → ${fmtDate(i.dates.end)}` : 'Awaiting MRD'
  const cellValue = (i: typeof allInstances[number], key: TableColKey): string => {
    switch (key) {
      case 'status': return workBucket(i) ?? ''
      case 'partNo': return i.part.partNo
      case 'partName': return i.part.partName
      case 'model': return i.part.model
      case 'department': return i.part.department || 'Other'
      case 'vendorName': return i.part.vendorName
      case 'milestoneId': return i.row.milestoneId
      case 'activity': return i.activity.name
      case 'planned': return i.dates.status === 'resolved' ? i.dates.end : 'zzzz' // sort by end date; awaiting MRD last
    }
  }

  // Mobile: Activity is the first column (pinned left); laptop keeps the original order.
  const isMobile = useIsMobile()
  const tableCols = isMobile ? [TABLE_COLS.find((c) => c.key === 'activity')!, ...TABLE_COLS.filter((c) => c.key !== 'activity')] : TABLE_COLS

  // The detail table respects the selected bucket/group, then the per-column filters, then the sort.
  const tableRows = useMemo(() => {
    let rows = instances
    if (selectedBucket) rows = rows.filter((i) => workBucket(i) === selectedBucket)
    if (selectedGroup) {
      rows = rows.filter((i) => {
        const k = groupDim === 'model' ? i.part.model
          : groupDim === 'vendor' ? i.part.vendorName
          : groupDim === 'department' ? (i.part.department || 'Other')
          : i.row.milestoneId
        return k === selectedGroup
      })
    }
    // Per-column filters (case-insensitive substring; 'planned' matches the displayed range text).
    rows = rows.filter((i) =>
      TABLE_COLS.every(({ key }) => {
        const f = colFilters[key]
        if (!f) return true
        const hay = (key === 'planned' ? plannedText(i) : cellValue(i, key)).toLowerCase()
        return hay.includes(f.toLowerCase())
      })
    )
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = cellValue(a, sortKey)
      const vb = cellValue(b, sortKey)
      const cmp = va.localeCompare(vb, undefined, { numeric: true })
      return (cmp || a.part.partNo.localeCompare(b.part.partNo)) * dir
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, selectedBucket, selectedGroup, groupDim, colFilters, sortKey, sortDir])

  function toggleSort(key: TableColKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const anyColFilter = Object.values(colFilters).some(Boolean)

  if (!hasMyWork(currentPersona)) {
    return (
      <div>
        <PageHeader title="My Workspace" section="Workspace" description="A worklist for Vendors and PICs." />
        <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">My Work is available to the Vendor, PIC, SIC and DPM roles. Switch persona to see it.</p></Card>
      </div>
    )
  }


  // ── Worklist (merged): everything for this role — work to enter + things to approve ──
  const worklistCount = approvalRows.length
  const effectiveView = view

  // From an Overview KPI: switch to the right tab, pre-apply the bucket filter (Insights), and scroll to the queue.
  const goFromOverview = (tab: MwTab, payload?: { bucket?: WorkBucket; focus?: string }) => {
    if (payload?.bucket) { setSelectedBucket(payload.bucket); setSelectedGroup(null) }
    setView(tab)
    const anchor = payload?.bucket ? 'mw-detail' : payload?.focus === 'delay' ? 'mw-delay' : payload?.focus === 'release' ? 'mw-release' : null
    if (anchor) {
      // Wait for the tab's content to render, then bring the target queue into view.
      setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }

  const groupDimLabel = { model: 'Model', vendor: 'Vendor', department: 'Department', milestone: 'Trial status' }[groupDim]

  return (
    <div>
      {/* No page header here — the four-tab bar is the page's own heading. The 30-day toggle sits beside it. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          activeId={effectiveView}
          onChange={(id) => setView(id as MwTab)}
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'actions', label: 'My Actions', badge: (releaseCounts.pending + releaseCounts.returned + excDelays.review.length) || undefined },
            { id: 'worklist', label: 'Worklist / Approval', badge: worklistCount || undefined },
            { id: 'insights', label: 'Insights' }
          ]}
        />
        <UpcomingToggle />
      </div>

      {/* Filters — shown on Insights (charts); the Worklist renders its own sticky filter bar */}
      {effectiveView === 'insights' && (
      <div className="epmp-sticky-pane sticky top-0 z-20 -mx-4 -mt-1 px-4 pt-2 pb-1 lg:-mx-7 lg:px-7">
        <CompactFilterBar
          model={fModel} setModel={setFModel} modelOptions={modelOptions}
          dept={fDept} setDept={setFDept} deptOptions={deptOptions}
          vendor={fVendor} setVendor={setFVendor} vendorOptions={vendorOptions}
          milestone={fMilestone} setMilestone={setFMilestone} milestoneOptions={milestoneOptions}
          pic={fPic} setPic={setFPic} picOptions={picOptions}
          vendorCode={fVendorCode} setVendorCode={setFVendorCode} vendorCodeOptions={vendorCodeOptions}
          part={fPart} setPart={setFPart}
          partCode={fPartCode} setPartCode={setFPartCode}
          hasFilters={hasFilters} clearFilters={clearFilters}
        />
      </div>
      )}

      {effectiveView === 'worklist' ? (
        <ApprovalsPanel
          filters={{ model: fModel, dept: fDept, milestone: fMilestone, pic: fPic, part: fPart, partCode: fPartCode, vendorCode: fVendorCode, vendor: fVendor }}
          filterBar={
            <CompactFilterBar
              model={fModel} setModel={setFModel} modelOptions={modelOptions}
              dept={fDept} setDept={setFDept} deptOptions={deptOptions}
              vendor={fVendor} setVendor={setFVendor} vendorOptions={vendorOptions}
              milestone={fMilestone} setMilestone={setFMilestone} milestoneOptions={milestoneOptions}
              pic={fPic} setPic={setFPic} picOptions={picOptions}
              vendorCode={fVendorCode} setVendorCode={setFVendorCode} vendorCodeOptions={vendorCodeOptions}
              part={fPart} setPart={setFPart}
              partCode={fPartCode} setPartCode={setFPartCode}
              hasFilters={hasFilters} clearFilters={clearFilters}
            />
          }
        />
      ) : effectiveView === 'overview' ? (
        <OverviewTab
          totals={totals}
          pendingRelease={releaseCounts.pending}
          awaitingAck={releaseCounts.awaitingAck}
          returned={releaseCounts.returned}
          delayReviews={excDelays.review.length}
          onGo={goFromOverview}
        />
      ) : effectiveView === 'actions' ? (
        <>
          {/* Release handshake + delay reason approvals — the PIC's transactional approvals */}
          <div id="mw-release"><ReleasePanel /></div>
          <div id="mw-delay"><DelayPanel /></div>
        </>
      ) : (
        <>
          {/* Insights: tiles + performance charts (no transactional tables) */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {WORK_BUCKETS.map((b) => (
              <BucketTile
                key={b} bucket={b} count={totals[b]}
                active={selectedBucket === b}
                onClick={() => setSelectedBucket(selectedBucket === b ? null : b)}
              />
            ))}
          </div>

          {/* Graphical: stacked bars by the chosen dimension */}
          <Card className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <h3 className="flex-none whitespace-nowrap text-[13px] font-semibold text-[var(--color-text)]">Workspace by {groupDimLabel}</h3>
              <select value={groupDim} onChange={(e) => { setGroupDim(e.target.value as any); setSelectedGroup(null) }} className={`${filterCls} ml-auto w-auto max-w-[180px]`}>
                <option value="model">By Model</option>
                <option value="vendor">By Vendor</option>
                <option value="department">By Department</option>
                <option value="milestone">By Trial status</option>
              </select>
            </div>
            {groups.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--color-muted)]">No parts match the current filters.</p>
            ) : (
              <div style={{ height: Math.max(180, groups.length * 34 + 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                    barCategoryGap={8}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                    {/* Label column sized to the longest label so the bars use the rest of the card width */}
                    <YAxis type="category" dataKey="key" stroke="#667085" fontSize={11} tickLine={false}
                      width={Math.min(110, Math.max(48, Math.max(...groups.map((g) => String(g.key).length)) * 6.5 + 12))} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    {WORK_BUCKETS.map((b) => (
                      <Bar key={b} dataKey={b} name={b} stackId="s" fill={WORK_BUCKET_COLORS[b]}
                        cursor="pointer"
                        onClick={(d: any) => { setSelectedBucket(b); setSelectedGroup(d?.key ?? null) }}>
                        {groups.map((g) => <Cell key={g.key} />)}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Click a segment to open those parts below. {groupDimLabel}-wise · Upcoming → Completed → Delayed → NG.</p>
          </Card>

          {/* Detail table — appears for the selected bucket/group (KPI/NG drill lands here) */}
          <div id="mw-detail" />
          <Card flush className="!overflow-visible">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)]">
                {selectedBucket ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[selectedBucket] }} />
                    {selectedBucket} parts
                  </span>
                ) : 'All parts'}
                {selectedGroup ? <span className="text-[var(--color-muted)]"> · {selectedGroup}</span> : ''}
                <span className="ml-2 inline-flex items-center whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 align-middle text-[11px] font-medium text-primary">{tableRows.length} row{tableRows.length === 1 ? '' : 's'}</span>
              </h3>
              <div className="ml-auto flex items-center gap-3">
                {anyColFilter && (
                  <button onClick={() => setColFilters({ status: '', partNo: '', partName: '', model: '', department: '', vendorName: '', milestoneId: '', activity: '', planned: '' })}
                    className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Clear column filters</button>
                )}
                {(selectedBucket || selectedGroup) && (
                  <button onClick={() => { setSelectedBucket(null); setSelectedGroup(null) }} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Show all</button>
                )}
              </div>
            </div>
            {/* Mobile: the table scrolls sideways inside this wrapper (Activity first); only Open is pinned right (.tbl-sleeve-r). */}
            <div className={`page-sticky-head ${isMobile ? 'tbl-sleeve tbl-sleeve-r overflow-x-auto' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  {/* Sortable header row */}
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    {tableCols.map((c) => (
                      <th key={c.key} className={`${thCls} cursor-pointer select-none hover:text-[var(--color-text)]`}
                        onClick={() => toggleSort(c.key)}
                        aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          <span className="text-[var(--color-accent)]">{sortKey === c.key ? <FbIcon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} /> : <FbIcon name="caret-sort" size={14} className="opacity-60" />}</span>
                        </span>
                      </th>
                    ))}
                    <th className={`${thCls} text-right`}>Actions</th>
                  </tr>
                  {/* Per-column filter row */}
                  <tr className="border-b border-[var(--color-border)] bg-white">
                    {tableCols.map((c) => (
                      <th key={c.key} className="px-2 py-1.5">
                        <input
                          value={colFilters[c.key]}
                          onChange={(e) => setColFilters((prev) => ({ ...prev, [c.key]: e.target.value }))}
                          placeholder="Filter"
                          aria-label={`Filter ${c.label}`}
                          className="h-7 w-full min-w-[60px] rounded border border-[var(--color-border)] bg-[#f9fafb] px-1.5 text-[10px] text-[#344054] placeholder-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                        />
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((i) => {
                    const b = workBucket(i)!
                    const planned = i.dates.status === 'resolved' ? `${fmtDate(i.dates.start)} → ${fmtDate(i.dates.end)}` : 'Awaiting MRD'
                    return (
                      <tr key={`${i.row.id}-${i.part.partNo}`} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                        {tableCols.map((c) => <Fragment key={c.key}>{({
                          status: (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: `${WORK_BUCKET_COLORS[b]}1a`, color: WORK_BUCKET_COLORS[b] }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}
                          </span>
                        </td>
                          ),
                          partNo: (
                        <td className="px-3 py-2.5 font-mono text-[11px]">{i.part.partNo}</td>
                          ),
                          partName: (
                        <td className="px-3 py-2.5">{i.part.partName}</td>
                          ),
                          model: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.model}</td>
                          ),
                          department: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.department}</td>
                          ),
                          vendorName: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.vendorName}</td>
                          ),
                          milestoneId: (
                        <td className="px-3 py-2.5"><span className="whitespace-nowrap rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{i.row.milestoneId}</span></td>
                          ),
                          activity: (
                        <td className="px-3 py-2.5 text-[12px]">{i.activity.name}</td>
                          ),
                          planned: (
                        <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-[var(--color-muted)]">{planned}</td>
                          ),
                        } as Record<TableColKey, React.ReactNode>)[c.key]}</Fragment>)}
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            // Opens this part's form for this activity (the part drawer), not the whole part list.
                            to={`/activities/${i.row.id}?part=${encodeURIComponent(i.part.partNo)}`}
                            className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
                          >Open →</Link>
                        </td>
                      </tr>
                    )
                  })}
                  {tableRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts in this selection.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
