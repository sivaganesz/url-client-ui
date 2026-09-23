import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ENCRYPTION_KEY } from './env.ts'

/**
 * Encryption for the credentials this database holds on a client's behalf.
 *
 * A workspace's Perfox key authorises everything in that workspace, and the
 * operator site secret can sign anyone in as any operator. Stored in plain
 * text, one database dump would hand over every tenant at once — so they are
 * encrypted at rest and only ever decrypted in memory, for the length of one
 * upstream request.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than quietly yielding different plaintext.
 */

const KEY = createHash('sha256').update(ENCRYPTION_KEY).digest()
const IV_BYTES = 12 // 96 bits, the size GCM is specified for

/** `iv.ciphertext.tag`, each base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, body, cipher.getAuthTag()].map((b) => b.toString('base64url')).join('.')
}

/**
 * Returns null rather than throwing on anything malformed.
 *
 * A credential that cannot be decrypted is the same situation as one that was
 * never set — the workspace is unconfigured — and callers already handle that.
 * Throwing would turn a misconfiguration into a 500.
 */
export function decrypt(stored: string | null | undefined): string | null {
  if (!stored) return null
  const parts = stored.split('.')
  if (parts.length !== 3) return null
  try {
    const [iv, body, tag] = parts.map((p) => Buffer.from(p, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv!)
    decipher.setAuthTag(tag!)
    return Buffer.concat([decipher.update(body!), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Session tokens are stored hashed, so the table cannot be used to sign in. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url')

export const newToken = (): string => randomBytes(32).toString('base64url')

/** Constant-time compare, for anything an attacker can guess at repeatedly. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so unequal lengths are compared against a fixed-size stand-in.
  if (x.length !== y.length) {
    timingSafeEqual(x, x)
    return false
  }
  return timingSafeEqual(x, y)
}
