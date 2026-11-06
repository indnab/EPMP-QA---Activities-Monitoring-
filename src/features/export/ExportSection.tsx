/**
 * Wrap any block of a page so it becomes a selectable unit in the Download dialog.
 *
 *   <ExportSection id="kpis" label="Key metrics"> ...cards... </ExportSection>
 *
 * The Download menu discovers these at export time by reading `data-export-section` / `data-export-label`
 * from the live DOM, so sections can be conditional, re-ordered or appear inside tabs without any extra
 * registration. Order on screen = order in the dialog = order in the exported file.
 */
import type { ReactNode } from 'react'

interface ExportSectionProps {
  id: string
  label: string
  children: ReactNode
  className?: string
  /** When true the section starts unchecked in the dialog (rarely needed). */
  defaultExcluded?: boolean
}

export function ExportSection({ id, label, children, className, defaultExcluded }: ExportSectionProps) {
  return (
    <div
      data-export-section={id}
      data-export-label={label}
      data-export-default={defaultExcluded ? 'off' : 'on'}
      className={className}
    >
      {children}
    </div>
  )
}

/** Collect the export sections currently in the DOM, in document order. */
export function collectSections(root: ParentNode = document): {
  id: string
  label: string
  defaultOn: boolean
  el: HTMLElement
}[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-export-section]'))
  // Drop nested sections whose ancestor is also a section (avoid exporting the same pixels twice).
  const top = nodes.filter((n) => !n.parentElement?.closest('[data-export-section]'))
  return top.map((el) => ({
    id: el.dataset.exportSection || '',
    label: el.dataset.exportLabel || el.dataset.exportSection || 'Section',
    defaultOn: el.dataset.exportDefault !== 'off',
    el,
  }))
}
