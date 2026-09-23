import { cn } from '../../lib/cn'

const VARIANTS: Record<string, string> = {
  primary:
    'bg-brand text-white border-brand hover:bg-brand-dark hover:border-brand-dark shadow-card',
  secondary:
    'bg-surface text-ink border-line-strong hover:bg-sunken',
  ghost:
    'bg-transparent text-ink-2 border-transparent hover:bg-muted-bg hover:text-ink',
  danger:
    'bg-surface text-danger border-line-strong hover:bg-danger-bg hover:border-danger/30',
}

const SIZES: Record<string, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-3 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-4 text-sm gap-2 rounded-lg',
}

const ICON_SIZES: Record<string, string> = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-10 w-10 rounded-lg',
  lg: 'h-11 w-11 rounded-lg',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center border font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        iconOnly ? ICON_SIZES[size] : SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
