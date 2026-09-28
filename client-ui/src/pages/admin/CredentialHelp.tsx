import { IconChevronRight } from '../../components/icons'

/**
 * Where each of these values comes from, beside the boxes they go in.
 *
 * None of it can be worked out from the field names: the API base is the MCP
 * server URL with its last segment swapped, and the four operator values only
 * exist once an Operator node has been added to a calling agent and pointed at
 * a website origin. An admin setting a customer up for the first time was
 * otherwise reading it off somebody else's screen.
 *
 * One emphasis per step: where to go. Bolding every noun in a four-line list
 * emphasises nothing — the eye has no landmark left — so the names of the
 * fields stay plain and only the thing to click stands out.
 */

/** A thing to click or a tab to open: a proper noun on somebody else's screen. */
const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-semibold text-ink">{children}</strong>
)

const PERFOX = [
  <>
    In Perfox, go to <B>Developer → Create new key</B> and copy the API key.
  </>,
  <>
    Open the <B>MCP</B> tab and copy the server URL.
  </>,
  <>
    Change the <B>/mcp</B> on the end to <B>/api/v1</B> — that is the API base.
  </>,
]

const OPERATOR = [
  <>
    Open the calling agent, and under Operation add an <B>Operator</B> node.
  </>,
  <>
    In its <B>Operator app</B> tab, add the website origin.
  </>,
  <>
    That gives you the Site ID, the API host and the Workflow ID.
  </>,
  <>
    Click <B>Rotate key</B> for the site secret.
  </>,
]

export function PerfoxHelp({ collapsible = false }: { collapsible?: boolean }) {
  return <Help title="Where to find these" steps={PERFOX} collapsible={collapsible} />
}

export function OperatorHelp({ collapsible = false }: { collapsible?: boolean }) {
  return (
    <Help
      title="Where to find these"
      steps={OPERATOR}
      collapsible={collapsible}
      foot="All four are needed before the customer can place outbound calls from the console."
    />
  )
}

function Help({
  title,
  steps,
  foot,
  collapsible,
}: {
  title: string
  steps: React.ReactNode[]
  foot?: React.ReactNode
  /** Folded away in a dialog, where the form is already the whole height. */
  collapsible: boolean
}) {
  const body = (
    <>
      <ol className="flex list-decimal flex-col gap-1 pl-4">
        {steps.map((step, i) => (
          <li key={i} className="pl-0.5">
            {step}
          </li>
        ))}
      </ol>
      {foot && <p className="mt-2">{foot}</p>}
    </>
  )

  if (!collapsible) {
    return (
      <div className="rounded-lg bg-sunken px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-3">
        <p className="mb-1.5 font-semibold text-ink-2">{title}</p>
        {body}
      </div>
    )
  }

  return (
    <details className="group rounded-lg bg-sunken px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={12}
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <div className="mt-2">{body}</div>
    </details>
  )
}
