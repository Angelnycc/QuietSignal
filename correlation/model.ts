import { z } from 'zod'

const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const id = z.string().min(1).max(128)
export const policySchema = z.object({
  version: id,
  minimumOrganizations: z.number().int().min(3).max(100),
  minimumSequenceOrganizations: z.number().int().min(2).max(100),
  windowMs: z.number().int().min(1000).max(86_400_000),
  maxSequenceSpanMs: z.number().int().min(1000).max(3_600_000),
  maxSnapshotAgeMs: z.number().int().min(1000).max(300_000),
  alertTtlMs: z.number().int().min(1000).max(3_600_000),
}).strict().refine(p => p.minimumSequenceOrganizations <= p.minimumOrganizations,
  'Sequence threshold exceeds organization threshold')

const common = {
  eventId: id, organizationId: id, collectorId: id, supplierId: id,
  softwareVersion: id, destination: z.string().min(1).max(253), connectionAtMs: timestamp,
}
export const observationSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('new-destination') }).strict(),
  z.object({ ...common, kind: z.literal('post-update-process-chain'),
    updateAtMs: timestamp, childProcessAtMs: timestamp }).strict(),
])
export const snapshotSchema = z.object({
  createdAtMs: timestamp,
  // This roster represents a trusted enrollment authority in the mock source.
  members: z.array(z.object({
    organizationId: id, active: z.boolean(), shareEvidenceWithConsortium: z.boolean(), validFromMs: timestamp,
    expiresAtMs: timestamp, collectorIds: z.array(id).max(20),
  }).strict()).max(100),
  observations: z.array(observationSchema).max(1000),
}).strict()
export type Policy = z.infer<typeof policySchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export type Observation = z.infer<typeof observationSchema>
export interface PrivateFinding {
  supplierId: string; softwareVersion: string; destination: string
  organizationCount: number; sequenceOrganizationCount: number; evidenceExpiresAtMs: number
}
export interface PublicSummary {
  mode: 'local-simulation'; policyVersion: string; evaluatedAtMs: number; validUntilMs: number
  status: 'corroborated-pattern' | 'no-corroborated-pattern'
}

export function normalizeDomain(input: string): string | null {
  const domain = input.toLowerCase().replace(/\.$/, '')
  const labels = domain.split('.')
  if (domain.length > 253 || labels.length < 2) return null
  return labels.every(l => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ? domain : null
}

export function correlate(input: unknown, policyInput: unknown, nowMs: number): {
  summary: PublicSummary; privateFindings: PrivateFinding[]
} {
  timestamp.parse(nowMs)
  const policy = policySchema.parse(policyInput)
  const snapshot = snapshotSchema.parse(input)
  if (snapshot.createdAtMs > nowMs || nowMs - snapshot.createdAtMs > policy.maxSnapshotAgeMs) {
    throw new Error('Snapshot is stale or from the future')
  }
  const members = new Map(snapshot.members.map(m => [m.organizationId, m]))
  if (members.size !== snapshot.members.length) throw new Error('Duplicate enrollment identity')
  const events = new Map<string, Observation>()
  for (const event of snapshot.observations) {
    const key = JSON.stringify([event.organizationId, event.collectorId, event.eventId])
    const previous = events.get(key)
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
      throw new Error('Conflicting evidence identity')
    }
    events.set(key, event)
  }
  type Group = {
    supplierId: string; softwareVersion: string; destination: string
    organizations: Map<string, number>; sequences: Map<string, number>
  }
  const groups = new Map<string, Group>()
  for (const event of events.values()) {
    const member = members.get(event.organizationId)
    if (!member?.active || nowMs < member.validFromMs || nowMs >= member.expiresAtMs ||
        !member.collectorIds.includes(event.collectorId)) continue
    const times = event.kind === 'post-update-process-chain'
      ? [event.updateAtMs, event.connectionAtMs, event.childProcessAtMs] : [event.connectionAtMs]
    if (times.some(t => t <= nowMs - policy.windowMs || t > snapshot.createdAtMs ||
        t < member.validFromMs || t >= member.expiresAtMs)) continue
    if (event.kind === 'post-update-process-chain' &&
        (event.updateAtMs > event.connectionAtMs || event.connectionAtMs > event.childProcessAtMs ||
         event.childProcessAtMs - event.updateAtMs > policy.maxSequenceSpanMs)) continue
    const destination = normalizeDomain(event.destination)
    if (!destination) continue
    const key = JSON.stringify([event.supplierId, event.softwareVersion, destination])
    const group = groups.get(key) ?? {
      supplierId: event.supplierId, softwareVersion: event.softwareVersion, destination,
      organizations: new Map<string, number>(), sequences: new Map<string, number>(),
    }
    const expiry = Math.min(Math.min(...times) + policy.windowMs, member.expiresAtMs)
    group.organizations.set(event.organizationId,
      Math.max(group.organizations.get(event.organizationId) ?? 0, expiry))
    if (event.kind === 'post-update-process-chain') {
      group.sequences.set(event.organizationId,
        Math.max(group.sequences.get(event.organizationId) ?? 0, expiry))
    }
    groups.set(key, group)
  }
  const findings: PrivateFinding[] = []
  const thresholdExpiry = (values: Map<string, number>, count: number) =>
    [...values.values()].sort((a, b) => b - a)[count - 1]!
  for (const group of groups.values()) {
    if (group.organizations.size < policy.minimumOrganizations ||
        group.sequences.size < policy.minimumSequenceOrganizations) continue
    findings.push({
      supplierId: group.supplierId, softwareVersion: group.softwareVersion,
      destination: group.destination, organizationCount: group.organizations.size,
      sequenceOrganizationCount: group.sequences.size,
      evidenceExpiresAtMs: Math.min(
        thresholdExpiry(group.organizations, policy.minimumOrganizations),
        thresholdExpiry(group.sequences, policy.minimumSequenceOrganizations)),
    })
  }
  findings.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return {
    summary: {
      mode: 'local-simulation', policyVersion: policy.version, evaluatedAtMs: nowMs,
      validUntilMs: Math.min(nowMs + policy.alertTtlMs,
        snapshot.createdAtMs + policy.maxSnapshotAgeMs, ...findings.map(f => f.evidenceExpiresAtMs)),
      status: findings.length ? 'corroborated-pattern' : 'no-corroborated-pattern',
    },
    privateFindings: findings,
  }
}
