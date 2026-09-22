import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import Card, { CardBody, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import DataBanner from '../components/ui/DataBanner'
import ConversationLog from '../components/ConversationLog'
import { ChipGroup, DateRange } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import LineChart from '../components/charts/LineChart'
import BarList from '../components/charts/BarList'
import { ChartFrame } from '../components/charts/ChartPrimitives'
import {
  IconChat,
  IconCheck,
  IconCredit,
} from '../components/icons'
import { credits, num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getConversationsOverTime, getCredits, getSummary } from '../lib/api'
import { EMPTY_CREDITS, EMPTY_SUMMARY } from '../lib/shapes'
import { conversationLog } from '../data/conversationLog'

/** Bucket sizes the endpoint understands, in the casing the chips show. */
const INTERVALS = ['Day', 'Week', 'Month']

export default function Analytics() {
  const { openDrawer } = useOutletContext()
  const { data: s, status, error, reload } = useResource(getSummary, EMPTY_SUMMARY, [])

  const credit = useResource(getCredits, EMPTY_CREDITS, [])

  const [interval, setInterval] = useState('Day')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  // Its own resource: the series comes from a different endpoint, and a chart
  // that can load should not wait on the tiles, or fail with them. Changing a
  // control changes the deps, which refetches.
  const overTime = useResource(
    (signal) =>
      getConversationsOverTime(
        {
          interval: interval.toLowerCase(),
          start_date: start || undefined,
          end_date: end || undefined,
        },
        signal,
      ),
    [],
    [interval, start, end],
  )

  const loading = status === 'loading'
  const series = overTime.data

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="All agents"
        onOpenDrawer={openDrawer}
      />

      <PageBody className="flex flex-col gap-5">
        <DataBanner status={status} error={error} onRetry={reload} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label="Total conversations"
            value={num(s.totalConversations)}
            foot="Across all channels"
            icon={IconChat}
            loading={loading}
          />
          <StatTile
            label="Resolution rate"
            value={s.resolutionRate === null || s.resolutionRate === undefined ? '—' : pct(s.resolutionRate)}
            foot={
              s.analytics?.resolved != null
                ? `${num(s.analytics.resolved)} resolved of ${num(s.analytics.total)}`
                : 'Closed without handoff'
            }
            icon={IconCheck}
            loading={loading}
          />
          <StatTile
            label="Credit balance"
            value={credits(credit.data.balance)}
            foot={
              credit.status === 'error'
                ? 'Balance unavailable'
                : credit.data.out
                  ? 'Out of credits — agents cannot run'
                  : credit.data.low
                    ? 'Running low — top up soon'
                    : 'Available to spend'
            }
            tone={credit.data.out ? 'danger' : credit.data.low ? 'warn' : undefined}
            icon={IconCredit}
            loading={credit.status === 'loading'}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ChartFrame
            title="Conversation over time"
            subtitle={
              series.length
                ? `Conversations created per ${interval.toLowerCase()} · ${series[0].label} – ${series.at(-1).label}`
                : `Conversations created per ${interval.toLowerCase()}`
            }
            className="lg:col-span-2"
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-2">
              <ChipGroup
                label="Interval"
                options={INTERVALS}
                value={interval}
                onChange={setInterval}
              />
              <span aria-hidden="true" className="h-5 w-px bg-line" />
              <DateRange from={start} to={end} onFrom={setStart} onTo={setEnd} />
              {(start || end) && (
                <Button
                  size="sm"
                  className="px-2"
                  onClick={() => {
                    setStart('')
                    setEnd('')
                  }}
                >
                  Clear dates
                </Button>
              )}
            </div>

            {overTime.status === 'loading' ? (
              <Skeleton className="h-60 w-full" />
            ) : overTime.status === 'error' ? (
              <ErrorState error={overTime.error} onRetry={overTime.reload} />
            ) : series.length === 0 ? (
              <EmptyState
                icon={IconChat}
                title="Nothing in this range"
                note="No conversations were created in the period selected."
              />
            ) : (
              <LineChart
                data={series}
                label={`Conversations created by ${interval.toLowerCase()}`}
                formatValue={num}
                height={240}
                domain={[0, Math.max(...series.map((d) => d.value), 1) * 1.15]}
              />
            )}
          </ChartFrame>

          <Card className="flex flex-col">
            <CardHeader title="Channel breakdown" subtitle="Share of all conversations" />
            <CardBody className="flex-1">
              {loading ? (
                <div className="flex flex-col gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : s.channelSplit.length === 0 ? (
                <EmptyState
                  icon={IconChat}
                  title={status === 'error' ? 'Couldn’t load the breakdown' : 'No conversations yet'}
                  note={
                    status === 'error'
                      ? 'The banner above has the details.'
                      : 'Channels appear here once conversations start arriving.'
                  }
                />
              ) : (
                <BarList
                  data={s.channelSplit.map((c) => ({ label: c.channel, value: c.count }))}
                  formatValue={num}
                  label="Conversations by channel"
                />
              )}
            </CardBody>
          </Card>
        </div>

        <ConversationLog rows={conversationLog} />
      </PageBody>
    </>
  )
}
