import { cn } from '../../lib/cn'

/**
 * Inline "working on it", sized to sit beside text in a button.
 *
 * Borrows `currentColor`, so it takes the colour of whatever it sits in and
 * needs no variant per button style.
 */
export default function Spinner({
  size = 11,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border border-current border-t-transparent',
        className,
      )}
    />
  )
}
