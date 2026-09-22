import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import Card, { CardBody, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import DataBanner from '../components/ui/DataBanner'
import ConversationLog from '../components/ConversationLog'
import { Skeleton } from '../components/ui/States'
import LineChart from '../components/charts/LineChart'
import BarList from '../components/charts/BarList'
import { ChartFrame } from '../components/charts/ChartPrimitives'
import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconLines,
  IconSparkle,
} from '../components/icons'
import { compact, num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getSummary } from '../lib/api'
import {
  channelSplit as sampleSplit,
  summary as sampleSummary,
  volumeSeries as sampleVolume,
} from '../data/sample'
import { conversationLog } from '../data/conversationLog'

const fallback = {
  ...sampleSummary,
  channelSplit: sampleSplit,
  volumeSeries: sampleVolume.map((d) => ({
    label: d.day,
    value: d.whatsapp + d.phone + d.email + d.sms,
  })),
}

export default function Analytics() {
  const { openDrawer } = useOutletContext()
  const { data: s, status, error, reload } = useResource(getSummary, fallback, [])
  const loading = status === 'loading'
  const live = status === 'live'

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="All agents"
        onOpenDrawer={openDrawer}
        actions={
          <>
            <Button className="hidden sm:inline-flex">
              <IconCalendar size={15} />
              Last 7 days
              <IconChevronDown size={13} />
            </Button>
            <Button iconOnly aria-label="Export analytics">
              <IconDownload size={15} />
            </Button>
          </>
        }
      />

      <PageBody className="flex flex-col gap-5">
        <DataBanner
          status={status}
          error={error}
          onRetry={reload}
          note="Showing bundled samples."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            label="Tokens used today"
            value={s.today?.tokensTotal == null ? '—' : compact(s.today.tokensTotal)}
            foot={
              s.today?.llmCalls != null ? `${num(s.today.llmCalls)} model calls` : 'Resets at midnight'
            }
            icon={IconSparkle}
            loading={loading}
          />
          <StatTile
            label="Total tokens used"
            value={s.analytics?.tokensTotal == null ? '—' : compact(s.analytics.tokensTotal)}
            foot={
              s.analytics?.tokensIn != null
                ? `${compact(s.analytics.tokensIn)} in · ${compact(s.analytics.tokensOut)} out`
                : 'Lifetime, all agents'
            }
            icon={IconLines}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ChartFrame
            title="Conversation volume"
            subtitle="Conversations created per day, last 7 days"
            className="lg:col-span-2"
          >
            {loading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <LineChart
                data={s.volumeSeries}
                label="Conversations created by day"
                formatValue={num}
                height={240}
                domain={[0, Math.max(...s.volumeSeries.map((d) => d.value), 1) * 1.15]}
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
