import argon2 from 'argon2'

/**
 * argon2id, at the library's defaults.
 *
 * Chosen over bcrypt because it is memory-hard: a GPU or ASIC farm gains far
 * less on it than on bcrypt, which is the whole threat model for a stolen
 * password table.
 *
 * The parameters are not tuned here on purpose. argon2's defaults track the
 * current OWASP guidance, and a number invented today would be a number nobody
 * revisits in three years.
 */
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id })

/**
 * Returns false rather than throwing on a malformed hash.
 *
 * A row whose hash cannot be parsed must fail the sign-in, not 500 — a 500
 * tells whoever is probing that this particular account is interesting.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

/**
 * Burns roughly the time a real verification takes.
 *
 * Without it, an unknown email returns visibly faster than a known one with
 * the wrong password, and that difference is enough to enumerate who has an
 * account here.
 */
const DECOY =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1maXhlZC1zYWx0LXZhbHVl$Zm9yIHRpbWluZyBwdXJwb3NlcyBvbmx5ISE'

export async function wasteTime(): Promise<void> {
  await verifyPassword(DECOY, 'no such password')
}

/**
 * The floor, not a policy.
 *
 * Length is the only requirement that reliably helps. Composition rules push
 * people towards "Password1!" and towards reuse, so they are deliberately
 * absent; a password manager and a long passphrase both pass.
 */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 12) return 'Use at least 12 characters.'
  if (plain.length > 200) return 'That is longer than 200 characters.'
  return null
}
