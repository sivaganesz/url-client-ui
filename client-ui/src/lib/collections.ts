/**
 * The distinct values of one field, for a filter dropdown, with "All" first.
 *
 * Filter selects on three pages built this list themselves, in two slightly
 * different ways. One definition means one behaviour.
 */
export const ALL = 'All'

export function options<T>(rows: readonly T[], key: keyof T): string[] {
  return [ALL, ...new Set(rows.map((r) => String(r[key])).filter(Boolean))]
}
