import {
  createHash,
  createPublicKey,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from 'node:crypto'

export const digest = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')
export function constantTimeToken(value: string, expectedHash: string): boolean {
  return timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(expectedHash, 'hex'))
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
      .join(',') +
    '}'
  )
}
export function publicKey(encoded: string): KeyObject {
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) throw new Error('Noncanonical public key')
  const key = createPublicKey({ key: decoded, type: 'spki', format: 'der' })
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Only Ed25519 is supported')
  return key
}
export interface SigningContext {
  workspaceId: string
  collectorId: string
  timestamp: string
  nonce: string
}
export function signingMessage(context: SigningContext, body: string): string {
  return [
    'QUIETSIGNAL-OBSERVATION-V1',
    context.workspaceId,
    'POST',
    '/api/pilot/observations',
    context.collectorId,
    context.timestamp,
    context.nonce,
    digest(body),
  ].join('\n')
}
export function signObservation(
  context: SigningContext,
  body: string,
  privateKey: KeyObject | string
): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    'X-QS-Workspace': context.workspaceId,
    'X-QS-Collector': context.collectorId,
    'X-QS-Timestamp': context.timestamp,
    'X-QS-Nonce': context.nonce,
    'X-QS-Signature': sign(null, Buffer.from(signingMessage(context, body)), privateKey).toString(
      'base64url'
    ),
  })
}
export function verifyObservation(
  context: SigningContext,
  body: string,
  signature: string,
  encodedKey: string
): boolean {
  if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) return false
  try {
    const bytes = Buffer.from(signature, 'base64url')
    if (bytes.length !== 64 || bytes.toString('base64url') !== signature) return false
    return verify(null, Buffer.from(signingMessage(context, body)), publicKey(encodedKey), bytes)
  } catch {
    return false
  }
}
/** Bounded process-local limiter, not a distributed abuse-control service. */
export class RateLimiter {
  private windows = new Map<string, { count: number; until: number }>()
  take(key: string, limit: number, now: number): boolean {
    for (const [item, state] of this.windows) if (state.until <= now) this.windows.delete(item)
    const state = this.windows.get(key)
    if (!state) {
      if (this.windows.size >= 2000) return false
      this.windows.set(key, { count: 1, until: now + 60_000 })
      return true
    }
    if (state.count >= limit) return false
    state.count++
    return true
  }
}
