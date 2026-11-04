import type { FieldDefinition } from '../../domain'
import { buildTemplate, readTemplate } from './xlsxIO'
import type { TemplateColumn, TemplateSpec } from './xlsxIO'
import { parseCell, toCell } from './cellValues'
import type { UploadIssue, UploadSummary } from './UploadReport'

/** One fillable column of an entry screen. */
export interface FillColumn {
  id: string
  header: string
  field: FieldDefinition
}
/** One part (row) of an entry screen. */
export interface FillRow {
  partNo: string
  section: string
  partName: string
  model: string
  /** When set, the whole row is read-only (e.g. already submitted) and the text says why. */
  locked?: string
  /** Whether this column can be edited on this row by the current role. */
  editable: (colId: string) => boolean
  /** Current value of a column as stored. */
  value: (colId: string) => unknown
}

const KEY_PART = '__part'
const KEY_SECTION = '__section'

/** Header text must be unique in a sheet; add a counter when two columns share a label. */
function uniqueHeaders(columns: FillColumn[]): FillColumn[] {
  const seen = new Map<string, number>()
  return columns.map((c) => {
    const n = (seen.get(c.header) ?? 0) + 1
    seen.set(c.header, n)
    return n === 1 ? c : { ...c, header: `${c.header} (${n})` }
  })
}

export function fillTemplateSpec(opts: { title: string; note: string; meta: Record<string, string>; columns: FillColumn[]; rows: FillRow[] }): TemplateSpec {
  const columns = uniqueHeaders(opts.columns)
  const ctx: TemplateColumn[] = [
    { id: KEY_PART, header: 'Part No', readOnly: true, width: 18 },
    { id: KEY_SECTION, header: 'Section', readOnly: true, width: 10 },
    { id: '__name', header: 'Part name', readOnly: true, width: 26 },
    { id: '__model', header: 'Model', readOnly: true, width: 14 },
    { id: '__state', header: 'Row state', readOnly: true, width: 22 }
  ]
  return {
    title: opts.title,
    sheetNote: opts.note,
    meta: opts.meta,
    columns: [...ctx, ...columns.map((c) => ({ id: c.id, header: c.header, field: c.field }))],
    rows: opts.rows.map((r) => ({
      cells: {
        [KEY_PART]: r.partNo,
        [KEY_SECTION]: r.section,
        __name: r.partName,
        __model: r.model,
        __state: r.locked ?? 'Open for entry',
        ...Object.fromEntries(columns.map((c) => [c.id, toCell(c.field, r.value(c.id))]))
      },
      locked: new Set(r.locked ? columns.map((c) => c.id) : columns.filter((c) => !r.editable(c.id)).map((c) => c.id))
    }))
  }
}

export async function downloadFillTemplate(opts: Parameters<typeof fillTemplateSpec>[0]): Promise<Blob> {
  return buildTemplate(fillTemplateSpec(opts))
}

/**
 * Reads an uploaded template and stages its values through `stage` (nothing is saved). Only editable cells of open rows
 * are staged, values equal to the current ones are ignored, and every other cell that could not be used is reported.
 */
export async function applyUpload(
  file: File,
  expectMeta: Record<string, string>,
  columns: FillColumn[],
  rows: FillRow[],
  stage: (row: FillRow, colId: string, value: unknown) => void
): Promise<UploadSummary> {
  const summary: UploadSummary = { fileName: file.name, rowsRead: 0, rowsApplied: 0, cellsStaged: 0, issues: [] }
  const issue = (row: number, part: string, message: string) => summary.issues.push({ row, part, message } as UploadIssue)
  let parsed
  try {
    parsed = await readTemplate(file)
  } catch (e) {
    issue(0, '', e instanceof Error ? e.message : 'The file could not be read as an Excel workbook.')
    return summary
  }
  for (const [k, v] of Object.entries(expectMeta)) {
    if (parsed.meta[k] !== v) {
      issue(0, '', `This template was downloaded for a different screen (${k}: “${parsed.meta[k] ?? 'unknown'}”, expected “${v}”). Download the template from this screen and use that.`)
      return summary
    }
  }
  const byId = new Map(columns.map((c) => [c.id, c]))
  const byKey = new Map(rows.map((r) => [`${r.section}|${r.partNo}`, r]))
  for (const sheetRow of parsed.rows) {
    summary.rowsRead += 1
    const part = String(sheetRow.cells[KEY_PART] ?? '').trim()
    const section = String(sheetRow.cells[KEY_SECTION] ?? '').trim()
    const row = byKey.get(`${section}|${part}`)
    if (!row) {
      issue(sheetRow.rowNumber, part, 'this part is not on this screen (or is outside your scope), so the row was skipped')
      continue
    }
    let staged = 0
    for (const [id, raw] of Object.entries(sheetRow.cells)) {
      const col = byId.get(id)
      if (!col || raw === null || raw === undefined || raw === '') continue
      const res = parseCell(col.field, raw)
      if (!res.ok) {
        issue(sheetRow.rowNumber, part, `${col.header}: ${res.error}`)
        continue
      }
      if (JSON.stringify(res.value) === JSON.stringify(row.value(id) ?? '')) continue // unchanged
      if (row.locked) {
        issue(sheetRow.rowNumber, part, `${col.header}: row is read-only (${row.locked})`)
        continue
      }
      if (!row.editable(id)) {
        issue(sheetRow.rowNumber, part, `${col.header}: you cannot edit this field for this part`)
        continue
      }
      stage(row, id, res.value)
      staged += 1
    }
    if (staged > 0) {
      summary.rowsApplied += 1
      summary.cellsStaged += staged
    }
  }
  return summary
}
