import { Link, useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import Card, { CardBody, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Avatar from '../components/ui/Avatar'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { EmptyState, Skeleton } from '../components/ui/States'
import BarChart from '../components/charts/BarChart'
import BarList from '../components/charts/BarList'
import { ChartFrame } from '../components/charts/ChartPrimitives'
import {
  IconCalendar,
  IconChat,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconGlobe,
  IconSms,
  IconPhone,
  channelIcon,
} from '../components/icons'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getConversations, getSummary } from '../lib/api'
import {
  channelSplit as sampleSplit,
  conversations as sampleConversations,
  summary as sampleSummary,
  volumeSeries as sampleVolume,
} from '../data/sample'

const fallbackSummary = {
  ...sampleSummary,
  channelSplit: sampleSplit,
  volumeSeries: sampleVolume.map((d) => ({
    label: d.day,
    value: d.whatsapp + d.phone + d.email + d.sms,
  })),
}

export default function Dashboard() {
  const { openDrawer } = useOutletContext()
  const summary = useResource(getSummary, fallbackSummary, [])
  const recent = useResource(getConversations, sampleConversations, [])

  const s = summary.data
  const loading = summary.status === 'loading'

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="All channels"
        onOpenDrawer={openDrawer}
        actions={
          <>
            <Button className="hidden sm:inline-flex">
              <IconCalendar size={15} />
              Last 7 days
              <IconChevronDown size={13} />
            </Button>
            <Button iconOnly aria-label="Export dashboard">
              <IconDownload size={15} />
            </Button>
          </>
        }
      />

      <PageBody className="flex flex-col gap-5">
        <DataBanner
          status={summary.status}
          error={summary.error}
          onRetry={summary.reload}
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
            label="Phone conversations"
            value={num(s.phoneConversations)}
            foot="Started on the phone channel"
            icon={IconPhone}
            loading={loading}
          />
          <StatTile
            label="WhatsApp conversations"
            value={num(s.whatsappConversations)}
            foot="Started on WhatsApp"
            icon={IconSms}
            loading={loading}
          />
          <StatTile
            label="Web conversations"
            value={num(s.webConversations)}
            foot="Started in the web widget"
            icon={IconGlobe}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ChartFrame
            title="Conversation volume"
            subtitle="All channels, last 7 days"
            className="lg:col-span-2"
          >
            {loading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <BarChart
                data={s.volumeSeries}
                label="Conversation volume by day"
                formatValue={num}
                height={240}
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

        <Card>
          <CardHeader
            title="Recent conversations"
            action={
              <Link
                to="/conversations"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark"
              >
                View all
                <IconChevronRight size={13} />
              </Link>
            }
          />
          <CardBody className="px-0 pb-0">
            {recent.status === 'loading' ? (
              <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : recent.data.length === 0 ? (
              <EmptyState icon={IconChat} title="No conversations yet" />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {recent.data.slice(0, 5).map((c) => {
                  const ChannelIcon = channelIcon[c.channel] ?? IconChat
                  return (
                    <li key={c.id}>
                      <Link
                        to={`/conversations/${c.id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-sunken"
                      >
                        <Avatar name={c.name} size="sm" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[13px] font-semibold">{c.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-ink-3">{c.time}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge tone="muted" size="sm">
                              <ChannelIcon size={10} />
                              {c.channel}
                            </Badge>
                            <span className="truncate text-[11.5px] text-ink-3">{c.preview}</span>
                          </div>
                        </div>
                        <StatusBadge label={c.status} size="sm" className="hidden sm:inline-flex" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  )
}
