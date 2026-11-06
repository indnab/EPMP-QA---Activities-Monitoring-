import { Link } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  description?: string
  /** Middle breadcrumb segment, e.g. "Modules". */
  section?: string
  /** Last breadcrumb segment; defaults to the title. */
  crumb?: string
  actions?: React.ReactNode
}

/**
 * Compact page header: the "EPMP › Section › Page" breadcrumb on one row with the page actions. The large title
 * block and description were dropped to save vertical space — the breadcrumb already names the page. `title` is
 * still used as the breadcrumb's last segment (and `description` is accepted but no longer shown).
 */
export function PageHeader({ title, section = 'Workspace', crumb, actions }: PageHeaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-2 text-[11px] text-[#596579]" aria-label="Breadcrumb">
        <Link to="/" className="hover:underline">EPMP</Link>
        <span aria-hidden="true">›</span>
        <span>{section}</span>
        <span aria-hidden="true">›</span>
        <span className="text-[#344054]" aria-current="page">{crumb ?? title}</span>
      </nav>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&_a]:whitespace-nowrap max-sm:[&_button]:whitespace-nowrap max-sm:[&_label]:whitespace-nowrap">{actions}</div>}
    </div>
  )
}
