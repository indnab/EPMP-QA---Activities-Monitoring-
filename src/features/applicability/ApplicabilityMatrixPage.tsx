import { useMemo, useState } from 'react'
import { PageHeader, Card, Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { ActivityDefinition, PartRecord, TemplateRow } from '../../domain'
import { canMarkNotApplicable, canReverseNotApplicable, partInScope, rowInScope } from '../scope'
import { DownloadMenu } from '../export/DownloadMenu'
import { ExportSection } from '../export/ExportSection'

const inputCls =
  'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054] placeholder-[var(--color-muted)]'
const thCls = 'px-3 py-3 text-left font-medium text-[var(--color-muted)] align-bottom'

interface Column {
  row: TemplateRow
  activity: ActivityDefinition
  milestoneLabel: string
}

/** Whether an activity applies to a part's type at all (before any Not-applicable marking). */
function activityFitsPart(activity: ActivityDefinition, part: PartRecord): boolean {
  if (activity.scope === 'NewPart') return part.type === 'NewPart'
  if (activity.scope === 'ECN') return part.type === 'ECN'
  return true
}

const cellKey = (rowId: string, partNo: string) => `${rowId}|${partNo}`

/**
 * Applicability matrix: parts as rows, Not-applicable-eligible activities as columns.
 * Ticks are staged locally and applied together through the store's setNotApplicable action.
 */
export function ApplicabilityMatrixPage() {
  const { activities, entries, templateRows, milestones, parts: allParts, setNotApplicable } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canMark = canMarkNotApplicable(currentPersona)
  const canReverse = canReverseNotApplicable(currentPersona)

  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [milestoneFilter, setMilestoneFilter] = useState('All')
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map())
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reason, setReason] = useState('')

  const parts = useMemo(
    () => allParts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)),
    [allParts, currentPersona]
  )

  // Eligible activities: flag on, published, template row visible to the persona
  const allColumns = useMemo<Column[]>(() => {
    const order = new Map(milestones.map((m, i) => [m.id, i]))
    const cols: Column[] = []
    for (const row of templateRows) {
      if (!rowInScope(row, currentPersona)) continue
      const activity = activities.find((a) => a.id === row.activityId)
      if (!activity || activity.published === false || !activity.allowNotApplicable) continue
      cols.push({ row, activity, milestoneLabel: milestones.find((m) => m.id === row.milestoneId)?.label ?? row.milestoneId })
    }
    return cols.sort(
      (a, b) =>
        (order.get(a.row.milestoneId) ?? 99) - (order.get(b.row.milestoneId) ?? 99) ||
        a.activity.name.localeCompare(b.activity.name)
    )
  }, [templateRows, activities, milestones, currentPersona])

  const columns = useMemo(
    () => allColumns.filter((c) => milestoneFilter === 'All' || c.row.milestoneId === milestoneFilter),
    [allColumns, milestoneFilter]
  )

  const models = useMemo(() => Array.from(new Set(parts.map((p) => p.model))).sort(), [parts])
  const vendors = useMemo(() => Array.from(new Set(parts.map((p) => p.vendorName))).sort(), [parts])

  const visibleParts = useMemo(
    () =>
      parts.filter((p) => {
        if (modelFilter !== 'All' && p.model !== modelFilter) return false
        if (vendorFilter !== 'All' && p.vendorName !== vendorFilter) return false
        if (search && !`${p.partNo} ${p.partName}`.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [parts, modelFilter, vendorFilter, search]
  )

  // Saved state per cell
  const savedNa = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) if (e.notApplicable) set.add(cellKey(e.templateRowId, e.partNo))
    return set
  }, [entries])

  /** A cell exists when the activity's row is in the part's section and fits its type. */
  const cellExists = (c: Column, p: PartRecord) => c.row.section === p.section && activityFitsPart(c.activity, p)
  const isSaved = (key: string) => savedNa.has(key)
  const isChecked = (key: string) => (staged.has(key) ? staged.get(key)! : isSaved(key))
  /** Marking needs the PIC role; reversing needs PIC, SIC or Admin. Editability follows the saved state. */
  const isEditable = (key: string) => (isSaved(key) ? canReverse : canMark)

  const stageCells = (keys: string[], checked: boolean) =>
    setStaged((prev) => {
      const next = new Map(prev)
      for (const key of keys) {
        if (checked === isSaved(key)) next.delete(key)
        else next.set(key, checked)
      }
      return next
    })

  /** Toggle a group of cells: untick them all if every editable one is ticked, otherwise tick them all. */
  const toggleGroup = (keys: string[]) => {
    const editable = keys.filter(isEditable)
    if (editable.length === 0) return
    const allTicked = editable.every(isChecked)
    stageCells(editable, !allTicked)
  }

  const colKeys = (c: Column) => visibleParts.filter((p) => cellExists(c, p)).map((p) => cellKey(c.row.id, p.partNo))
  const rowKeys = (p: PartRecord) => columns.filter((c) => cellExists(c, p)).map((c) => cellKey(c.row.id, p.partNo))

  // Staged changes grouped for the summary and the apply step
  const changes = useMemo(() => {
    const byRow = new Map<string, { mark: string[]; reverse: string[] }>()
    for (const [key, checked] of staged) {
      const [rowId, partNo] = key.split('|')
      const g = byRow.get(rowId) ?? { mark: [], reverse: [] }
      ;(checked ? g.mark : g.reverse).push(partNo)
      byRow.set(rowId, g)
    }
    return byRow
  }, [staged])

  const markCount = Array.from(changes.values()).reduce((n, g) => n + g.mark.length, 0)
  const reverseCount = Array.from(changes.values()).reduce((n, g) => n + g.reverse.length, 0)

  const apply = () => {
    for (const [rowId, g] of changes) {
      if (g.mark.length) setNotApplicable(rowId, g.mark, true, currentPersona, reason)
      if (g.reverse.length) setNotApplicable(rowId, g.reverse, false, currentPersona, reason)
    }
    setStaged(new Map())
    setReason('')
    setReviewOpen(false)
  }

  const hasFilters = search !== '' || modelFilter !== 'All' || vendorFilter !== 'All' || milestoneFilter !== 'All'
  const readOnly = !canMark && !canReverse
  const totalNa = savedNa.size

  return (
    <div>
      <PageHeader
        title="Applicability"
        section="Modules"
        description="Tick the parts an activity does not apply to. Only activities that Admin has opened for part-level Not applicable appear as columns. Changes are staged until you apply them."
        actions={<DownloadMenu title="Applicability Matrix" />}
      />

      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
        <input
          type="text"
          placeholder="Search part…"
          aria-label="Search parts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} w-56 max-w-full`}
        />
        <select aria-label="Model" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={inputCls}>
          <option value="All">All models</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Vendor" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className={inputCls}>
          <option value="All">All vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="Milestone" value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)} className={inputCls}>
          <option value="All">All milestones</option>
          {milestones.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('')
              setModelFilter('All')
              setVendorFilter('All')
              setMilestoneFilter('All')
            }}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-[var(--color-muted)]">
          {allColumns.length} eligible {allColumns.length === 1 ? 'activity' : 'activities'} · {visibleParts.length} of {parts.length} parts · {totalNa} marked Not applicable
        </span>
      </section>

      {readOnly && (
        <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
          Read-only. Only a PIC can mark parts Not applicable; PIC, SIC and Admin can reverse a mark.
        </div>
      )}
      {!readOnly && !canMark && (
        <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
          Only a PIC can mark parts Not applicable. You can reverse existing marks.
        </div>
      )}

      {staged.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#bfdbfe] bg-secondary px-4 py-2 text-sm">
          <span className="font-medium text-primary">
            {staged.size} {staged.size === 1 ? 'change' : 'changes'} staged
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            {markCount} to mark Not applicable · {reverseCount} to mark applicable again
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setStaged(new Map())}>Discard</Button>
            <Button size="sm" onClick={() => setReviewOpen(true)}>Review and apply</Button>
          </div>
        </div>
      )}

      <ExportSection id="appl-matrix" label="Applicability matrix"><Card flush>
        {columns.length === 0 ? (
          <div className="px-4 py-12 text-center text-[var(--color-muted)]">
            <p className="font-medium">No activities allow part-level Not applicable</p>
            <p className="mt-1 text-sm">
              The Admin turns this on per activity in the Builder ("Allow PIC to mark parts Not applicable").
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className={`${thCls} min-w-[220px]`}>Part</th>
                  <th className={thCls}>Model</th>
                  <th className={`${thCls} text-center`} title="Tick or untick every activity for this part">All</th>
                  {columns.map((c) => {
                    const keys = colKeys(c)
                    const editable = keys.filter(isEditable)
                    const ticked = keys.filter(isChecked).length
                    return (
                      <th key={c.row.id} className={`${thCls} min-w-[150px] text-center`}>
                        <label className="flex cursor-pointer flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            aria-label={`Toggle ${c.activity.name} for all shown parts`}
                            disabled={editable.length === 0}
                            checked={editable.length > 0 && editable.every(isChecked)}
                            onChange={() => toggleGroup(keys)}
                          />
                          <span className="font-medium text-[var(--color-text)]">{c.activity.name}</span>
                          <span className="text-[10px] font-normal">{c.milestoneLabel} · {c.row.section}</span>
                          <span className="text-[10px] font-normal">{ticked} of {keys.length} Not applicable</span>
                        </label>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleParts.map((p) => {
                  const keys = rowKeys(p)
                  const editable = keys.filter(isEditable)
                  return (
                    <tr key={p.partNo} className="border-b border-[var(--color-border)] hover:bg-secondary/50">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[var(--color-text)]">{p.partName}</div>
                        <div className="font-mono text-[10px] text-[var(--color-muted)]">{p.partNo} · {p.vendorName}</div>
                      </td>
                      <td className="px-3 py-2.5">{p.model}</td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Toggle every activity for ${p.partNo}`}
                          disabled={editable.length === 0}
                          checked={editable.length > 0 && editable.every(isChecked)}
                          onChange={() => toggleGroup(keys)}
                        />
                      </td>
                      {columns.map((c) => {
                        if (!cellExists(c, p)) {
                          return (
                            <td key={c.row.id} className="px-3 py-2.5 text-center text-[var(--color-muted)]" title="This activity does not apply to this part type or section">
                              —
                            </td>
                          )
                        }
                        const key = cellKey(c.row.id, p.partNo)
                        const pending = staged.has(key)
                        return (
                          <td key={c.row.id} className={`px-3 py-2.5 text-center ${pending ? 'bg-[#fffbeb]' : ''}`}>
                            <input
                              type="checkbox"
                              aria-label={`${c.activity.name} Not applicable for ${p.partNo}`}
                              checked={isChecked(key)}
                              disabled={!isEditable(key)}
                              onChange={(e) => stageCells([key], e.target.checked)}
                            />
                            {isChecked(key) && <span className="sr-only">NA</span>}
                            {pending && <span className="sr-only">staged</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {visibleParts.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts match.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card></ExportSection>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        Ticked = Not applicable. A "—" means the activity does not apply to that part's type or section. Highlighted cells are staged and not yet saved.
      </p>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        size="md"
        title={`Apply ${staged.size} ${staged.size === 1 ? 'change' : 'changes'}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={apply}>Apply changes</Button>
          </>
        }
      >
        <ul className="mb-4 space-y-1.5 text-sm">
          {Array.from(changes.entries()).map(([rowId, g]) => {
            const col = allColumns.find((c) => c.row.id === rowId)
            return (
              <li key={rowId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{col?.activity.name ?? rowId}</span>
                <span className="text-[11px] text-[var(--color-muted)]">{col?.milestoneLabel}</span>
                {g.mark.length > 0 && <span>{g.mark.length} to Not applicable</span>}
                {g.reverse.length > 0 && <span>{g.reverse.length} to applicable again</span>}
              </li>
            )
          })}
        </ul>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason (optional, applies to every change)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Plastic parts, no sheet metal content"
            className="w-full rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </label>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Each change is logged with your name and the date in that part's history for that activity.
        </p>
      </Modal>
    </div>
  )
}
