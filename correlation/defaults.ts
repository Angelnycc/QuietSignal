import type { Policy } from './model'
import type { DisclosurePolicy } from './evidence'

export const policy: Policy = {
  version: 'supplier-sequence-v1',
  minimumOrganizations: 3,
  minimumSequenceOrganizations: 2,
  windowMs: 1_800_000,
  maxSequenceSpanMs: 600_000,
  maxSnapshotAgeMs: 60_000,
  alertTtlMs: 300_000,
}
// Explicit operator-approved synthetic release policy. This does not classify
// arbitrary domains as public or grant access to real users.
export const disclosurePolicy: DisclosurePolicy = {
  version: 'synthetic-evidence-sharing-v1',
  recipients: ['demo-alpha', 'demo-bravo', 'demo-charlie'],
  suppliers: [
    {
      id: 'demo-maintenance-vendor',
      displayName: 'Demo MaintenanceTool',
      approvedVersions: ['4.2.1'],
    },
  ],
  approvedDomains: ['relay.supplier-incident.example'],
  timeBucketMs: 900_000,
}
