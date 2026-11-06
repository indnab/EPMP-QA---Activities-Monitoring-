/**
 * Page export: turn the selected on-screen sections of any page into a PDF, PowerPoint or Excel file.
 *
 * Sections are plain DOM nodes tagged with `data-export-section` (see <ExportSection> and the
 * useExportSections hook). The user picks a format and ticks which sections to include; everything is
 * checked by default and unticking a section drops it from the file.
 *
 * - PDF / PPT: each section is rasterised to a PNG with html-to-image, then laid out one-per-page/slide.
 * - Excel : every <table> inside a chosen section becomes a worksheet; sections without a table are
 *           written as a short text block so nothing silently disappears.
 *
 * The heavy libraries (jspdf, pptxgenjs, exceljs, html-to-image) are all loaded on demand so they never
 * weigh down the first page load.
 */
import { downloadBlob } from '../excel/xlsxIO'

export type ExportFormat = 'pdf' | 'pptx' | 'xlsx'

/** A selectable chunk of the page. `el` is the live DOM node captured at export time. */
export interface ExportSection {
  id: string
  label: string
  el: HTMLElement
}

export interface ExportRequest {
  format: ExportFormat
  /** Page / document title, used for the filename and the cover. */
  title: string
  sections: ExportSection[]
}

const A4_LANDSCAPE = { w: 297, h: 210 } // mm

function safeName(title: string): string {
  return title.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export'
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * Rasterise a node to a PNG data URL. We clone the node off-screen at a fixed width so narrow
 * mobile-width captures don't come out tiny, and so the live layout is never disturbed.
 */
async function nodeToPng(el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const { toPng } = await import('html-to-image')
  const rect = el.getBoundingClientRect()
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
    // Skip anything explicitly marked non-exportable (e.g. the Download button itself).
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset && node.dataset.exportIgnore === 'true'),
  })
  return { dataUrl, width: rect.width || el.offsetWidth || 800, height: rect.height || el.offsetHeight || 400 }
}

async function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 800, h: 400 })
    img.src = dataUrl
  })
}

async function exportPdf(req: ExportRequest): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margin = 12
  const usableW = A4_LANDSCAPE.w - margin * 2
  const headerH = 16

  for (let i = 0; i < req.sections.length; i++) {
    const s = req.sections[i]
    if (i > 0) doc.addPage()
    // Section header band.
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, A4_LANDSCAPE.w, headerH, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.text(req.title, margin, 10)
    doc.setFontSize(9)
    doc.setTextColor(203, 213, 225)
    doc.text(s.label, A4_LANDSCAPE.w - margin, 10, { align: 'right' })

    const { dataUrl } = await nodeToPng(s.el)
    const { w: pxW, h: pxH } = await imageSize(dataUrl)
    const ratio = pxH / pxW
    let drawW = usableW
    let drawH = drawW * ratio
    const maxH = A4_LANDSCAPE.h - headerH - margin - 4
    if (drawH > maxH) {
      drawH = maxH
      drawW = drawH / ratio
    }
    const x = (A4_LANDSCAPE.w - drawW) / 2
    const y = headerH + 6
    doc.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
    // Footer.
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`EPMP QA · ${new Date().toLocaleString()}`, margin, A4_LANDSCAPE.h - 5)
    doc.text(`${i + 1} / ${req.sections.length}`, A4_LANDSCAPE.w - margin, A4_LANDSCAPE.h - 5, { align: 'right' })
  }
  doc.save(`${safeName(req.title)}_${stamp()}.pdf`)
}

async function exportPptx(req: ExportRequest): Promise<void> {
  const PptxModule = await import('pptxgenjs')
  const Pptx = (PptxModule as unknown as { default: new () => any }).default
  const pptx = new Pptx()
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
  pptx.layout = 'WIDE'
  const SLIDE_W = 13.333
  const SLIDE_H = 7.5

  // Title slide.
  const cover = pptx.addSlide()
  cover.background = { color: '0F172A' }
  cover.addText(req.title, { x: 0.6, y: 2.6, w: 12, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF' })
  cover.addText(`EPMP QA · ${new Date().toLocaleDateString()}`, { x: 0.6, y: 3.9, w: 12, h: 0.6, fontSize: 16, color: '94A3B8' })

  for (const s of req.sections) {
    const slide = pptx.addSlide()
    slide.addText(s.label, { x: 0.4, y: 0.25, w: 12.5, h: 0.6, fontSize: 22, bold: true, color: '0F172A' })
    const { dataUrl } = await nodeToPng(s.el)
    const { w: pxW, h: pxH } = await imageSize(dataUrl)
    const ratio = pxH / pxW
    const availW = SLIDE_W - 0.8
    const availH = SLIDE_H - 1.3
    let drawW = availW
    let drawH = drawW * ratio
    if (drawH > availH) {
      drawH = availH
      drawW = drawH / ratio
    }
    const x = (SLIDE_W - drawW) / 2
    const y = 1.0 + (availH - drawH) / 2
    slide.addImage({ data: dataUrl, x, y, w: drawW, h: drawH })
  }
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  downloadBlob(blob, `${safeName(req.title)}_${stamp()}.pptx`)
}

/** Read every <table> inside a section into rows of strings. */
function tablesToRows(el: HTMLElement): { name: string; rows: string[][] }[] {
  const tables = Array.from(el.querySelectorAll('table'))
  return tables.map((t, ti) => {
    const rows: string[][] = []
    for (const tr of Array.from(t.querySelectorAll('tr'))) {
      if (tr instanceof HTMLElement && tr.dataset.exportIgnore === 'true') continue
      const cells = Array.from(tr.querySelectorAll('th,td')).filter(
        (c) => !(c instanceof HTMLElement && c.dataset.exportIgnore === 'true'),
      )
      if (cells.length === 0) continue
      rows.push(
        cells.map((c) => {
          // Action-only cells (a lone link/button like "Open →") carry no data worth exporting.
          const onlyAction =
            c.children.length === 1 &&
            /^(A|BUTTON)$/.test(c.children[0].tagName) &&
            (c.textContent || '').trim() === (c.children[0].textContent || '').trim()
          if (onlyAction) return ''
          return (c.textContent || '').replace(/\s+/g, ' ').trim()
        }),
      )
    }
    return { name: tables.length > 1 ? `Table ${ti + 1}` : 'Table', rows }
  })
}

/** Grab "label: value" style stat/KPI cards so pages without tables still export something useful. */
function cardsToRows(el: HTMLElement): string[][] {
  const cards = Array.from(el.querySelectorAll('[data-export-stat]')) as HTMLElement[]
  if (cards.length === 0) return []
  const rows: string[][] = [['Metric', 'Value']]
  for (const c of cards) {
    const label = c.dataset.exportStat || (c.querySelector('[data-export-stat-label]')?.textContent ?? '')
    const value = c.dataset.exportStatValue || (c.querySelector('[data-export-stat-value]')?.textContent ?? '')
    rows.push([label.replace(/\s+/g, ' ').trim(), value.replace(/\s+/g, ' ').trim()])
  }
  return rows
}

async function exportXlsx(req: ExportRequest): Promise<void> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'EPMP QA Activity Tracker'
  const used = new Set<string>()
  const sheetName = (raw: string) => {
    let base = raw.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet'
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${n++}`
    used.add(name.toLowerCase())
    return name
  }

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } }

  let wroteData = false
  for (const s of req.sections) {
    const tables = tablesToRows(s.el)
    const cardRows = cardsToRows(s.el)
    const blocks = tables.filter((t) => t.rows.length > 0)

    if (blocks.length === 0 && cardRows.length === 0) {
      // Nothing structured — write a short note so the section is still represented.
      const ws = wb.addWorksheet(sheetName(s.label))
      ws.getColumn(1).width = 80
      ws.getCell(1, 1).value = s.label
      ws.getCell(1, 1).font = { bold: true, size: 13 }
      ws.getCell(3, 1).value = '(This section has no tabular data to export. See the PDF/PPT export for its visual.)'
      continue
    }

    if (cardRows.length > 0) {
      const ws = wb.addWorksheet(sheetName(`${s.label} KPIs`))
      ws.addRows(cardRows)
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = headerFill
      ws.getColumn(1).width = 42
      ws.getColumn(2).width = 16
      wroteData = true
    }

    for (const b of blocks) {
      const title = blocks.length > 1 ? `${s.label} ${b.name}` : s.label
      const ws = wb.addWorksheet(sheetName(title))
      ws.addRows(b.rows)
      if (b.rows.length > 0) {
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        ws.getRow(1).fill = headerFill
        ws.getRow(1).alignment = { vertical: 'middle', wrapText: true }
        const colCount = b.rows[0].length
        for (let c = 1; c <= colCount; c++) {
          let max = 10
          for (const r of b.rows) max = Math.max(max, Math.min(50, (r[c - 1] || '').length + 2))
          ws.getColumn(c).width = max
        }
        ws.views = [{ state: 'frozen', ySplit: 1 }]
      }
      wroteData = true
    }
  }

  if (!wroteData && used.size === 0) {
    const ws = wb.addWorksheet('Export')
    ws.getCell(1, 1).value = `${req.title} — no tabular data selected.`
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${safeName(req.title)}_${stamp()}.xlsx`)
}

export async function runExport(req: ExportRequest): Promise<void> {
  if (req.sections.length === 0) return
  if (req.format === 'pdf') return exportPdf(req)
  if (req.format === 'pptx') return exportPptx(req)
  return exportXlsx(req)
}
