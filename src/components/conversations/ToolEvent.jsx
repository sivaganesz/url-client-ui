import { IconChevronRight, IconSparkle } from '../icons'

/**
 * A tool call in the thread. Collapsed it shows name + latency; expanded it
 * shows the real input/output the agent exchanged — the console's "Debug".
 */
export default function ToolEvent({ event }) {
  const hasIo = event.toolInput != null || event.toolOutput != null
  const pretty = (v) =>
    typeof v === 'string' ? v : JSON.stringify(v, null, 2)

  const head = (
    <>
      <IconSparkle size={10} className="shrink-0" />
      <span className="truncate font-mono">{event.toolName ?? event.eventType}</span>
      {event.toolLatencyMs != null && (
        <span className="shrink-0 font-mono text-ink-4">{event.toolLatencyMs} ms</span>
      )}
      {event.toolStatus && event.toolStatus !== 'ok' && (
        <span className="shrink-0 text-danger">{event.toolStatus}</span>
      )}
    </>
  )

  if (!hasIo) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 self-center rounded-full border border-line bg-sunken px-2.5 py-1 text-[10.5px] text-ink-3">
        {head}
      </span>
    )
  }

  return (
    <details className="w-full max-w-[90%] self-center rounded-lg border border-line bg-sunken">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-ink-3 hover:text-ink">
        {head}
        <IconChevronRight size={11} className="ml-auto shrink-0" />
      </summary>
      <div className="flex flex-col gap-2 border-t border-line px-2.5 py-2">
        {event.toolInput != null && (
          <div>
            <p className="mb-1 text-[9.5px] font-semibold tracking-[0.06em] text-ink-4 uppercase">Input</p>
            <pre className="max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[10.5px] whitespace-pre-wrap text-ink-2">
              {pretty(event.toolInput)}
            </pre>
          </div>
        )}
        {event.toolOutput != null && (
          <div>
            <p className="mb-1 text-[9.5px] font-semibold tracking-[0.06em] text-ink-4 uppercase">Output</p>
            <pre className="max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[10.5px] whitespace-pre-wrap text-ink-2">
              {pretty(event.toolOutput)}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}
