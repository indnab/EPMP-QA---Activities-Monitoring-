type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: React.ReactNode
}

// EPMP buttons: 10px radius, 600 weight, white secondary with hairline border.
const variantClasses: Record<Variant, string> = {
  primary:   'bg-[var(--color-primary)] border border-[var(--color-primary)] text-white hover:brightness-105',
  secondary: 'bg-white border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[#fafafa]',
  ghost:     'bg-transparent border border-transparent text-[var(--color-primary)] hover:bg-[var(--color-secondary)]',
  danger:    'bg-[var(--color-destructive)] border border-[var(--color-destructive)] text-white hover:brightness-105',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[11px]',
  md: 'px-3.5 py-2 text-xs',
  lg: 'px-5 py-2.5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
