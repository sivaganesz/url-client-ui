import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import { IconHash, IconSearch } from '../components/icons'
import { num } from '../lib/format'
import { ALL, options } from '../lib/collections'
import { useResource } from '../lib/useResource'
import { getPhoneNumbers, UNAVAILABLE } from '../lib/api'

/**
 * Connected numbers.
 *
 * The workspace exposes no phone-number resource yet, so `getPhoneNumbers`
 * rejects and every figure here reads as unavailable. That is deliberate: this
 * page previously showed invented numbers, providers and connection counts as
 * though they were real, which is worse than showing nothing — a reader had no
 * way to tell the fiction from the facts.
 *
 * The table and filters stay because they are the shape the endpoint will fill.
 * They are driven entirely by the response, so nothing is displayed until there
 * is something real to display.
 */
export default function PhoneNumbers() {
  const { openDrawer } = useOutletContext()
  const { data: numbers, status, error, reload } = useResource(getPhoneNumbers, [], [])

  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState(ALL)
  const [state, setState] = useState(ALL)

  const loading = status === 'loading'
  const unavailable = status === 'unavailable'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return numbers.filter((n) => {
      if (agent !== ALL && n.agent !== agent) return false
      if (state !== ALL && n.status !== state) return false
      if (!q) return true
      return `${n.number} ${n.label}`.toLowerCase().includes(q)
    })
  }, [numbers, query, agent, state])

  const live = numbers.filter((n) => n.status === 'Live').length

  const columns = [
    { key: 'number', header: 'Number', width: 180, mono: true },
    { key: 'label', header: 'Label', width: 200 },
    {
      key: 'agent',
      header: 'Linked agent',
      width: 180,
      render: (r) =>
        r.agent ? <Badge tone="info">{r.agent}</Badge> : <Badge tone="muted">Not linked</Badge>,
    },
    { key: 'direction', header: 'Direction', width: 130, muted: true },
    {
      key: 'conversations',
      header: 'Conversations',
      width: 140,
      mono: true,
      render: (r) => num(r.conversations),
    },
    { key: 'status', header: 'Status', width: 120, render: (r) => <StatusBadge label={r.status} /> },
  ]

  return (
    <>
      <PageHeader
        title="Phone Number Connections"
        subtitle={numbers.length ? `${live} live of ${numbers.length}` : undefined}
        onOpenDrawer={openDrawer}
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner status={status} error={error} onRetry={reload} note={UNAVAILABLE.phoneNumbers} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label="Connected numbers"
            value={unavailable ? '—' : num(numbers.length)}
            foot={unavailable ? 'No endpoint for this yet' : `${live} live`}
            icon={IconHash}
            loading={loading}
          />
        </div>

        {/* Filters would only offer "All" against an empty list. */}
        {numbers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              label="Search phone numbers"
              placeholder="Search number or label"
              value={query}
              onChange={setQuery}
              className="w-full sm:w-72"
            />
            <Select label="Agent" value={agent} onChange={setAgent} options={options(numbers, 'agent')} />
            <Select label="Status" value={state} onChange={setState} options={options(numbers, 'status')} />
          </div>
        )}

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.number}
          loading={loading}
          // A failed request is not an empty list; the table says so itself
          // rather than reading "no numbers connected".
          error={status === 'error' ? error : null}
          onRetry={reload}
          empty={
            <EmptyState
              icon={unavailable ? IconHash : IconSearch}
              title={
                unavailable
                  ? 'Phone numbers aren’t available yet'
                  : numbers.length
                    ? 'No numbers match'
                    : 'No numbers connected'
              }
              note={
                unavailable
                  ? 'The workspace has no phone-number resource, so there is nothing to show here yet. This page fills in as soon as the endpoint exists.'
                  : numbers.length
                    ? 'Try a different search term, or reset the dropdowns to All.'
                    : 'Numbers appear here once they are connected to the workspace.'
              }
            />
          }
        />
      </PageBody>
    </>
  )
}
