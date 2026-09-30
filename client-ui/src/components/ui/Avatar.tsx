import { cn } from '../../lib/cn'

const SIZES: Record<string, string> = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-12 w-12 text-base',
}

/**
 * One letter, not two.
 *
 * A pair of initials is a name badge; a single letter is a marker, which is
 * all this is next to a name that is already written out beside it. It also
 * survives the shapes this data actually arrives in — "Customer 4567",
 * "white-pau", an address with no name at all — where a second initial is as
 * often a digit as a surname.
 */
export function initialsOf(name = ''): string {
  const first = String(name).trim().replace(/^[^\p{L}\p{N}]+/u, '')[0]
  return first ? first.toUpperCase() : '?'
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
