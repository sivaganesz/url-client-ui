import { IconChat } from '../../components/icons'
import { cn } from '../../lib/cn'

/**
 * The two-panel sign-in frame.
 *
 * The left panel is built from the design tokens rather than an image file —
 * no asset was supplied, and a stock photograph or an invented logo would be
 * worse than none. It collapses below `lg`, where a decorative half-screen
 * costs a phone the whole viewport and gives nothing back.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  tone = 'brand',
  blurb,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** `ink` marks the admin side, so the two are never mistaken for each other. */
  tone?: 'brand' | 'ink'
  blurb?: { heading: string; lines: string[] }
}) {
  const copy = blurb ?? {
    heading: 'Every conversation, in one place.',
    lines: [
      'Calls, WhatsApp, SMS and email — with the agent that handled each one.',
      'Pick up the phone yourself when it needs a person.',
    ],
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* ── the panel ─────────────────────────────────────── */}
      <div
        className={cn(
          'relative hidden w-[46%] max-w-2xl shrink-0 flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14',
          tone === 'ink' ? 'bg-ink' : 'bg-brand',
        )}
      >
        {/* Two soft washes rather than a flat fill: a large plain rectangle
            reads as a rendering fault at this size. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-3xl"
        />

        <span className="relative flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <IconChat size={17} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Perfox console</span>
        </span>

        <div className="relative flex flex-col gap-4">
          <h2 className="max-w-md text-[30px] leading-[1.15] font-semibold tracking-tight xl:text-[34px]">
            {copy.heading}
          </h2>
          <div className="flex max-w-md flex-col gap-2">
            {copy.lines.map((line) => (
              <p key={line} className="text-[13.5px] leading-relaxed text-white/75">
                {line}
              </p>
            ))}
          </div>
        </div>

        <span className="relative text-[11.5px] text-white/50">
          {tone === 'ink' ? 'Administration' : 'Skillmine · Perfox'}
        </span>
      </div>

      {/* ── the form ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 items-center justify-center px-5 py-12">
        <main className="w-full max-w-[22rem]">
          {/* The mark again, for the phone, where the panel is gone. */}
          <span
            className={cn(
              'mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-white lg:hidden',
              tone === 'ink' ? 'bg-ink' : 'bg-brand',
            )}
          >
            <IconChat size={19} />
          </span>

          <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-[12.5px] text-ink-3">{footer}</div>}
        </main>
      </div>
    </div>
  )
}
