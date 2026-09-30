import { IconMoon, IconSun } from './icons'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/cn'

/**
 * Light or dark, for the account block at the foot of either rail.
 *
 * Shows the theme it will switch *to*, not the one in force: a sun means
 * "make it light", which is the question a button answers. The label says so
 * in words as well, because an icon alone leaves the direction ambiguous.
 *
 * `onPanel` is for the admin rail, which is a dark surface in both themes and
 * so carries its own white-on-dark treatment rather than the ink ramp.
 */
export default function ThemeToggle({ onPanel = false }: { onPanel?: boolean }) {
  const { theme, toggle } = useTheme()
  const toDark = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      title={toDark ? 'Switch to the dark theme' : 'Switch to the light theme'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10.5px] font-medium transition-colors',
        onPanel
          ? 'text-white/60 hover:bg-white/10 hover:text-white'
          : 'text-ink-3 hover:bg-surface hover:text-ink',
      )}
    >
      {toDark ? <IconMoon size={12} /> : <IconSun size={12} />}
      {toDark ? 'Dark' : 'Light'}
    </button>
  )
}
