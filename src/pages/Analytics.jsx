import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import Card, { CardBody, CardHeader, ReservedPanel } from '../components/ui/Card'
import Button from '../components/ui/Button'
import DataBanner from '../components/ui/DataBanner'
import { Skeleton } from '../components/ui/States'
import BarChart from '../components/charts/BarChart'
import BarList from '../components/charts/BarList'
import { ChartFrame } from '../components/charts/ChartPrimitives'
import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconLines,
  IconNote,
  IconSparkle,
} from '../components/icons'
import { num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getSummary, UNAVAILABLE } from '../lib/api'
import {
  channelSplit as sampleSplit,
  summary as sampleSummary,
  volumeSeries as sampleVolume,
} from '../data/sample'

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

        {live && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-card border border-brand-line bg-brand-soft px-4 py-3"
          >
            <IconNote size={16} className="mt-0.5 shrink-0 text-brand-dark" />
            <p className="text-xs leading-relaxed text-ink-2">
              <span className="font-semibold text-brand-dark">Partly derived.</span>{' '}
              {UNAVAILABLE.analytics}
            </p>
          </div>
        )}

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
            foot={live ? 'Ended ÷ (ended + abandoned) — confirm definition' : 'Closed without handoff'}
            icon={IconCheck}
            loading={loading}
          />
          <StatTile
            label="Today’s token usage"
            value={live ? '—' : '1.84M'}
            foot={live ? 'Not exposed by this workspace' : 'Resets 00:00 UTC'}
            icon={IconSparkle}
            loading={loading}
          />
          <StatTile
            label="Total token usage"
            value={live ? '—' : '412.6M'}
            foot={live ? 'Not exposed by this workspace' : 'Lifetime, all agents'}
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
              <BarChart data={s.volumeSeries} label="Conversations created by day" formatValue={num} height={240} />
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

        <ReservedPanel
          icon={IconNote}
          title="Top intents & token usage over time"
          note="Reserved — this workspace has no analytics or usage resource, and no intent taxonomy to group by."
          className="min-h-40"
        />
      </PageBody>
    </>
  )
}
