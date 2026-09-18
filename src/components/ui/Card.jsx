import { cn } from '../../lib/cn'

export default function Card({ className, children, ...rest }) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface shadow-card', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>
}

/**
 * A region the spec hasn't defined yet. Kept explicit rather than filled with
 * invented content, so reviewers can tell "not decided" from "decided".
 */
export function ReservedPanel({ icon: Icon, title, note, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken p-6 text-center',
        className,
      )}
    >
      {Icon && <Icon size={22} className="text-ink-4" />}
      <span className="text-[13px] font-semibold text-ink-2">{title}</span>
      {note && <span className="max-w-xs text-xs leading-relaxed text-ink-3">{note}</span>}
    </div>
  )
}
