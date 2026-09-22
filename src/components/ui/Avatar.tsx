import { cn } from '../../lib/cn'

const SIZES: Record<string, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-13 w-13 text-base',
}

export function initialsOf(name = ''): string {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export interface AvatarProps {
  name?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted-bg font-semibold text-ink-2 select-none',
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name ?? '')}
    </span>
  )
}
