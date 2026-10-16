import { policy } from '../correlation/defaults'
import { describe, expect, test } from 'bun:test'
import { buildEvidenceBriefs } from '../correlation/evidence'
import { correlate } from '../correlation/model'
import { fixture } from '../demo/fixtures'
import { disclosurePolicy } from '../correlation/defaults'

const now = 1_800_000_123_456
const snapshot = () => fixture('correlated', now)
const briefs = (input = snapshot(), releasePolicy = disclosurePolicy, recipient = 'demo-alpha') =>
  buildEvidenceBriefs(input, policy, releasePolicy, recipient, now)

describe('selective evidence sharing (synthetic policy, no production authentication)', () => {
  test('an unrelated soon-expiring finding does not shorten another brief', () => {
    const input = snapshot()
    input.observations.push(
      ...input.observations.map((event) => ({
        ...event,
        eventId: event.eventId + '-older',
        destination: 'older.example',
        kind: 'post-update-process-chain' as const,
        updateAtMs: now - policy.windowMs + 1,
        connectionAtMs: now - policy.windowMs + 2,
        childProcessAtMs: now - policy.windowMs + 3,
      }))
    )
    const output = briefs(input, {
      ...disclosurePolicy,
      approvedDomains: [...disclosurePolicy.approvedDomains, 'older.example'],
    })
    expect(output).toHaveLength(2)
    expect(output.find((b) => b.indicator.value === 'older.example')!.expiresAtMs).toBe(now + 1)
    expect(output.find((b) => b.indicator.value !== 'older.example')!.expiresAtMs).toBe(
      now + policy.maxSnapshotAgeMs
    )
  })
  test('shares an approved indicator, software version, pattern, and limitations', () => {
    const result = briefs()
    expect(result).toHaveLength(1)
    expect(result[0]!.indicator.value).toBe('relay.supplier-incident.example')
    expect(result[0]!.supplier).toEqual({ name: 'Demo MaintenanceTool', version: '4.2.1' })
    expect(result[0]!.pattern).toHaveLength(3)
    expect(result[0]!.assessment).toContain('maliciousness-not-established')
    expect(result[0]!.provenance).toContain('authenticity-not-verified')
  })
  test('never forwards contributor identities, event IDs, or exact event timestamps', () => {
    const input = snapshot()
    const output = JSON.stringify(briefs(input))
    for (const member of input.members) {
      expect(output).not.toContain(member.organizationId)
      expect(output).not.toContain(member.collectorIds[0]!)
    }
    for (const event of input.observations) {
      expect(output).not.toContain(event.eventId)
      expect(output).not.toContain(String(event.connectionAtMs))
    }
    expect(output).not.toContain('privateFindings')
    expect(output).not.toContain('organizationCount')
  })
  test('only reports threshold counts, even with additional contributors', () => {
    const input = snapshot()
    input.members.push({
      ...input.members[0]!,
      organizationId: 'fourth-member',
      collectorIds: ['fourth-collector'],
    })
    input.observations.push({
      ...input.observations[0]!,
      organizationId: 'fourth-member',
      collectorId: 'fourth-collector',
    })
    expect(briefs(input)[0]!.corroboration).toEqual({
      organizationsAtLeast: 3,
      sequenceOrganizationsAtLeast: 2,
    })
  })
  test('coarsens the search window while retaining useful expiry', () => {
    const brief = briefs()[0]!
    expect(brief.correlationWindow.startMs % disclosurePolicy.timeBucketMs).toBe(0)
    expect(brief.correlationWindow.endMs % disclosurePolicy.timeBucketMs).toBe(0)
    expect(brief.correlationWindow.startMs).toBeLessThanOrEqual(now - policy.windowMs)
    expect(brief.correlationWindow.endMs).toBeGreaterThanOrEqual(now)
    expect(brief.expiresAtMs).toBeGreaterThan(now)
  })
  test('requires the recipient to be both enrolled and allowed by the release policy', () => {
    expect(() => briefs(snapshot(), disclosurePolicy, 'unknown')).toThrow(
      'Recipient is not eligible'
    )
    expect(() => briefs(snapshot(), { ...disclosurePolicy, recipients: ['demo-bravo'] })).toThrow(
      'Recipient is not eligible'
    )
  })
  test('revoked, expired, and not-yet-active recipients cannot receive evidence', () => {
    const input = snapshot()
    input.members[0]!.active = false
    expect(() => briefs(input)).toThrow('Recipient is not eligible')
    input.members[0]!.active = true
    input.members[0]!.expiresAtMs = now
    expect(() => briefs(input)).toThrow('Recipient is not eligible')
    input.members[0]!.expiresAtMs = now + 1000
    input.members[0]!.validFromMs = now + 1
    expect(() => briefs(input)).toThrow('Recipient is not eligible')
  })
  test('withdrawing evidence-sharing consent removes that member from corroboration', () => {
    const input = snapshot()
    input.members[2]!.shareEvidenceWithConsortium = false
    expect(correlate(input, policy, now).summary.status).toBe('corroborated-pattern')
    expect(briefs(input)).toEqual([])
  })
  test('consent must be explicit in the enrollment snapshot', () => {
    const input = snapshot() as unknown as { members: Array<Record<string, unknown>> }
    delete input.members[0]!.shareEvidenceWithConsortium
    expect(() => buildEvidenceBriefs(input, policy, disclosurePolicy, 'demo-alpha', now)).toThrow()
  })
  test('unapproved indicators, suppliers, and software versions are withheld', () => {
    expect(briefs(snapshot(), { ...disclosurePolicy, approvedDomains: [] })).toEqual([])
    expect(briefs(snapshot(), { ...disclosurePolicy, suppliers: [] })).toEqual([])
    const suppliers = [{ ...disclosurePolicy.suppliers[0]!, approvedVersions: ['9.9.9'] }]
    expect(briefs(snapshot(), { ...disclosurePolicy, suppliers })).toEqual([])
  })
  test('arbitrary source labels cannot masquerade as approved display names', () => {
    const input = snapshot()
    for (const e of input.observations) e.supplierId = 'employee@example.invalid password=secret'
    expect(briefs(input)).toEqual([])
  })
  test('suppressed conflicting reports still cause validation to fail closed', () => {
    const input = snapshot()
    input.observations.push({ ...input.observations[0]!, destination: 'unapproved.internal' })
    expect(() => briefs(input)).toThrow('Conflicting evidence identity')
  })
  test('the ordinary summary still excludes shared member evidence', () => {
    const result = correlate(snapshot(), policy, now)
    expect(JSON.stringify(result.summary)).not.toContain(briefs()[0]!.indicator.value)
  })
  test('uncorroborated scenarios do not release an evidence brief', () => {
    for (const scenario of [
      'duplicate-reports',
      'benign-overlap',
      'expired',
      'revoked-member',
    ] as const) {
      expect(briefs(fixture(scenario, now))).toEqual([])
    }
  })
})
