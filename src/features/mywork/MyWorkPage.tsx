import { Icon as FbIcon } from '../../components/Icon'
import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import type { WorkBucket, FilteredInstance } from '../../engine'
import { DEMO_TODAY, fmtDate, partInScope, canPersonaEdit } from '../scope'
import { makeEntryId } from '../../domain'
import { BulkFillDialog } from '../bulk/BulkFillDialog'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'
import { hasMyWork } from './workQueue'
import { ReleasePanel } from './ReleasePanel'
import { DelayPanel } from '../delay/DelayPanel'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useApprovalRows } from './approvalRows'
import type { ApprovalRow, ApprovalType } from './approvalRows'
import { PartDetailDrawer } from '../workspace/PartDetailDrawer'
import { useExceptionData } from '../exceptions/useExceptionData'
import { DownloadMenu } from '../export/DownloadMenu'
import { ExportSection } from '../export/ExportSection'
import { useViewMode, ViewModeToggle } from '../viewmode'
import { MultiSelect } from '../intake/MultiSelect'
import { SortMenu } from './SortMenu'
import type { SortDir } from './SortMenu'

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

/** The same worklist items rendered as a dense table (toggleable from the card view). */
function ApprovalTable({
  rows, selected, onToggle, onOpen, onApprove, onSendBack
}: {
  rows: ApprovalRow[]
  selected: Set<string>
  onToggle: (k: string) => void
  onOpen: (r: ApprovalRow) => void
  onApprove: (r: ApprovalRow) => void
  onSendBack: (r: ApprovalRow) => void
}) {
  const th = 'text-left px-3 py-2.5 font-medium text-[var(--color-muted)] whitespace-nowrap'
  return (
    <Card flush>
      <div className="table-scroll cta-pin">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className={`${th} w-8`}></th>
              <th className={th}>Type</th>
              <th className={th}>Activity</th>
              <th className={th}>Part</th>
              <th className={th}>Vendor</th>
              <th className={th}>Model</th>
              <th className={th}>Dept</th>
              <th className={th}>Trial</th>
              <th className={th}>{rows.some((r) => r.mode === 'enter') ? 'Updated / submitted' : 'Submitted'} by</th>
              <th className={th}>On</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const approveLabel = r.type === 'Delay Reason' ? 'Accept' : r.type === 'Action' ? 'Mark done' : 'Approve'
              return (
                <tr
                  key={r.key}
                  className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40"
                  onClick={() => onOpen(r)}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.mode === 'approve' && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.partNo} ${r.type}`}
                        checked={selected.has(r.key)}
                        onChange={() => onToggle(r.key)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${APPROVAL_TYPE_STYLE[r.type]}`}>{r.type}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--color-text)]">{r.title}</div>
                    {r.statusLabel && <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[r.statusLabel] ?? 'bg-slate-100 text-slate-700'}`}>{r.statusLabel}</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{r.partNo}</td>
                  <td className="px-3 py-2.5">{r.vendorCode} · {r.vendorName}</td>
                  <td className="px-3 py-2.5">{r.model}</td>
                  <td className="px-3 py-2.5">{r.department}</td>
                  <td className="px-3 py-2.5"><span className="whitespace-nowrap rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{r.trial}</span></td>
                  <td className="px-3 py-2.5">{r.submittedByName || r.submittedByRole || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{fmtDateTime(r.submittedOn)}</td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-none items-center justify-end gap-1.5">
                      {r.mode === 'enter' ? (
                        <Button variant="primary" size="sm" onClick={() => onOpen(r)}>Open form</Button>
                      ) : (
                        <>
                          <Button variant="primary" size="sm" onClick={() => onApprove(r)}>{approveLabel}</Button>
                          {r.type !== 'Action' && <Button variant="secondary" size="sm" onClick={() => onSendBack(r)}>Send back</Button>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * Merged Worklist: one card per item for the current role — the work they enter and the things they approve, at the
 * same granularity as before (one activity-part per card). A segment switches between "To enter" and "To approve".
 * Multi-select to approve in one go; clicking a card opens the activity form in a drawer.
 */
interface WorkFilters {
  model: string[]; dept: string[]; milestone: string[]; pic: string[]
  partNo: string[]; vendorCode: string[]; activity: string[]
}

// Sort fields for the worklist (both card and table views use these).
type WorkSortKey = 'submittedOn' | 'partNo' | 'model' | 'department' | 'vendorName' | 'trial' | 'activity' | 'type'
const WORK_SORT_OPTIONS: { key: WorkSortKey; label: string }[] = [
  { key: 'submittedOn', label: 'Submitted / updated' },
  { key: 'partNo', label: 'Part number' },
  { key: 'activity', label: 'Activity' },
  { key: 'model', label: 'Model' },
  { key: 'department', label: 'Department' },
  { key: 'vendorName', label: 'Vendor' },
  { key: 'trial', label: 'Trial' },
  { key: 'type', label: 'Type' },
]
const workSortValue = (r: ApprovalRow, k: WorkSortKey): string =>
  k === 'submittedOn' ? (r.submittedOn ?? '')
    : k === 'partNo' ? r.partNo
    : k === 'model' ? r.model
    : k === 'department' ? (r.department ?? '')
    : k === 'vendorName' ? r.vendorName
    : k === 'trial' ? r.trial
    : k === 'activity' ? r.title
    : r.type

function ApprovalsPanel({ filters, filterBar }: { filters: WorkFilters; filterBar?: React.ReactNode }) {
  const allRows = useApprovalRows()
  const inSel = (sel: string[], v: string) => sel.length === 0 || sel.includes(v)
  const filtered = useMemo(
    () =>
      allRows.filter((r) => {
        if (!inSel(filters.model, r.model)) return false
        if (!inSel(filters.dept, r.department)) return false
        if (!inSel(filters.milestone, r.trial)) return false
        if (!inSel(filters.vendorCode, r.vendorCode)) return false
        if (!inSel(filters.pic, r.pic)) return false
        if (!inSel(filters.partNo, r.partNo)) return false
        if (!inSel(filters.activity, r.title)) return false
        return true
      }),
    [allRows, filters]
  )
  const [sortKey, setSortKey] = useState<WorkSortKey>('submittedOn')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const cmp = workSortValue(a, sortKey).localeCompare(workSortValue(b, sortKey), undefined, { numeric: true })
      return (cmp || a.partNo.localeCompare(b.partNo)) * dir
    })
  }, [filtered, sortKey, sortDir])
  const { activities, templateRows, transitionEntryState, advanceDeviation, decideDelayReasons, updateAction } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [segment, setSegment] = useState<'all' | 'enter' | 'approve'>('all')
  const [viewMode, setViewMode] = useViewMode('worklist')
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
      <section className="epmp-card flex items-center gap-3 overflow-x-auto px-4 py-3">
        <div className="flex-none">
          <Tabs
            activeId={segment}
            onChange={(id) => { setSegment(id as 'all' | 'enter' | 'approve'); setPicked(new Set()) }}
            items={[
              { id: 'all', label: 'All', badge: rows.length || undefined },
              { id: 'enter', label: 'To enter', badge: enterRows.length || undefined },
              { id: 'approve', label: 'To approve', badge: approveRows.length || undefined }
            ]}
          />
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          {notice && <span className="whitespace-nowrap text-[11px] text-emerald-700" role="status">{notice}</span>}
          <SortMenu options={WORK_SORT_OPTIONS} sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d) }} />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          {selectableShown.length > 0 && (
            <label className="flex flex-none items-center gap-1.5 whitespace-nowrap text-[11px] text-[#344054]">
              <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(selectableShown.map((r) => r.key)))} />
              Select all
            </label>
          )}
          <Button variant="primary" size="sm" className="whitespace-nowrap" disabled={selected.size === 0} onClick={approveSelected}>
            Approve selected ({selected.size})
          </Button>
        </div>
      </section>
      </div>

      {shown.length === 0 ? (
        <Card><p className="py-12 text-center text-sm text-[var(--color-muted)]">Nothing here right now.</p></Card>
      ) : viewMode === 'table' ? (
        <ApprovalTable
          rows={shown}
          selected={selected}
          onToggle={toggle}
          onOpen={setOpenRow}
          onApprove={(r) => { approveOne(r); setNotice(r.type === 'Delay Reason' ? 'Accepted.' : r.type === 'Action' ? 'Marked done.' : 'Approved.') }}
          onSendBack={(r) => { setSendBack(r); setComment('') }}
        />
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

interface LabeledOption { value: string; label: string }

interface FilterBarProps {
  model: string[]; setModel: (v: string[]) => void; modelOptions: string[]
  dept: string[]; setDept: (v: string[]) => void; deptOptions: string[]
  vendorCode: string[]; setVendorCode: (v: string[]) => void; vendorOptions: LabeledOption[]
  milestone: string[]; setMilestone: (v: string[]) => void; milestoneOptions: string[]
  pic: string[]; setPic: (v: string[]) => void; picOptions: LabeledOption[]
  partNo: string[]; setPartNo: (v: string[]) => void; partOptions: LabeledOption[]
  activity: string[]; setActivity: (v: string[]) => void; activityOptions: string[]
  status: string[]; setStatus: (v: string[]) => void; statusOptions: string[]
  /** Status (work bucket) is an Insights concept; the Worklist hides it. */
  showStatus?: boolean
  hasFilters: boolean; clearFilters: () => void
}

/**
 * Primary filters inline, the rest behind "More filters". Every filter is a multi-select (MultiSelect) so the
 * user can pick several values at once — nothing ticked means "All". Uses the shared MultiSelect for a look
 * that matches the Exception/Intake filter bars.
 */
function CompactFilterBar(f: FilterBarProps) {
  const [more, setMore] = useState(false)
  const plain = (opts: string[]) => opts.map((o) => ({ value: o }))
  return (
    <section className="epmp-card mb-3 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {f.showStatus && <MultiSelect label="Status" options={plain(f.statusOptions)} selected={f.status} onChange={f.setStatus} />}
        <MultiSelect label="Model" options={plain(f.modelOptions)} selected={f.model} onChange={f.setModel} />
        <MultiSelect label="Dept" options={plain(f.deptOptions)} selected={f.dept} onChange={f.setDept} />
        <MultiSelect label="Vendor" options={f.vendorOptions} selected={f.vendorCode} onChange={f.setVendorCode} />
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
          <MultiSelect label="Trial" options={plain(f.milestoneOptions)} selected={f.milestone} onChange={f.setMilestone} />
          <MultiSelect label="Activity" options={plain(f.activityOptions)} selected={f.activity} onChange={f.setActivity} />
          <MultiSelect label="PIC" options={f.picOptions} selected={f.pic} onChange={f.setPic} />
          <MultiSelect label="Part" options={f.partOptions} selected={f.partNo} onChange={f.setPartNo} />
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
      data-export-stat={title}
      data-export-stat-value={value}
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
      <ExportSection id="mw-ov-kpis" label="Overview – key metrics" className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Pending release" value={pendingRelease} color="#d97706" icon="reply" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Awaiting acknowledgement" value={awaitingAck} color="#2563eb" icon="clipboard" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Returned by vendor" value={returned} color="#dc2626" icon="undo" onClick={() => onGo('actions', { focus: 'release' })} />
        <KpiCard title="Delay reviews" value={delayReviews} color="#2563eb" icon="clipboard-list" onClick={() => onGo('actions', { focus: 'delay' })} />
        <KpiCard title="Delayed activities" value={totals.Delayed} color="#d97706" icon="calendar-month" onClick={() => onGo('insights', { bucket: 'Delayed' })} />
        <KpiCard title="NG / Rework" value={totals.NG} color="#dc2626" icon="exclamation-circle" onClick={() => onGo('insights', { bucket: 'NG' })} />
      </ExportSection>

      {/* Activity snapshot */}
      <ExportSection id="mw-ov-snapshot" label="Overview – activity snapshot"><section className="epmp-card mb-4 px-5 py-3">
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
      </section></ExportSection>
      </div>

      {/* Priority actions — fills the remaining height; its list scrolls while the top stays frozen. */}
      <ExportSection id="mw-ov-priority" label="Overview – priority actions"><section className="epmp-card flex min-h-0 flex-1 flex-col px-5 py-3">
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
      </section></ExportSection>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function MyWorkPage() {
  const { activities, entries, templateRows, models, parts, partReleases, partAcks, picAssignments, updateEntryValues, transitionEntryState } = useQAStore()
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

  // Filters (the client's set). Multi-select: empty array = All. Vendor/Part/PIC are "code: name" pickers.
  const [fModel, setFModel] = useState<string[]>([])
  const [fDept, setFDept] = useState<string[]>([])
  const [fMilestone, setFMilestone] = useState<string[]>([])
  const [fPic, setFPic] = useState<string[]>([])          // PIC names (shown as "staffId: name")
  const [fPartNo, setFPartNo] = useState<string[]>([])     // exact part numbers (shown as "partNo: name")
  const [fVendorCode, setFVendorCode] = useState<string[]>([]) // vendor codes (shown as "code: name")
  const [fActivity, setFActivity] = useState<string[]>([]) // activity names
  const [fStatus, setFStatus] = useState<string[]>([]) // work bucket: Upcoming/Completed/Delayed/NG
  // Workspace drill state.
  const [groupDim, setGroupDim] = useState<'model' | 'vendor' | 'department' | 'milestone'>('model')
  const [selectedBucket, setSelectedBucket] = useState<WorkBucket | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  // Insights "Open form" opens the activity form as a drawer over Insights (closing returns here, not the Activity page).
  const [openInstance, setOpenInstance] = useState<FilteredInstance | null>(null)
  // Insights bulk fill: ticked rows (key = templateRowId|partNo) + the dialog.
  const [insPicked, setInsPicked] = useState<Set<string>>(new Set())
  const [insBulkOpen, setInsBulkOpen] = useState(false)
  const [insNotice, setInsNotice] = useState('')
  // Detail-table sort + per-column filter.
  const [detailView, setDetailView] = useViewMode('insights-detail', 'table')
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
  const activityOptions = useMemo(() => opt(allInstances.map((i) => i.activity.name)), [allInstances])
  // Merged "code: name" pickers — one row per distinct code, value = code (or name for PIC).
  const uniqBy = <T,>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T>()
    for (const r of rows) { const k = key(r); if (k && !m.has(k)) m.set(k, r) }
    return Array.from(m.values())
  }
  const vendorOptions = useMemo<LabeledOption[]>(
    () => uniqBy(allInstances, (i) => i.part.vendorCode).map((i) => ({ value: i.part.vendorCode, label: `${i.part.vendorCode}: ${i.part.vendorName}` })).sort((a, b) => a.label.localeCompare(b.label)),
    [allInstances]
  )
  const partOptions = useMemo<LabeledOption[]>(
    () => uniqBy(allInstances, (i) => i.part.partNo).map((i) => ({ value: i.part.partNo, label: `${i.part.partNo}: ${i.part.partName}` })).sort((a, b) => a.label.localeCompare(b.label)),
    [allInstances]
  )
  const picOptions = useMemo<LabeledOption[]>(
    () => uniqBy(allInstances, (i) => getPicOn(i.part, picAssignments, DEMO_TODAY).name)
      .map((i) => { const name = getPicOn(i.part, picAssignments, DEMO_TODAY).name; const sid = i.part.attrs?.qa_pic_staff_id; return { value: name, label: sid ? `${sid}: ${name}` : name } })
      .sort((a, b) => a.label.localeCompare(b.label)),
    [allInstances, picAssignments]
  )

  const hasFilters = [fModel, fDept, fMilestone, fPic, fVendorCode, fPartNo, fActivity, fStatus].some((v) => v.length > 0)
  function clearFilters() {
    setFModel([]); setFDept([]); setFMilestone([]); setFPic([])
    setFPartNo([]); setFVendorCode([]); setFActivity([]); setFStatus([])
  }
  // Multi-select match: an empty picker means "All"; otherwise the value must be one of the ticked ones.
  const inSel = (sel: string[], v: string) => sel.length === 0 || sel.includes(v)

  // Apply the filters.
  const instances = useMemo(
    () =>
      allInstances.filter((i) => {
        if (!inSel(fModel, i.part.model)) return false
        if (!inSel(fDept, i.part.department || 'Other')) return false
        if (!inSel(fMilestone, i.row.milestoneId)) return false
        if (!inSel(fVendorCode, i.part.vendorCode)) return false
        if (!inSel(fPic, getPicOn(i.part, picAssignments, DEMO_TODAY).name)) return false
        if (!inSel(fPartNo, i.part.partNo)) return false
        if (!inSel(fActivity, i.activity.name)) return false
        if (!inSel(fStatus, workBucket(i) ?? '')) return false
        return true
      }),
    [allInstances, fModel, fDept, fMilestone, fVendorCode, fPic, fPartNo, fActivity, fStatus, picAssignments]
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

  // ── Insights bulk fill ──
  const insKey = (i: FilteredInstance) => `${i.row.id}|${i.part.partNo}`
  // Only ticks on rows still shown count (filters/drill can hide ticked rows).
  const insSelected = useMemo(() => tableRows.filter((i) => insPicked.has(insKey(i))), [tableRows, insPicked])
  const insAllOn = tableRows.length > 0 && insSelected.length === tableRows.length
  const insToggle = (i: FilteredInstance) =>
    setInsPicked((prev) => { const n = new Set(prev); const k = insKey(i); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const insToggleAll = () => setInsPicked(insAllOn ? new Set() : new Set(tableRows.map(insKey)))
  // Rows can be different activities: offer only fields every selected row has (same key) and this persona can fill.
  const insCommonFields = useMemo(() => {
    if (insSelected.length === 0) return []
    const fillable = (i: FilteredInstance) =>
      i.activity.fields.filter((f) => !f.dataOnly && f.type !== 'table' && canPersonaEdit(f, currentPersona, i.entry))
    const [first, ...rest] = insSelected
    return fillable(first).filter((f) => rest.every((i) => fillable(i).some((g) => g.key === f.key)))
  }, [insSelected, currentPersona])
  const insActivityCount = new Set(insSelected.map((i) => i.activity.id)).size

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
        <div className="flex items-center gap-2">
          <UpcomingToggle />
          <DownloadMenu title={`My Workspace – ${{ overview: 'Overview', actions: 'My Actions', worklist: 'Worklist', insights: 'Insights' }[effectiveView]}`} />
        </div>
      </div>

      {/* Filters — shown on Insights (charts); the Worklist renders its own sticky filter bar */}
      {effectiveView === 'insights' && (
      <div className="epmp-sticky-pane sticky top-0 z-20 -mx-4 -mt-1 px-4 pt-2 pb-1 lg:-mx-7 lg:px-7">
        <CompactFilterBar
          model={fModel} setModel={setFModel} modelOptions={modelOptions}
          dept={fDept} setDept={setFDept} deptOptions={deptOptions}
          vendorCode={fVendorCode} setVendorCode={setFVendorCode} vendorOptions={vendorOptions}
          milestone={fMilestone} setMilestone={setFMilestone} milestoneOptions={milestoneOptions}
          pic={fPic} setPic={setFPic} picOptions={picOptions}
          partNo={fPartNo} setPartNo={setFPartNo} partOptions={partOptions}
          activity={fActivity} setActivity={setFActivity} activityOptions={activityOptions}
          status={fStatus} setStatus={setFStatus} statusOptions={[...WORK_BUCKETS]} showStatus
          hasFilters={hasFilters} clearFilters={clearFilters}
        />
      </div>
      )}

      {effectiveView === 'worklist' ? (
        <ExportSection id="mw-worklist" label="Worklist / Approval"><ApprovalsPanel
          filters={{ model: fModel, dept: fDept, milestone: fMilestone, pic: fPic, partNo: fPartNo, vendorCode: fVendorCode, activity: fActivity }}
          filterBar={
            <CompactFilterBar
              model={fModel} setModel={setFModel} modelOptions={modelOptions}
              dept={fDept} setDept={setFDept} deptOptions={deptOptions}
              vendorCode={fVendorCode} setVendorCode={setFVendorCode} vendorOptions={vendorOptions}
              milestone={fMilestone} setMilestone={setFMilestone} milestoneOptions={milestoneOptions}
              pic={fPic} setPic={setFPic} picOptions={picOptions}
              partNo={fPartNo} setPartNo={setFPartNo} partOptions={partOptions}
              activity={fActivity} setActivity={setFActivity} activityOptions={activityOptions}
              status={fStatus} setStatus={setFStatus} statusOptions={[...WORK_BUCKETS]}
              hasFilters={hasFilters} clearFilters={clearFilters}
            />
          }
        /></ExportSection>
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
          <ExportSection id="mw-release-sec" label="Release to vendor"><div id="mw-release"><ReleasePanel /></div></ExportSection>
          <ExportSection id="mw-delay-sec" label="Delay reasons"><div id="mw-delay"><DelayPanel /></div></ExportSection>
        </>
      ) : (
        <>
          {/* Insights: tiles + performance charts (no transactional tables) */}
          <ExportSection id="mw-ins-tiles" label="Insights – bucket totals" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {WORK_BUCKETS.map((b) => (
              <BucketTile
                key={b} bucket={b} count={totals[b]}
                active={selectedBucket === b}
                onClick={() => setSelectedBucket(selectedBucket === b ? null : b)}
              />
            ))}
          </ExportSection>

          {/* Graphical: stacked bars by the chosen dimension */}
          <ExportSection id="mw-ins-chart" label="Insights – performance chart"><Card className="mb-4">
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
          </Card></ExportSection>

          {/* Detail table — appears for the selected bucket/group (KPI/NG drill lands here) */}
          <div id="mw-detail" />
          <ExportSection id="mw-ins-detail" label="Insights – parts detail"><Card flush className="!overflow-visible">
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
                {anyColFilter && detailView === 'table' && (
                  <button onClick={() => setColFilters({ status: '', partNo: '', partName: '', model: '', department: '', vendorName: '', milestoneId: '', activity: '', planned: '' })}
                    className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Clear column filters</button>
                )}
                {(selectedBucket || selectedGroup) && (
                  <button onClick={() => { setSelectedBucket(null); setSelectedGroup(null) }} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Show all</button>
                )}
                <SortMenu options={TABLE_COLS} sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d) }} />
                <ViewModeToggle value={detailView} onChange={setDetailView} />
              </div>
            </div>
            {/* Bulk bar: appears when rows are ticked; fills the fields they share for all of them at once. */}
            {(insSelected.length > 0 || insNotice) && (
              <div data-export-ignore="true" className="flex flex-wrap items-center gap-3 border-b border-[#bfdbfe] bg-secondary px-4 py-2 text-sm">
                {insSelected.length > 0 && (
                  <>
                    <span className="font-medium text-primary">{insSelected.length} selected</span>
                    <Button variant="primary" size="sm" disabled={insCommonFields.length === 0} onClick={() => setInsBulkOpen(true)}
                      title={insCommonFields.length === 0 ? 'The selected rows have no fields in common that you can fill' : undefined}>
                      Fill selected ({insSelected.length})
                    </Button>
                    {insCommonFields.length === 0 && (
                      <span className="text-[11px] text-[var(--color-muted)]">No common fields you can fill for these rows.</span>
                    )}
                  </>
                )}
                {insNotice && <span className="text-[11px] text-emerald-700" role="status">{insNotice}</span>}
                {insSelected.length > 0 && (
                  <button onClick={() => setInsPicked(new Set())} className="ml-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Clear selection</button>
                )}
              </div>
            )}
            {detailView === 'card' ? (
              <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {tableRows.length === 0 ? (
                  <p className="col-span-full px-4 py-10 text-center text-[var(--color-muted)]">No parts in this selection.</p>
                ) : tableRows.map((i) => {
                  const b = workBucket(i)!
                  const planned = i.dates.status === 'resolved' ? `${fmtDate(i.dates.start)} → ${fmtDate(i.dates.end)}` : 'Awaiting MRD'
                  return (
                    <div key={`${i.row.id}-${i.part.partNo}`} className={`epmp-card flex flex-col gap-2 px-4 py-3 ${insPicked.has(insKey(i)) ? 'ring-2 ring-[#bfdbfe]' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <input type="checkbox" aria-label={`Select ${i.part.partNo} ${i.activity.name}`}
                          checked={insPicked.has(insKey(i))} onChange={() => insToggle(i)} />
                        <span className="mr-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: `${WORK_BUCKET_COLORS[b]}1a`, color: WORK_BUCKET_COLORS[b] }}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}
                        </span>
                        <span className="whitespace-nowrap rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{i.row.milestoneId}</span>
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--color-text)]">{i.activity.name}</div>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                          <span>Part <span className="font-mono text-[var(--color-text)]">{i.part.partNo}</span></span>
                          <span>Model <span className="text-[var(--color-text)]">{i.part.model}</span></span>
                          <span>Dept <span className="text-[var(--color-text)]">{i.part.department}</span></span>
                          <span>Vendor <span className="text-[var(--color-text)]">{i.part.vendorName}</span></span>
                          <span className="col-span-2">Planned <span className="text-[var(--color-text)]">{planned}</span></span>
                        </div>
                      </div>
                      <Button variant="primary" size="sm" className="mt-auto self-start" onClick={() => setOpenInstance(i)}>Open form</Button>
                    </div>
                  )
                })}
              </div>
            ) : (
            /* Table: the row scrolls sideways inside this wrapper; the Open (CTA) column stays pinned right (.cta-pin). */
            <div className="page-sticky-head cta-pin">
              <table className="w-full text-sm">
                <thead>
                  {/* Sortable header row */}
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={`${thCls} w-8`} data-export-ignore="true">
                      <input type="checkbox" aria-label="Select all rows" checked={insAllOn} onChange={insToggleAll} />
                    </th>
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
                  <tr data-export-ignore="true" className="border-b border-[var(--color-border)] bg-white">
                    <th></th>
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
                      <tr key={`${i.row.id}-${i.part.partNo}`} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40 ${insPicked.has(insKey(i)) ? 'bg-secondary/60' : ''}`}>
                        <td className="px-3 py-2.5" data-export-ignore="true">
                          <input type="checkbox" aria-label={`Select ${i.part.partNo} ${i.activity.name}`}
                            checked={insPicked.has(insKey(i))} onChange={() => insToggle(i)} />
                        </td>
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
                          {/* Opens the form as a drawer over Insights; closing returns here, not the Activity page. */}
                          <Button variant="primary" size="sm" onClick={() => setOpenInstance(i)}>Open form</Button>
                        </td>
                      </tr>
                    )
                  })}
                  {tableRows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts in this selection.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </Card></ExportSection>
        </>
      )}

      {/* Insights bulk fill: the shared fields of the ticked rows, written to each row's own activity entry. */}
      {insBulkOpen && (
        <BulkFillDialog
          title={`Fill ${insSelected.length} row${insSelected.length === 1 ? '' : 's'}`}
          note={insActivityCount > 1 ? `${insActivityCount} activities — only the fields they share are shown` : insSelected[0]?.activity.name}
          fields={insCommonFields}
          targetCount={insSelected.length}
          currentPersona={currentPersona}
          onClose={() => setInsBulkOpen(false)}
          onApply={(values, submit) => {
            for (const i of insSelected) {
              updateEntryValues(i.row.id, i.part.partNo, values, currentPersona)
              if (submit) transitionEntryState(makeEntryId(i.row.id, i.part.partNo), 'Submit', undefined, currentPersona)
            }
            const n = insSelected.length
            setInsNotice(`${submit ? 'Saved and submitted' : 'Saved'} for ${n} row${n === 1 ? '' : 's'}.`)
            setInsBulkOpen(false)
            setInsPicked(new Set())
          }}
        />
      )}

      {/* Insights "Open form": the activity form opens over this page; closing returns to Insights. */}
      {openInstance && (
        <PartDetailDrawer
          activity={openInstance.activity}
          row={openInstance.row}
          partNo={openInstance.part.partNo}
          onClose={() => setOpenInstance(null)}
        />
      )}
    </div>
  )
}
