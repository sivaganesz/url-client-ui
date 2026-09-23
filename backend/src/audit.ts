import type { Request } from 'express'
import { query } from './db/index.ts'

/**
 * Writing down what an admin did.
 *
 * Every mutating route on the admin surface calls this. They all either create
 * or take away somebody's access, or change a credential that reaches a
 * customer's data, and none of it used to leave a trace — "who suspended
 * Northwind, and when?" had no answer at all.
 *
 * Never throws. An audit write that fails must not turn a completed action
 * into a 500: the thing has already happened, and reporting otherwise would be
 * worse than the missing row. It is logged instead, loudly enough to notice.
 *
 * Nothing secret goes in `detail` — which fields changed, never what they
 * changed to. A table that exists to be read is the last place a Perfox key
 * should be.
 */
export interface AuditTarget {
  type: 'customer' | 'admin'
  id: string
  /** The name at the time, so a renamed or removed target still reads. */
  label?: string
}

export async function record(
  req: Request,
  action: string,
  target?: AuditTarget,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const admin = req.admin
  if (!admin) return

  try {
    await query(
      `INSERT INTO admin_events
         (admin_id, admin_email, action, target_type, target_id, target_label, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        admin.id,
        admin.email,
        action,
        target?.type ?? null,
        target?.id ?? null,
        target?.label ?? null,
        JSON.stringify(detail),
        req.ip ?? null,
      ],
    )
  } catch (err) {
    console.error('[audit] could not record', action, (err as Error).message)
  }
}
