interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  actions?: React.ReactNode
  /** No body padding — for full-bleed content such as tables. */
  flush?: boolean
}

/** EPMP card: white surface, 12px radius, header without a divider, body padded 16px. */
export function Card({ children, className = '', title, actions, flush = false }: CardProps) {
  return (
    <section className={`epmp-card min-w-0 overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-[51px] items-center justify-between gap-2.5 px-4 py-3">
          {title && <h3 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : `px-4 pb-4 ${title || actions ? '' : 'pt-4'}`}>{children}</div>
    </section>
  )
}
