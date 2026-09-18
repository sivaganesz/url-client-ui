import { Link } from 'react-router-dom'
import { PageIntro } from '../components/Shell'
import { ActivityChart, Breakdown } from '../components/Charts'
import {
  Card,
  ChannelPill,
  Empty,
  IconArrow,
  IconChat,
  Pill,
  Problem,
  SectionTitle,
  Skeleton,
  Stat,
  channelIcon,
} from '../components/ui'
import { num, pct, whenAgo } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getOverview } from '../lib/api'

const TONE_BY_STATUS = {
  Resolved: 'good',
  Completed: 'neutral',
  'Left early': 'warn',
  'In progress': 'info',
}

export default function Overview() {
  const { data, status, error, reload } = useResource(getOverview, [])
  const loading = status === 'loading'

  if (status === 'error') {
    return (
      <>
        <PageIntro title="Overview" />
        <Problem onRetry={reload} />
      </>
    )
  }

  const t = data?.totals
  const busiest = data?.byChannel?.[0]

  return (
    <>
      <PageIntro title="Overview">
        How customers have been talking to your AI assistants, and what came of it.
      </PageIntro>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Conversations"
          value={num(t?.conversations)}
          caption="Total, all time"
          loading={loading}
        />
        <Stat
          label="This week"
          value={num(t?.thisWeek)}
          caption="Started in the last 7 days"
          loading={loading}
        />
        <Stat
          label="Customers"
          value={num(t?.customers)}
          caption="People who gave their details"
          loading={loading}
        />
        <Stat
          label="Resolved"
          value={t?.resolvedRate == null ? '—' : pct(t.resolvedRate)}
          caption="Of finished conversations"
          loading={loading}
        />
      </div>

      <section className="mt-10">
        <SectionTitle hint="Conversations started each day, last two weeks">
          Activity
        </SectionTitle>
        <Card className="p-5">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ActivityChart data={data.activity} label="Conversations started each day" />
          )}
        </Card>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle hint="Where your customers reached you from">Channels</SectionTitle>
          <Card className="p-5">
            {loading ? (
              <div className="flex flex-col gap-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Breakdown
                  data={data.byChannel.map((c) => {
                    const Icon = channelIcon[c.channel] ?? IconChat
                    return {
                      label: c.channel,
                      value: c.count,
                      icon: <Icon size={14} className="text-ink-3" />,
                    }
                  })}
                />
                {busiest && (
                  <p className="mt-5 border-t border-rule pt-4 text-[13.5px] leading-relaxed text-ink-2">
                    Most people reach you through <strong>{busiest.channel}</strong> — that’s{' '}
                    {Math.round((busiest.count / t.conversations) * 100)}% of every conversation.
                  </p>
                )}
              </>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle hint="How conversations ended">Outcomes</SectionTitle>
          <Card className="p-5">
            {loading ? (
              <div className="flex flex-col gap-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {data.byStatus
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <li key={s.status} className="flex items-center justify-between gap-3">
                        <Pill tone={TONE_BY_STATUS[s.status] ?? 'neutral'}>{s.status}</Pill>
                        <span className="text-[14px] tnum">
                          {num(s.count)}
                          <span className="ml-2 text-[13px] text-ink-3">
                            {Math.round((s.count / t.conversations) * 100)}%
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="mt-5 border-t border-rule pt-4 text-[13.5px] leading-relaxed text-ink-2">
                  “Left early” means the customer stopped replying before the assistant could finish
                  helping them. A high share here usually points to something worth reviewing in the
                  opening messages.
                </p>
              </>
            )}
          </Card>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle
          hint="The most recent people to get in touch"
          action={
            <Link
              to="/conversations"
              className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand hover:text-brand-deep"
            >
              See all
              <IconArrow size={14} />
            </Link>
          }
        >
          Latest conversations
        </SectionTitle>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex flex-col gap-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.recent.length === 0 ? (
            <Empty title="No conversations yet" note="They’ll appear here as customers get in touch." />
          ) : (
            <ul className="divide-y divide-rule">
              {data.recent.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/conversations/${c.id}`}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-sunk"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-medium">
                          {c.customerName ?? `${c.channel} visitor`}
                        </span>
                        <ChannelPill channel={c.channel} />
                        <Pill tone={TONE_BY_STATUS[c.status] ?? 'neutral'}>{c.status}</Pill>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">
                        {c.summary ?? 'No summary was recorded for this conversation.'}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[12.5px] text-ink-3">
                      {whenAgo(c.lastActivityAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  )
}
