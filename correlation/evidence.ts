import { z } from 'zod'
import { correlate, normalizeDomain, policySchema, snapshotSchema } from './model'

const id = z.string().min(1).max(128)
const approvedDomain = z.string().refine(value => normalizeDomain(value) !== null, 'Invalid approved domain')
export const disclosurePolicySchema = z.object({
  version: id,
  // Trusted policy configuration, not report-supplied names or destinations.
  recipients: z.array(id).min(1).max(100),
  suppliers: z.array(z.object({
    id, displayName: z.string().min(1).max(100),
    approvedVersions: z.array(z.string().min(1).max(64)).min(1).max(100),
  }).strict()).max(100),
  approvedDomains: z.array(approvedDomain).max(100),
  timeBucketMs: z.number().int().min(900_000).max(3_600_000),
}).strict()
export type DisclosurePolicy = z.infer<typeof disclosurePolicySchema>

export interface EvidenceBrief {
  synthetic: true
  disclosurePolicyVersion: string
  correlationPolicyVersion: string
  supplier: { name: string; version: string }
  indicator: { kind: 'domain'; value: string }
  pattern: readonly ['software-update', 'new-outbound-destination', 'unusual-child-process']
  correlationWindow: { startMs: number; endMs: number; precision: 'coarse-search-window' }
  corroboration: { organizationsAtLeast: number; sequenceOrganizationsAtLeast: number }
  provenance: 'synthetic-fixture-source; authenticity-not-verified'
  assessment: 'investigation-lead; maliciousness-not-established'
  expiresAtMs: number
}

/** Local policy demonstration. Caller identity must come from trusted auth in production. */
export function buildEvidenceBriefs(
  snapshotInput: unknown, correlationPolicyInput: unknown, disclosurePolicyInput: unknown,
  recipientOrganizationId: string, nowMs: number,
): EvidenceBrief[] {
  const snapshot = snapshotSchema.parse(snapshotInput)
  const correlationPolicy = policySchema.parse(correlationPolicyInput)
  const disclosure = disclosurePolicySchema.parse(disclosurePolicyInput)
  const recipient = snapshot.members.find(m => m.organizationId === recipientOrganizationId)
  if (!recipient?.active || nowMs < recipient.validFromMs || nowMs >= recipient.expiresAtMs ||
      !disclosure.recipients.includes(recipientOrganizationId)) {
    throw new Error('Recipient is not eligible for evidence sharing')
  }
  if (new Set(disclosure.suppliers.map(s => s.id)).size !== disclosure.suppliers.length) {
    throw new Error('Disclosure policy contains duplicate supplier identities')
  }
  const domains = new Set(disclosure.approvedDomains.map(d => normalizeDomain(d)!))
  const suppliers = new Map(disclosure.suppliers.map(s => [s.id, s]))
  const sharingMembers = new Set(snapshot.members.filter(m => m.shareEvidenceWithConsortium).map(m => m.organizationId))
  // Recompute corroboration from consented, approved evidence. Suppressed
  // contributors or indicators must not prop up a released brief's threshold.
  const approvedSnapshot = {
    ...snapshot,
    observations: snapshot.observations.filter(event => {
      const supplier = suppliers.get(event.supplierId)
      const domain = normalizeDomain(event.destination)
      return sharingMembers.has(event.organizationId) && supplier &&
        supplier.approvedVersions.includes(event.softwareVersion) && domain && domains.has(domain)
    }),
  }
  // Validate the full snapshot first, so filtering cannot conceal conflicting
  // event identifiers or an invalid enrollment roster.
  correlate(snapshot, correlationPolicy, nowMs)
  const result = correlate(approvedSnapshot, correlationPolicy, nowMs)
  return result.privateFindings.map(finding => ({
    synthetic: true,
    disclosurePolicyVersion: disclosure.version,
    correlationPolicyVersion: correlationPolicy.version,
    supplier: { name: suppliers.get(finding.supplierId)!.displayName, version: finding.softwareVersion },
    indicator: { kind: 'domain', value: finding.destination },
    pattern: ['software-update', 'new-outbound-destination', 'unusual-child-process'],
    // This is a coarse search interval containing the evaluation window,
    // not a claim about exact first/last event times.
    correlationWindow: {
      startMs: Math.floor((nowMs - correlationPolicy.windowMs) / disclosure.timeBucketMs) * disclosure.timeBucketMs,
      endMs: Math.ceil(nowMs / disclosure.timeBucketMs) * disclosure.timeBucketMs,
      precision: 'coarse-search-window',
    },
    corroboration: {
      organizationsAtLeast: correlationPolicy.minimumOrganizations,
      sequenceOrganizationsAtLeast: correlationPolicy.minimumSequenceOrganizations,
    },
    provenance: 'synthetic-fixture-source; authenticity-not-verified',
    assessment: 'investigation-lead; maliciousness-not-established',
    expiresAtMs: Math.min(result.summary.validUntilMs, recipient.expiresAtMs),
  }))
}
