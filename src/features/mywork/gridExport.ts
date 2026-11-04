import type { FieldDefinition } from '../../domain'
import type { PersonaId } from '../../store/personaStore'
import { fmtDate } from '../scope'
import { formatValue } from './gridModel'
import type { GridMode, RowModel } from './gridModel'
import { buildCsv, safeFilePart } from './csv'

const STATUS_TEXT: Record<string, string> = {
  NotStarted: 'Not started',
  Draft: 'Draft',
  'Sent back': 'Sent back',
  Submitted: 'Submitted',
  Approved: 'Approved'
}

/** Header text for a field column; in validate mode other roles' columns say who entered them, as on screen. */
function fieldHeader(f: FieldDefinition, role: PersonaId, mode: GridMode): string {
  if (mode === 'validate' && f.enteredBy !== role) return `${f.label} (${f.enteredBy === 'System' ? 'system' : f.enteredBy.toLowerCase()})`
  return f.label
}

/** A field cell as it reads on screen: "n/a" when a rule hides it, otherwise the formatted value. */
function fieldText(m: RowModel, f: FieldDefinition): string {
  return m.cond[f.key]?.visible === false ? 'n/a' : formatValue(f, m.values[f.key])
}

/**
 * CSV text for the rows the grid is showing: context columns, the same field columns as the table, then calculated
 * columns. Values are formatted as on screen (for example "Yes", "92%", "—"). Read-only and locked rows are included.
 */
export function gridCsv(
  rows: RowModel[],
  fieldCols: FieldDefinition[],
  calcCols: FieldDefinition[],
  role: PersonaId,
  mode: GridMode
): string {
  const header = [
    'Part name',
    'Part no',
    'Model',
    'Section',
    'Due',
    'State',
    ...fieldCols.map((f) => fieldHeader(f, role, mode)),
    ...calcCols.map((f) => `${f.label} (calculated)`)
  ]
  const body = rows.map((m) => [
    m.inst.part.partName,
    m.inst.part.partNo,
    m.inst.part.model,
    m.inst.row.section,
    m.inst.dates.status === 'resolved' ? fmtDate(m.inst.dates.end) : 'Awaiting MRD',
    m.inst.notApplicable ? 'Not applicable' : STATUS_TEXT[m.inst.status] ?? m.inst.status,
    ...fieldCols.map((f) => fieldText(m, f)),
    ...calcCols.map((f) => formatValue(f, m.values[f.key]))
  ])
  return buildCsv(header, body)
}

/** e.g. pp-10_PP_PIC_validate_2026-10-15.csv */
export function gridCsvFilename(activityId: string, milestoneId: string, role: PersonaId, mode: GridMode, date: string): string {
  return `${[activityId, milestoneId, role, mode, date].map(safeFilePart).join('_')}.csv`
}
