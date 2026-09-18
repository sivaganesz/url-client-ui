import { useMemo, useState } from 'react'
import { PageIntro } from '../components/Shell'
import { Card, Empty, IconSearch, Pill, Problem, SearchBox, Skeleton } from '../components/ui'
import { dateLong, num, whenAgo } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getCustomers } from '../lib/api'

export default function Customers() {
  const { data, status, reload } = useResource(getCustomers, [])
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((c) =>
      [c.name, c.phone, c.email].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [data, query])

  if (status === 'error') {
    return (
      <>
        <PageIntro title="Customers" />
        <Problem onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageIntro title="Customers">
        People who shared their details while talking to one of your assistants.
      </PageIntro>

      <SearchBox
        label="Search customers"
        placeholder="Search by name, phone or email"
        value={query}
        onChange={setQuery}
        className="mb-5 max-w-xl"
      />

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <Empty
            icon={IconSearch}
            title={query ? 'Nothing matches' : 'No customers yet'}
            note={
              query
                ? 'Try a different search.'
                : 'People appear here once they share a name or number.'
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-ink-3">
            Showing {rows.length} of {data.length} customers
          </p>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-rule">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-[15px] font-medium">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details shared'}
                    </p>
                  </div>

                  {c.tags.length > 0 && (
                    <div className="flex gap-1.5">
                      {c.tags.slice(0, 2).map((t) => (
                        <Pill key={t}>{t}</Pill>
                      ))}
                    </div>
                  )}

                  <div className="text-right">
                    <p className="text-[14px] tnum">{num(c.conversations)}</p>
                    <p className="text-[12px] text-ink-3">
                      {c.conversations === 1 ? 'conversation' : 'conversations'}
                    </p>
                  </div>

                  <div className="w-36 text-right">
                    <p className="text-[13px]">{whenAgo(c.lastSeen)}</p>
                    <p className="text-[12px] text-ink-3">since {dateLong(c.firstSeen)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
