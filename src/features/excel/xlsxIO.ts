/**
 * Excel templates and bulk upload for entry screens.
 *
 * A template is a workbook with an "Entry" sheet (one header row, then one row per part) and a hidden "_meta" sheet that
 * records which screen it came from and which header belongs to which field. Uploading reads the same layout back.
 * exceljs is loaded on demand so it does not weigh down the first page load.
 */
import type { FieldDefinition } from '../../domain'

export interface TemplateColumn {
  /** Unique header text shown in row 1. */
  header: string
  /** Opaque id mapped back on upload (for example the field key, or "<rowId>:<fieldKey>"). */
  id: string
  /** Field behind the column; drives the cell format and the allowed-values list. */
  field?: FieldDefinition
  /** Context columns (Part No, Model…) are read-only and ignored on upload except for the key columns. */
  readOnly?: boolean
  width?: number
}
export interface TemplateRow {
  /** Cell text / value per column id. Absent = blank. */
  cells: Record<string, string | number | Date | null | undefined>
  /** Column ids this row may NOT be edited in (shown grey; changes are ignored on upload). */
  locked?: Set<string>
}
export interface TemplateSpec {
  title: string
  sheetNote: string
  meta: Record<string, string>
  columns: TemplateColumn[]
  rows: TemplateRow[]
}

const READONLY_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F4F7' } }
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0E7FF' } }

/** Dropdown / Yes-No lists as a single in-cell list; skipped when Excel's 255-character limit would be exceeded. */
function listFor(field?: FieldDefinition): string | null {
  if (!field) return null
  const opts = field.type === 'yesNo' ? ['Yes', 'No'] : field.type === 'dropdown' ? field.options ?? [] : []
  if (opts.length === 0 || opts.some((o) => o.includes(','))) return null
  const joined = opts.join(',')
  return joined.length <= 250 ? joined : null
}

export async function buildTemplate(spec: TemplateSpec): Promise<Blob> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'QA Activity Tracker'
  const ws = wb.addWorksheet('Entry', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.id, width: c.width ?? Math.max(14, Math.min(40, c.header.length + 4)) }))
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.fill = HEADER_FILL
  head.alignment = { vertical: 'middle', wrapText: true }
  head.height = 30
  spec.rows.forEach((r, ri) => {
    const row = ws.getRow(ri + 2)
    spec.columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1)
      const v = r.cells[c.id]
      cell.value = v === undefined || v === null || v === '' ? null : v
      if (c.field?.type === 'date') cell.numFmt = 'yyyy-mm-dd'
      const locked = c.readOnly || r.locked?.has(c.id)
      if (locked) cell.fill = READONLY_FILL
      else {
        const list = listFor(c.field)
        if (list) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list}"`], showErrorMessage: true, errorTitle: 'Not allowed', error: 'Pick a value from the list.' }
        else if (c.field?.type === 'number' || c.field?.type === 'percent') cell.dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [-1e12, 1e12], showErrorMessage: true, errorTitle: 'Number needed', error: 'Enter a number.' }
      }
    })
    row.commit()
  })
  const help = wb.addWorksheet('Instructions')
  help.getColumn(1).width = 110
  ;[
    spec.title,
    '',
    spec.sheetNote,
    '',
    '1. Fill the white cells on the "Entry" sheet. Grey cells are read-only.',
    '2. Do not rename, move or delete the header row or the Part No / Section columns.',
    '3. Leave a cell blank to keep the current value. Blank cells never clear anything.',
    '4. Yes/No fields take Yes or No. Dropdown fields take one of the listed values. Dates are yyyy-mm-dd. Multi-select fields take values separated by semicolons.',
    '5. Upload the file on the same screen. Nothing is submitted by the upload: you review the staged values and submit them yourself.'
  ].forEach((t, i) => (help.getCell(i + 1, 1).value = t))
  help.getCell(1, 1).font = { bold: true, size: 13 }
  const meta = wb.addWorksheet('_meta', { state: 'veryHidden' })
  const entries = [...Object.entries(spec.meta), ...spec.columns.map((c) => [`col:${c.header}`, c.id] as [string, string])]
  entries.forEach(([k, v], i) => {
    meta.getCell(i + 1, 1).value = k
    meta.getCell(i + 1, 2).value = v
  })
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export interface ParsedSheet {
  meta: Record<string, string>
  /** header text -> column id (from _meta); headers not in the template are absent. */
  columnIds: Record<string, string>
  rows: { rowNumber: number; cells: Record<string, unknown> }[]
}

function plain(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('result' in o) return o.result
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return o.text
  }
  return v
}

export async function readTemplate(file: File): Promise<ParsedSheet> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const metaWs = wb.getWorksheet('_meta')
  const ws = wb.getWorksheet('Entry')
  if (!metaWs || !ws) throw new Error('This is not a template downloaded from this screen (the Entry or _meta sheet is missing). Download the template again.')
  const meta: Record<string, string> = {}
  const columnIds: Record<string, string> = {}
  metaWs.eachRow((row) => {
    const k = String(plain(row.getCell(1).value) ?? '')
    const v = String(plain(row.getCell(2).value) ?? '')
    if (k.startsWith('col:')) columnIds[k.slice(4)] = v
    else if (k) meta[k] = v
  })
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => (headers[col] = String(plain(cell.value) ?? '').trim()))
  const rows: ParsedSheet['rows'] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const cells: Record<string, unknown> = {}
    let any = false
    headers.forEach((h, col) => {
      if (!h) return
      const id = columnIds[h]
      if (!id) return
      const v = plain(row.getCell(col).value)
      if (v !== null && v !== undefined && v !== '') any = true
      cells[id] = v
    })
    if (any) rows.push({ rowNumber, cells })
  })
  return { meta, columnIds, rows }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
