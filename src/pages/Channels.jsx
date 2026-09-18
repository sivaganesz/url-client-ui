import { PageIntro } from '../components/Shell'
import { Card, Empty, IconChat, Pill, Problem, Skeleton, channelIcon } from '../components/ui'
import { num, whenAgo } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getChannels } from '../lib/api'

export default function Channels() {
  const { data, status, reload } = useResource(getChannels, [])

  if (status === 'error') {
    return (
      <>
        <PageIntro title="Channels" />
        <Problem onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageIntro title="Channels">
        The ways customers can reach your assistants, and how busy each one has been.
      </PageIntro>

      {status === 'loading' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-card" />
          ))}
        </div>
      ) : data.channels.length === 0 ? (
        <Card>
          <Empty
            title="No channels in use yet"
            note="Once customers start getting in touch, the channels they use appear here."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.channels.map((c) => {
            const Icon = channelIcon[c.channel] ?? IconChat
            return (
              <Card key={c.channel} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon size={20} />
                  </span>
                  <Pill tone={c.active ? 'good' : 'neutral'}>{c.active ? 'Active' : 'Quiet'}</Pill>
                </div>

                <div>
                  <h2 className="text-[18px]">{c.channel}</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">
                    {c.active
                      ? 'Customers have used this channel in the last week.'
                      : 'No activity in the last week.'}
                  </p>
                </div>

                <div className="mt-auto border-t border-rule pt-4">
                  <p className="font-serif text-[26px] leading-none font-semibold tnum">
                    {num(c.conversations)}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-3">
                    conversations · last {whenAgo(c.lastActivityAt)}
                  </p>
                  {c.assistants.length > 0 && (
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">
                      Handled by {c.assistants.slice(0, 2).join(', ')}
                      {c.assistants.length > 2 && ` and ${c.assistants.length - 2} more`}
                    </p>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
