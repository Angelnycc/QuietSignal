import type { Policy, Snapshot, Observation } from '../correlation/model'

export const policy: Policy = {
  version: 'supplier-sequence-v1', minimumOrganizations: 3, minimumSequenceOrganizations: 2,
  windowMs: 1_800_000, maxSequenceSpanMs: 600_000, maxSnapshotAgeMs: 60_000, alertTtlMs: 300_000,
}
export const scenarios = ['correlated', 'duplicate-reports', 'benign-overlap', 'expired', 'revoked-member'] as const
export type Scenario = typeof scenarios[number]

export function fixture(scenario: Scenario, nowMs: number): Snapshot {
  const members = ['alpha', 'bravo', 'charlie'].map(id => ({
    organizationId: `demo-${id}`, active: true, validFromMs: nowMs - 86_400_000,
    expiresAtMs: nowMs + 86_400_000, collectorIds: [`collector-${id}`],
  }))
  const observations: Observation[] = members.map((m, i) => ({
    kind: 'post-update-process-chain', eventId: `demo-event-${i}`,
    organizationId: m.organizationId, collectorId: m.collectorIds[0]!,
    supplierId: 'demo-maintenance-vendor', softwareVersion: '4.2.1',
    destination: 'relay.supplier-incident.example',
    updateAtMs: nowMs - 180_000, connectionAtMs: nowMs - 120_000, childProcessAtMs: nowMs - 60_000,
  }))
  const snapshot: Snapshot = { createdAtMs: nowMs, members, observations }
  if (scenario === 'duplicate-reports') {
    snapshot.observations = Array.from({ length: 50 }, (_, i) => ({ ...observations[0]!, eventId: `repetition-${i}` }))
  } else if (scenario === 'benign-overlap') {
    snapshot.observations = observations.map(e => ({
      kind: 'new-destination', eventId: e.eventId, organizationId: e.organizationId,
      collectorId: e.collectorId, supplierId: e.supplierId, softwareVersion: e.softwareVersion,
      destination: e.destination, connectionAtMs: e.connectionAtMs,
    }))
  } else if (scenario === 'expired') {
    snapshot.observations = observations.map(e => ({ ...e, kind: 'post-update-process-chain',
      updateAtMs: nowMs - 2_100_000, connectionAtMs: nowMs - 2_040_000, childProcessAtMs: nowMs - 1_980_000 }))
  } else if (scenario === 'revoked-member') snapshot.members[2]!.active = false
  return snapshot
}
