/**
 * Minimal CSV writer. Pure functions, no UI, so quoting and formula safety can be tested on their own.
 *
 * - Cells containing a comma, quote or line break are quoted, with quotes doubled.
 * - Cells starting with = + - @ (or a tab / carriage return) get a leading apostrophe so Excel and Sheets read them
 *   as text rather than running them as a formula (CSV / formula injection).
 * - Rows end with CRLF, the form Excel expects.
 */

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(raw: unknown): string {
  let text = raw === undefined || raw === null ? '' : String(raw)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** UTF-8 byte-order mark so Excel reads dashes and accented characters correctly. */
const BOM = '\uFEFF'

/** Starts a browser download of the CSV text. Browser only. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** File-name-safe text: letters, digits, dot, dash and underscore only. */
export function safeFilePart(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
}
