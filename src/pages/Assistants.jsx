import { PageIntro } from '../components/Shell'
import { Card, ChannelPill, Empty, IconSpark, Pill, Problem, Skeleton } from '../components/ui'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getAssistants } from '../lib/api'

export default function Assistants() {
  const { data, status, reload } = useResource(getAssistants, [])

  if (status === 'error') {
    return (
      <>
        <PageIntro title="Assistants" />
        <Problem onRetry={reload} />
      </>
    )
  }

  const live = (data ?? []).filter((a) => a.live)

  return (
    <>
      <PageIntro title="Assistants">
        The AI assistants answering on your behalf. Each one handles its own kind of question.
      </PageIntro>

      {status === 'loading' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-card" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <Empty icon={IconSpark} title="No assistants set up yet" />
        </Card>
      ) : (
        <>
          <p className="mb-4 text-[13.5px] text-ink-3">
            {live.length} of {data.length} are live and answering customers.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3.5 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <IconSpark size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px]" title={a.name}>
                      {a.name}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      {a.conversations > 0
                        ? `${num(a.conversations)} conversations handled`
                        : 'No conversations yet'}
                    </p>
                  </div>
                  <Pill tone={a.live ? 'good' : 'neutral'}>{a.live ? 'Live' : 'Not live'}</Pill>
                </div>

                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  {a.description ?? 'No description has been written for this assistant yet.'}
                </p>

                {a.channels.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-rule pt-3.5">
                    {a.channels.map((c) => (
                      <ChannelPill key={c} channel={c} />
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
