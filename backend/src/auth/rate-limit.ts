import type { Request, Response, NextFunction } from 'express'

/**
 * A ceiling on sign-in attempts.
 *
 * argon2 already makes each guess expensive — that is most of the defence, and
 * why this was not urgent. What it does not stop is someone working steadily
 * through a list overnight, or hammering one known address until they get in.
 *
 * Counted per address AND per IP, and both must be under the limit. Per IP
 * alone lets one attacker spread across a botnet; per address alone lets them
 * try one password against every account they can name. Failures count;
 * successes clear the address, so a person who mistypes twice and then gets it
 * right is not punished for the next hour.
 *
 * In memory, deliberately. It is a single process today, and a Redis
 * dependency to defend a surface argon2 already makes slow would be paying
 * ahead of the problem. **This becomes ineffective the moment there is more
 * than one instance** — each would keep its own count — so it needs to move
 * when the deployment does.
 */

interface Bucket {
  failures: number
  /** When the window this bucket is counting started. */
  since: number
  /** Set while locked out; the request is refused until this passes. */
  until: number
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
const LOCKOUT_MS = 15 * 60 * 1000

const buckets = new Map<string, Bucket>()

/** Keeps the map from growing without bound on a long-running process. */
function sweep(now: number): void {
  if (buckets.size < 5000) return
  for (const [key, b] of buckets) {
    if (now - b.since > WINDOW_MS && b.until < now) buckets.delete(key)
  }
}

function bucketFor(key: string, now: number): Bucket {
  const existing = buckets.get(key)
  if (existing && now - existing.since < WINDOW_MS) return existing
  const fresh: Bucket = { failures: 0, since: now, until: 0 }
  buckets.set(key, fresh)
  return fresh
}

const keysFor = (req: Request): string[] => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const keys = [`ip:${req.ip ?? 'unknown'}`]
  if (email) keys.push(`email:${email}`)
  return keys
}

/**
 * Refuses while locked out; otherwise lets the handler decide.
 *
 * The handler reports the outcome back through `res.locals.loginFailed`, so
 * this middleware never has to know what a successful sign-in looks like.
 */
export function limitLogins(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now()
  sweep(now)

  const keys = keysFor(req)
  const locked = keys.map((k) => bucketFor(k, now)).find((b) => b.until > now)

  if (locked) {
    const seconds = Math.ceil((locked.until - now) / 1000)
    res.set('retry-after', String(seconds))
    // No hint about which limit was hit or how many attempts remain: that is
    // a free signal about whether the address exists and how close they are.
    res.status(429).json({
      error: 'Too many attempts. Try again in a few minutes.',
    })
    return
  }

  /**
   * `close`, not `finish`.
   *
   * `finish` fires only when a response is written out in full, so an attacker
   * who cut the connection the moment their guess was in flight was never
   * counted — the password was still checked, and the attempt cost them
   * nothing. `close` fires either way.
   *
   * Which means the outcome can now be unknown: the handler may not have
   * reached its verdict before the socket went. An attempt that did not finish
   * counts as a failure, since the alternative is a free guess, and only a
   * response that completed and said so clears the address.
   */
  res.on('close', () => {
    const failed = res.locals.loginFailed === true
    const signedIn = res.writableEnded && !failed && res.statusCode < 400

    for (const key of keys) {
      const b = bucketFor(key, Date.now())

      if (signedIn) {
        // Clears the address, so two typos then the right password does not
        // leave someone locked out of their own account.
        if (key.startsWith('email:')) buckets.delete(key)
        continue
      }

      // A rejected request that never reached the password — no email, no
      // body — is not a guess and is not counted as one.
      if (!failed && res.writableEnded) continue

      b.failures += 1
      if (b.failures >= MAX_FAILURES) b.until = Date.now() + LOCKOUT_MS
    }
  })

  next()
}

/** Called by tests, which would otherwise inherit each other's counts. */
export function resetRateLimits(): void {
  buckets.clear()
}
