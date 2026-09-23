import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import { IconHash, IconSearch, channelIcon, IconChat } from '../components/icons'
import { num } from '../lib/format'
import { ALL, options } from '../lib/collections'
import { useResource } from '../lib/useResource'
import { getPhoneNumbers } from '../lib/api'
import type { Connection, ShellContext } from '../lib/types'
import type { Column } from '../components/ui/DataTable'

/**
 * Every number and address the workspace can be reached on.
 *
 * Not only phone numbers, despite the page's name: the same endpoint returns
 * WhatsApp, SMS and email identifiers, and they belong together — they are the
 * workspace's inbound surface, and an operator asking "what are we reachable
 * on?" wants one answer, not four.
 *
 * One number appears once per channel. +91… for voice and +91… for WhatsApp
 * are separate rows because they are bound to agents separately, and showing
 * them merged would hide that one is claimed and the other is not.
 */
export default function PhoneNumbers() {
  const { openDrawer } = useOutletContext<ShellContext>()
  const { data: connections, status, error, reload } = useResource(getPhoneNumbers, [], [])

  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState(ALL)
  const [agent, setAgent] = useState(ALL)

  const loading = status === 'loading'

  /** The agent's name, or the word for "nothing is bound to this". */
  const agentName = (c: Connection) => c.agent?.name ?? 'Unassigned'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return connections.filter((c) => {
      if (channel !== ALL && c.channel !== channel) return false
      if (agent !== ALL && agentName(c) !== agent) return false
      if (!q) return true
      return `${c.identifier} ${c.label} ${c.credentialName}`.toLowerCase().includes(q)
    })
  }, [connections, query, channel, agent])

  // Counted over every row, not the filtered view: a page is a window on the
  // list, not the total.
  const assigned = connections.filter((c) => c.agent).length
  const spare = connections.length - assigned
  const voice = connections.filter((c) => c.channel === 'Phone').length

  const columns: Column<Connection>[] = [
    {
      key: 'identifier',
      header: 'Number or address',
      width: 200,
      mono: true,
      render: (c) => (
        <span className="truncate" title={c.label}>
          {c.identifier}
        </span>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 120,
      render: (c) => {
        const Icon = channelIcon[c.channel] ?? IconChat
        return (
          <Badge tone="muted" size="sm">
            <Icon size={10} />
            {c.channel}
          </Badge>
        )
      },
    },
    {
      key: 'agent',
      header: 'Agent',
      width: 190,
      render: (c) =>
        c.agent ? (
          <Badge tone="info" size="sm">
            {c.agent.name}
          </Badge>
        ) : (
          // A spare number is a normal state, not a problem, so it is stated
          // plainly rather than flagged.
          <span className="text-[11.5px] text-ink-4">Unassigned</span>
        ),
    },
    {
      key: 'credentialName',
      header: 'Connection',
      width: 150,
      muted: true,
      render: (c) => (
        <span className="truncate" title={`${c.credentialName} · ${c.provider}`}>
          {c.credentialName}
        </span>
      ),
    },
    {
      key: 'capabilities',
      header: 'Capabilities',
      width: 150,
      render: (c) =>
        c.capabilities.length ? (
          <span className="flex flex-wrap gap-1">
            {c.capabilities.map((cap) => (
              <Badge key={cap} tone="muted" size="sm">
                {cap}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (c) => <StatusBadge label={c.status} size="sm" />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Phone Number Connections"
        subtitle={
          loading ? undefined : `${assigned} assigned · ${spare} spare`
        }
        onOpenDrawer={openDrawer}
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner status={status} error={error} onRetry={reload} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Reachable on"
            value={num(connections.length)}
            foot={`${voice} for voice`}
            icon={IconHash}
            loading={loading}
          />
          <StatTile
            label="Assigned"
            value={num(assigned)}
            foot="bound to an agent"
            loading={loading}
          />
          <StatTile
            label="Spare"
            value={num(spare)}
            foot="nothing is listening"
            loading={loading}
          />
        </div>

        {/* Filters would only offer "All" against an empty list. */}
        {connections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              label="Search numbers and addresses"
              placeholder="Search number, label or connection"
              value={query}
              onChange={setQuery}
              className="w-full sm:w-72"
            />
            <Select
              label="Channel"
              value={channel}
              onChange={setChannel}
              options={options(connections, 'channel')}
            />
            <Select
              label="Agent"
              value={agent}
              onChange={setAgent}
              options={[ALL, ...new Set(connections.map(agentName))]}
            />
          </div>
        )}

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={rows}
          // The same number is a separate row per channel, so the identifier
          // alone is not unique.
          rowKey={(c) => c.rowId}
          loading={loading}
          // A failed request is not an empty list; the table says so itself
          // rather than reading "nothing connected".
          error={status === 'error' ? error : null}
          onRetry={reload}
          empty={
            <EmptyState
              icon={connections.length ? IconSearch : IconHash}
              title={connections.length ? 'Nothing matches' : 'Nothing connected yet'}
              note={
                connections.length
                  ? 'Try a different search term, or reset the dropdowns to All.'
                  : 'Numbers and addresses appear here once a credential carrying them is connected to the workspace.'
              }
            />
          }
        />
      </PageBody>
    </>
  )
}
