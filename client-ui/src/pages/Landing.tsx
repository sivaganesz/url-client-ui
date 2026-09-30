import { Link } from 'react-router-dom'
import { IconAgent, IconChat, IconFile, IconPhone } from '../components/icons'
import ThemeToggle from '../components/ThemeToggle'

/**
 * The front door.
 *
 * What somebody sees at `/` before they have signed in. It exists because the
 * root of a hosted site is the first thing anyone opens, and a redirect
 * straight to a password box tells a visitor nothing about what they have
 * reached.
 *
 * Shown only while signed out — a signed-in customer still lands on their
 * dashboard, which is what `/` has always meant to them. See App.tsx.
 *
 * Deliberately one screen and no marketing: this is a console people are given
 * access to, not a product anyone signs up for. The only thing it has to do is
 * say what this is and point at the two ways in.
 */

const POINTS = [
  {
    icon: IconChat,
    title: 'Every conversation, in one place',
    body: 'Calls, WhatsApp, SMS and email, each with the agent that handled it and the transcript it produced.',
  },
  {
    icon: IconPhone,
    title: 'Pick up the phone yourself',
    body: 'Take over a conversation and speak to the customer from the browser, with the transcript still running.',
  },
  {
    icon: IconAgent,
    title: 'The agents, and what they did',
    body: 'Which agent answers on which channel, what it resolved, and where it handed over.',
  },
  {
    icon: IconFile,
    title: 'The knowledge they answer from',
    body: 'Upload documents and folders, and see what the agents have to work with.',
  },
]

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-panel text-white">
            <IconChat size={17} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Perfox console</span>
        </span>

        <span className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            to="/login"
            className="rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-on-accent transition-colors hover:bg-brand-dark"
          >
            Sign in
          </Link>
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-5 sm:px-8">
        <div className="w-full max-w-3xl">
          <h1 className="max-w-2xl text-[30px] leading-[1.15] font-semibold tracking-tight sm:text-[38px]">
            The workspace console for your Perfox agents.
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-2">
            Read what your agents and customers said to each other, across every channel, and step
            in yourself when a conversation needs a person.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-brand-dark"
            >
              Sign in to your workspace
            </Link>
            {/* Quieter, and second: most people arriving here are customers.
                The administrator surface is a different sign-in with its own
                session, and saying so here saves a wrong password attempt. */}
            <Link
              to="/admin/login"
              className="rounded-lg border border-line-strong px-5 py-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
            >
              Administrator sign-in
            </Link>
          </div>

          <p className="mt-4 text-[12px] text-ink-3">
            Accounts are created by an administrator — there is no sign-up.
          </p>

          <div className="mt-14 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon size={15} />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] font-semibold tracking-tight">{title}</span>
                  <span className="text-[12.5px] leading-relaxed text-ink-3">{body}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
