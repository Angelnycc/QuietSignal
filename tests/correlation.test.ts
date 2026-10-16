import { policy } from '../correlation/defaults'
import { describe, expect, test } from 'bun:test'
import { correlate, normalizeDomain } from '../correlation/model'
import { fixture } from '../demo/fixtures'

const now = 1_800_000_000_000
const attack = () => fixture('correlated', now)
const status = (snapshot = attack()) => correlate(snapshot, policy, now).summary.status
const quiet = 'no-corroborated-pattern'

describe('supplier incident correlation', () => {
  test('one collector identity cannot be enrolled at multiple organizations', () => {
    const input = attack()
    input.members[1]!.collectorIds.push(input.members[0]!.collectorIds[0]!)
    expect(() => status(input)).toThrow('Duplicate collector enrollment')
  })
  test('duplicate collector entries within one member fail closed', () => {
    const input = attack()
    input.members[0]!.collectorIds.push(input.members[0]!.collectorIds[0]!)
    expect(() => status(input)).toThrow('Duplicate collector enrollment')
  })
  test('CRE simulation configuration uses the same default correlation policy', async () => {
    const config = await Bun.file(
      new URL('../correlation/config.local-simulation.json', import.meta.url)
    ).json()
    expect(config.policy).toEqual(policy)
  })
  test('corroborates three independent members with supporting sequences', () => {
    const result = correlate(attack(), policy, now)
    expect(result.summary.status).toBe('corroborated-pattern')
    expect(result.privateFindings[0]?.organizationCount).toBe(3)
  })
  test('fifty different reports by one member count as one', () => {
    expect(status(fixture('duplicate-reports', now))).toBe(quiet)
  })
  test('exact report replays do not change the result', () => {
    const snapshot = attack()
    snapshot.observations.push(...snapshot.observations)
    expect(correlate(snapshot, policy, now)).toEqual(correlate(attack(), policy, now))
  })
  test('conflicting evidence identifiers fail closed', () => {
    const snapshot = attack()
    snapshot.observations.push({ ...snapshot.observations[0]!, destination: 'another.example' })
    expect(() => status(snapshot)).toThrow('Conflicting evidence identity')
  })
  test('two independent members cannot reach the threshold', () => {
    const snapshot = attack()
    snapshot.observations.pop()
    expect(status(snapshot)).toBe(quiet)
  })
  test('shared domains alone are not a suspicious sequence', () => {
    expect(status(fixture('benign-overlap', now))).toBe(quiet)
  })
  test('two sequence members plus a connection-only member suffice', () => {
    const snapshot = attack()
    snapshot.observations[2] = fixture('benign-overlap', now).observations[2]!
    expect(status(snapshot)).toBe('corroborated-pattern')
  })
  test('expired observations no longer corroborate', () => {
    expect(status(fixture('expired', now))).toBe(quiet)
  })
  test('a revoked member contributes nothing', () => {
    expect(status(fixture('revoked-member', now))).toBe(quiet)
  })
  test('unknown organizations and unauthorized collectors contribute nothing', () => {
    const snapshot = attack()
    snapshot.observations[0]!.collectorId = 'unauthorized'
    expect(status(snapshot)).toBe(quiet)
    snapshot.observations[0]!.organizationId = 'unregistered'
    expect(status(snapshot)).toBe(quiet)
  })
  test('expired membership is excluded', () => {
    const snapshot = attack()
    snapshot.members[0]!.expiresAtMs = now
    expect(status(snapshot)).toBe(quiet)
  })
  test('observations before membership was granted are excluded', () => {
    const snapshot = attack()
    snapshot.members[0]!.validFromMs = now - 30_000
    expect(status(snapshot)).toBe(quiet)
  })
  test('future evidence cannot contribute', () => {
    const snapshot = attack()
    snapshot.observations[0]!.connectionAtMs = now + 1
    expect(status(snapshot)).toBe(quiet)
  })
  test('evidence after source snapshot time is excluded', () => {
    const snapshot = attack()
    snapshot.createdAtMs = now - 10_000
    const e = snapshot.observations[0]!
    if (e.kind === 'post-update-process-chain') e.childProcessAtMs = now - 1000
    expect(status(snapshot)).toBe(quiet)
  })
  test('an inverted event sequence does not count', () => {
    const snapshot = attack()
    for (const e of snapshot.observations)
      if (e.kind === 'post-update-process-chain') e.updateAtMs = now - 1000
    expect(status(snapshot)).toBe(quiet)
  })
  test('a sequence spanning too much time is excluded', () => {
    const snapshot = attack()
    for (const e of snapshot.observations)
      if (e.kind === 'post-update-process-chain') e.updateAtMs = now - 900_000
    expect(status(snapshot)).toBe(quiet)
  })
  test('supplier, software version, and destination all have to match', () => {
    for (const field of ['supplierId', 'softwareVersion', 'destination'] as const) {
      const snapshot = attack()
      snapshot.observations[0]![field] = 'different.example'
      expect(status(snapshot)).toBe(quiet)
    }
  })
  test('domain case and a terminal dot do not split matching evidence', () => {
    const snapshot = attack()
    snapshot.observations[0]!.destination = 'RELAY.Supplier-Incident.Example.'
    expect(status(snapshot)).toBe('corroborated-pattern')
  })
  test('URLs and malformed destinations cannot masquerade as domains', () => {
    for (const input of [
      'https://relay.example',
      'a..example',
      'user@relay.example',
      '-a.example',
      ' a.example',
    ]) {
      expect(normalizeDomain(input)).toBeNull()
    }
  })
  test('stale and future snapshots fail closed', () => {
    const snapshot = attack()
    snapshot.createdAtMs = now - policy.maxSnapshotAgeMs - 1
    expect(() => status(snapshot)).toThrow('Snapshot is stale or from the future')
    snapshot.createdAtMs = now + 1
    expect(() => status(snapshot)).toThrow()
  })
  test('duplicate enrollment identities fail closed', () => {
    const snapshot = attack()
    snapshot.members.push(snapshot.members[0]!)
    expect(() => status(snapshot)).toThrow('Duplicate enrollment identity')
  })
  test('invalid thresholds and unexpected input fields fail closed', () => {
    expect(() => correlate(attack(), { ...policy, minimumOrganizations: 1 }, now)).toThrow()
    expect(() => correlate(attack(), { ...policy, minimumSequenceOrganizations: 4 }, now)).toThrow()
    expect(() => correlate({ ...attack(), unapprovedField: 'data' }, policy, now)).toThrow()
  })
  test('released summary omits identities, destinations, supplier, and counts', () => {
    const output = JSON.stringify(correlate(attack(), policy, now).summary)
    for (const value of [
      'demo-alpha',
      'demo-bravo',
      'collector-',
      'supplier-incident',
      'demo-maintenance-vendor',
      '4.2.1',
      'organizationCount',
      'privateFindings',
    ]) {
      expect(output).not.toContain(value)
    }
    expect(Object.keys(JSON.parse(output)).sort()).toEqual([
      'evaluatedAtMs',
      'mode',
      'policyVersion',
      'status',
      'validUntilMs',
    ])
  })
  test('results are independent of evidence order', () => {
    const snapshot = attack()
    snapshot.observations.reverse()
    expect(correlate(snapshot, policy, now)).toEqual(correlate(attack(), policy, now))
  })
  test('warning expires no later than evidence or source freshness', () => {
    const snapshot = attack()
    snapshot.members[0]!.expiresAtMs = now + 500
    expect(correlate(snapshot, policy, now).summary.validUntilMs).toBe(now + 500)
    expect(correlate(attack(), policy, now).summary.validUntilMs).toBe(
      now + policy.maxSnapshotAgeMs
    )
  })
})
