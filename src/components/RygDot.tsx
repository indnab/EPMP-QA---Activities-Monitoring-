export type RygStatus = 'red' | 'yellow' | 'green' | 'grey' | 'na'

// EPMP status palette: delayed / at risk / completed / not started.
export const RYG_HEX: Record<RygStatus, string> = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#10b981',
  grey:   '#c6cdd9',
  na:     '#94a3b8', // Not applicable: darker slate so it reads differently from grey (awaiting MRD)
}

interface RygDotProps {
  status: RygStatus
  size?: number
  label?: string
}

export function RygDot({ status, size = 8, label }: RygDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: RYG_HEX[status],
        }}
        aria-label={label ?? status}
      />
      {label && <span className="text-[11px] text-[var(--color-muted)]">{label}</span>}
    </span>
  )
}
