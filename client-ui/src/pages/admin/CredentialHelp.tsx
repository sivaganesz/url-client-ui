import { IconChevronRight } from '../../components/icons'

/**
 * Where each of these values comes from, beside the boxes they go in.
 *
 * None of it can be worked out from the field names: the API base is the MCP
 * server URL with its last segment swapped, and the four operator values only
 * exist once an Operator node has been added to a calling agent and pointed at
 * a website origin. An admin setting a customer up for the first time was
 * otherwise reading it off somebody else's screen.
 */

const PERFOX: string[] = [
  'In Perfox, go to Developer → Create new key, and copy the API key it generates.',
  'Open the MCP tab and copy the server URL.',
  'Change the /mcp on the end to /api/v1 — that is the API base.',
]

const OPERATOR: string[] = [
  'Open the calling agent, and under Operation add an Operator node.',
  'Open that node, go to its Operator app tab, and add the website origin.',
  'Adding it gives you the Site ID, the API host and the Workflow ID.',
  'Click Rotate key for the site secret.',
]

export function PerfoxHelp({ collapsible = false }: { collapsible?: boolean }) {
  return (
    <Help title="Where to find these" steps={PERFOX} collapsible={collapsible} />
  )
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
  steps: string[]
  foot?: string
  /** Folded away in a dialog, where the form is already the whole height. */
  collapsible: boolean
}) {
  const body = (
    <>
      <ol className="flex list-decimal flex-col gap-1 pl-4">
        {steps.map((step) => (
          <li key={step} className="pl-0.5">
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
