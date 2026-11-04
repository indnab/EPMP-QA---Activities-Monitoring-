import type { FieldDefinition } from '../../domain'

/** Fields that can be filled from an Excel cell. Files, tables, buttons and derived/calculated fields cannot. */
export function excelFillable(f: FieldDefinition): boolean {
  return !f.dataOnly && f.source !== 'calculated' && !['file', 'table', 'button', 'derived', 'flag'].includes(f.type)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** What a stored value looks like in the template cell. */
export function toCell(field: FieldDefinition, value: unknown): string | number | Date | null {
  if (value === undefined || value === null || value === '') return null
  switch (field.type) {
    case 'yesNo': return value === 'Y' ? 'Yes' : value === 'N' ? 'No' : String(value)
    case 'number':
    case 'percent': {
      const n = Number(String(value).replace('%', ''))
      return Number.isFinite(n) ? n : String(value)
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
      return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : String(value)
    }
    case 'multiSelect': return Array.isArray(value) ? value.join('; ') : String(value)
    default: return String(value)
  }
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`
  const s = String(raw).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s) // day first, as written in India
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s)
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(Number(m[1]))}`
  return null
}

/** Turns a cell into the value the field stores, or says why it cannot. Blank cells are handled by the caller. */
export function parseCell(field: FieldDefinition, raw: unknown): ParseResult {
  const text = raw instanceof Date ? '' : String(raw).trim()
  switch (field.type) {
    case 'yesNo': {
      const t = text.toLowerCase()
      if (['y', 'yes', 'true', '1'].includes(t)) return { ok: true, value: 'Y' }
      if (['n', 'no', 'false', '0'].includes(t)) return { ok: true, value: 'N' }
      return { ok: false, error: `“${text}” is not Yes or No` }
    }
    case 'number':
    case 'percent': {
      const n = typeof raw === 'number' ? raw : Number(text.replace('%', '').replace(/,/g, ''))
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `“${text}” is not a number` }
    }
    case 'date': {
      const d = parseDate(raw)
      return d ? { ok: true, value: d } : { ok: false, error: `“${text}” is not a date (use yyyy-mm-dd)` }
    }
    case 'dropdown': {
      const hit = (field.options ?? []).find((o) => o.toLowerCase() === text.toLowerCase())
      return hit ? { ok: true, value: hit } : { ok: false, error: `“${text}” is not in the list (${(field.options ?? []).join(', ')})` }
    }
    case 'multiSelect': {
      const parts = text.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
      const opts = field.options ?? []
      const picked = parts.map((p) => opts.find((o) => o.toLowerCase() === p.toLowerCase()))
      const bad = parts.filter((_, i) => !picked[i])
      return bad.length ? { ok: false, error: `${bad.map((b) => `“${b}”`).join(', ')} not in the list (${opts.join(', ')})` } : { ok: true, value: picked as string[] }
    }
    default:
      return { ok: true, value: text }
  }
}
