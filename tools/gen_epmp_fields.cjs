/**
 * Generates qa-activity-tracker/src/mock/epmpFields.ts from "Copy of EPMP Fields.xlsx" (sheet "Fields").
 * One activity per (Trial, Activity). Trial PP -> milestone PP, MPP -> MPP, "Pilot/SOP" -> SOP.
 * Usage: node tools/gen_epmp_fields.cjs "<xlsx>" qa-activity-tracker/src/mock/epmpFields.ts
 */
const ExcelJS = require('../qa-activity-tracker/node_modules/exceljs')
const fs = require('fs')

const txt = (v) => {
  v = v && v.richText ? v.richText.map((t) => t.text).join('') : v && v.result !== undefined ? v.result : v
  return v == null ? '' : String(v)
}
const norm = (s) => s.toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim()
const clean = (s) => s.replace(/\*+/g, '').replace(/\s+/g, ' ').trim()

// Existing ids are kept (client dashboards and demo data are keyed on them). New PP activities get pp-17, pp-18.
const PP_IDS = {
  'parts drawing confirmation in ibom': 1,
  'spec meeting confirmation - oe & accessory parts': 2,
  'sor sharing and confirmation of sor points': 3,
  'tier-2 compilation (red and new assessment check)': 4,
  'new tier-2 assessment confirmation': 5,
  'newness confirmation - mizenboshi status': 6,
  'dmu data study status (ecr status)': 7,
  'ses nr status (drawing study + ecr initiation)': 8,
  'ot status': 9,
  'sheet metal part accuracy status': 10,
  'part inspection with deviation status': 11,
  'misp approval & uploading status': 12,
  'lab testing status': 13,
  'bcf status (body checking fixture)': 14,
  'colour parts check - testing': 15,
  'parts list with deviations & special parts list': 16,
  'newness confirmation - process benchmarking status': 17,
  'colour parts check - colour comparison': 18
}
const TRIAL = { PP: { ms: 'PP', prefix: 'pp' }, MPP: { ms: 'MPP', prefix: 'mpp' }, 'Pilot/SOP': { ms: 'SOP', prefix: 'sop' } }
const TRIAL_LABEL = { PP: 'PP', MPP: 'MPP', 'Pilot/SOP': 'Pilot/SOP' }

// Values the generic parser cannot read; keyed by normalised value text.
const OPTION_OVERRIDES = {
  'a , ar,a/ar,g,f': ['A', 'AR', 'A/AR', 'G', 'F'],
  '3,4,5': ['3', '4', '5'],
  'r/y/g/blank': ['Red', 'Yellow', 'Green'],
  'open close reject': ['Open', 'Closed', 'Reject'],
  'a / b / c / d': ['A', 'B', 'C', 'D'],
  'pic / sic / dpm / ddvm / dvm / dvm-smc': ['PIC', 'SIC', 'DPM', 'DDVM', 'DVM', 'DVM-SMC'],
  'ok/total': null
}
const TABLE_NAMES = { 'process capability (critical parameters)': 'Parameters below 1.33' }

// Field-label overrides the generic value-text parser cannot resolve correctly on its own.
const LABEL_TYPE_OVERRIDES = {
  'spec meeting not applicable': { t: 'flag' },
  'data update pending': { t: 'flag' },
  'tier-2 supplier name': { t: 'text' },
  'new tier-2 vendor name': { t: 'text' },
  'closed (accept/ reject)': { t: 'dropdown', o: ['Accept', 'Reject'] },
  'rejected by engineering': { t: 'longText' },
  'tool trial status': { t: 'dropdown', o: ['Done', 'Pending'] },
  'sheet metal applicability': { t: 'yesNo' },
  'ok parameters': { t: 'number' },
  'ng dropdown': { t: 'multiSelect', o: ['Appearance', 'Dimension', 'Material', 'Performance', 'Regulation'] },
  'retest sample submission / status': { t: 'dropdown', o: ['Submitted', 'Not submitted', 'Under testing', 'OK', 'NG', 'Reference', 'Request rejected'] },
  'retest log': { t: 'longText' },
  'applicable colour code': { t: 'text' },
  'deviation list': { t: 'longText' },
  'applicable activities for special part': { t: 'multiSelect', activityList: true },
  'newness type': { t: 'dropdown', o: ['New Tech. / New Design', 'New Vendor', 'Existing vendor New part category', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others'] },
  'implemented/ not implementd': { t: 'dropdown', o: ['Implemented', 'Not Implemented'] },
  'count of overdue': { t: 'number' },
  'applicable sor points': { t: 'number' },
  'agree': { t: 'number' },
  'disagreed': { t: 'number' },
  'implemented break-up': { t: 'longText' },
  'points no longer adhered – sor category / sor point': { t: 'longText' },
  'audit completed / pending': { t: 'dropdown', o: ['Completed', 'Pending'] },
  'set part – sub parts mapping': { t: 'longText' },
  'deviation / closure status': { t: 'dropdown', o: ['Accept', 'Pending', 'Reject', 'Open', 'Closed'] },
  'ppap applicability': { t: 'yesNo' },
  'part category': { t: 'dropdown', o: ['A', 'AR', 'A/AR', 'G', 'F'] },
  'ppvt vendor scope': { t: 'longText' },
  'sc': { t: 'text' },
  'pic': { t: 'text' },
  'part no': { t: 'text' },
  'part name': { t: 'text' },
  'vendor': { t: 'text' }
}

function parseOptions(v) {
  let s = v.replace(/^drop\s*down\s*:?\s*/i, '').split(' \u00b7 ')[0]
  s = s.replace(/\([^)]*\)/g, '').trim()
  let t = s.split(/\s*\/\s*|\n/).map((x) => x.trim()).filter(Boolean)
  if (t.length === 1) t = s.split('/').map((x) => x.trim()).filter(Boolean)
  return t
}
function looksLikeOptions(v, t) {
  if (t.length < 2 || t.length > 12) return false
  if (/^(if|text|number|date|count|free|from|same|per|one|code|name|history|deviations|activity|table|form|corrective|category|status \/|only|description)\b/i.test(v.trim())) return false
  if (/\bif\b|:|\bthen\b/i.test(t.join(' '))) return false
  return t.every((x) => x.length <= 60 && x.split(' ').length <= 7)
}

function inferType(label, values) {
  const v = values.trim()
  const lv = norm(v)
  const ll = norm(label)
  if (Object.prototype.hasOwnProperty.call(LABEL_TYPE_OVERRIDES, ll)) return LABEL_TYPE_OVERRIDES[ll]
  if (Object.prototype.hasOwnProperty.call(OPTION_OVERRIDES, lv)) {
    const o = OPTION_OVERRIDES[lv]
    if (o) return { t: 'dropdown', o }
  }
  if (/table field/i.test(v) || /table field/i.test(label)) {
    if (/^number|^count/i.test(v)) return { t: 'number', col: true }
    if (/^date/i.test(v)) return { t: 'date', col: true }
    return { t: 'text', col: true }
  }
  if (/^y\s*\/\s*n\b/i.test(v) || /^yes\s*\/\s*no\b/i.test(v)) return { t: 'yesNo' }
  if (/^flag\b/i.test(v)) return { t: 'flag' }
  if (/^(date|target date)\b/i.test(v) || (!v && /\bdate\b/.test(ll))) return { t: 'date' }
  if (/^(percentage|%)/i.test(v) || /%/.test(label)) return { t: 'percent' }
  if (/^(number|count|numeric)\b/i.test(v) || v === '1') return { t: 'number' }
  if (/^(file|pdf)/i.test(v)) return { t: 'file' }
  if (v) {
    const t = parseOptions(v)
    if (t.length >= 2 && /^yes$/i.test(t[0]) && /^no$/i.test(t[1])) return { t: 'yesNo' }
    if (looksLikeOptions(v, t)) return { t: 'dropdown', o: t }
  }
  if (/applicab/i.test(ll)) return { t: 'yesNo' }
  if (/remark|reason|details|description|observation|action plan|free text|analysis|issue|countermeasure/i.test(ll + ' ' + lv)) return { t: 'longText' }
  return { t: 'text' }
}

function ownerOf(by) {
  const m = /vendor|pic|sic|dpm|admin|system|bot/i.exec(by)
  if (!m) return 'PIC'
  const w = m[0].toLowerCase()
  if (w === 'vendor') return 'Vendor'
  if (w === 'pic') return 'PIC'
  if (w === 'sic') return 'SIC'
  if (w === 'dpm') return 'DPM'
  if (w === 'admin') return 'Admin'
  return 'System'
}
function sourceOf(src, by) {
  const seg = src.split(/option\s*2/i)[0] || src
  let s = 'manual'
  if (/sap/i.test(seg)) s = 'sap'
  else if (/enovia/i.test(seg)) s = 'enovia'
  else if (/e-?doc/i.test(seg)) s = 'edoc'
  else if (/regulatory app/i.test(seg)) s = 'regapp'
  else if (/calculated|derived|rule|log\b|from source|auto/i.test(seg)) s = 'calculated'
  else if (/lms|ibom|bot|master|screen|admin/i.test(seg)) s = 'mapping'
  else if (/upload/i.test(seg)) s = 'upload'
  else if (/dropdown/i.test(seg)) s = 'dropdown'
  if (by === 'System' && s === 'manual') s = 'mapping'
  return s
}
const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 42) || 'field'

;(async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(process.argv[2])
  const ws = wb.getWorksheet('Fields')
  const rows = []
  let prevT = '', prevA = ''
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values.slice(1)
    const c = (i) => txt(v[i])
    if (![0, 1, 2, 3, 4, 5, 6].some((i) => c(i).trim())) continue
    const trial = c(0).trim() || prevT
    const act = clean(c(1)) || prevA
    prevT = trial
    prevA = act
    rows.push({ trial, act, field: clean(c(2)), values: c(3).replace(/\r/g, '').trim(), remarks: c(4).trim(), by: c(5), src: c(6) })
  }

  // Group (trial, activity) -> fields, merging repeated blocks of the same activity.
  const groups = new Map()
  for (const r of rows) {
    const key = r.trial + '|' + norm(r.act)
    if (!groups.has(key)) groups.set(key, { trial: r.trial, name: r.act, rows: [] })
    groups.get(key).rows.push(r)
  }

  // "Applicable activities for special part" is a pick-list of the activity names.
  const ALL_NAMES = Array.from(new Set(Array.from(groups.values()).map((g) => g.name)))
  const seenNames = new Set()
  const counters = { pp: 18, mpp: 0, sop: 0 }
  const out = []
  for (const g of groups.values()) {
    const tm = TRIAL[g.trial]
    if (!tm) throw new Error('Unknown trial ' + g.trial)
    let id
    if (g.trial === 'PP') {
      const n = PP_IDS[norm(g.name)]
      if (!n) throw new Error('No PP id for ' + g.name)
      id = 'pp-' + n
    } else {
      counters[tm.prefix] += 1
      id = tm.prefix + '-' + counters[tm.prefix]
    }
    let name = g.name
    if (seenNames.has(norm(name))) name = `${name} (${TRIAL_LABEL[g.trial]})`
    seenNames.add(norm(g.name))

    const fields = []
    const used = new Set()
    const labels = new Set()
    let table = null
    for (const r of g.rows) {
      let label = r.field
      if (!label) label = clean(r.values.split('\n')[0]).slice(0, 60) || 'Details'
      const ty = inferType(label, r.values)
      if (ty.col) {
        // Columns of one repeating table (labelled "... (Table Field N)").
        const colLabel = clean(label.replace(/\(?\s*table field\s*\d+\s*\)?/i, '')) || label
        if (!table) {
          table = { k: slug(TABLE_NAMES[norm(g.name)] || 'details_table'), l: TABLE_NAMES[norm(g.name)] || 'Details', t: 'table', by: ownerOf(r.by), cols: [] }
          fields.push(table)
          used.add(table.k)
        }
        table.cols.push({ key: slug(colLabel), label: colLabel, type: ty.t })
        continue
      }
      if (labels.has(norm(label)) && r.values && r.values.length <= 30 && !/^(y\s*\/\s*n|date|number|count|text)/i.test(r.values)) label = `${label} (${r.values})`
      labels.add(norm(label))
      let k = slug(label)
      for (let i = 2; used.has(k); i++) k = slug(label).slice(0, 38) + '_' + i
      used.add(k)
      const by = ownerOf(r.by)
      const src = sourceOf(r.src, by)
      const f = { k, l: label, t: ty.t }
      if (ty.o) f.o = ty.o
      if (ty.activityList) f.o = ALL_NAMES
      f.by = by
      if (src !== 'manual') f.src = src
      if (by === 'Vendor') f.val = true
      if (by === 'System' && ty.t === 'date') f.vendor = true
      fields.push(f)
    }
    out.push({ id, name, trial: g.trial, milestone: tm.ms, scope: /\(ecn cases\)/i.test(g.name) ? 'ECN' : 'Both', fields })
  }
  out.sort((a, b) => {
    const rank = (x) => ({ PP: 0, MPP: 1, SOP: 2 })[x.milestone]
    return rank(a) - rank(b) || Number(a.id.split('-')[1]) - Number(b.id.split('-')[1])
  })

  const lines = out.map((a) => {
    const fl = a.fields.map((f) => '      ' + JSON.stringify(f)).join(',\n')
    return `  {\n    id: ${JSON.stringify(a.id)}, name: ${JSON.stringify(a.name)}, trial: ${JSON.stringify(a.trial)}, milestone: ${JSON.stringify(a.milestone)}, scope: ${JSON.stringify(a.scope)},\n    fields: [\n${fl}\n    ]\n  }`
  })
  const body =
    `/** AUTO-GENERATED by tools/gen_epmp_fields.cjs from "Copy of EPMP Fields.xlsx" (sheet Fields). Do not hand-edit. */\n` +
    `import type { PpFieldSpec } from './ppFieldConfig'\n\n` +
    `export interface EpmpActivitySpec {\n  id: string\n  name: string\n  /** Trial in the sheet: PP, MPP or Pilot/SOP. */\n  trial: string\n  /** Milestone the activity is tracked under. */\n  milestone: 'PP' | 'MPP' | 'SOP'\n  scope: 'Both' | 'ECN' | 'NewPart'\n  fields: PpFieldSpec[]\n}\n\n` +
    `export const EPMP_ACTIVITIES: EpmpActivitySpec[] = [\n${lines.join(',\n')}\n]\n`
  fs.writeFileSync(process.argv[3], body)
  console.log('activities', out.length, 'fields', out.reduce((n, a) => n + a.fields.length, 0))
  for (const a of out) console.log(a.id.padEnd(7), a.milestone.padEnd(4), String(a.fields.length).padStart(3), a.name)
})()
