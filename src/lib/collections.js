/**
 * The distinct values of one field, for a filter dropdown, with "All" first.
 *
 * Filter selects on three pages built this list themselves, in two slightly
 * different ways. One definition means one behaviour.
 */
export const ALL = 'All'

export function options(rows, key) {
  return [ALL, ...new Set(rows.map((r) => r[key]).filter(Boolean))]
}
