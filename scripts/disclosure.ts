import type { DisclosurePolicy } from '../correlation/evidence'

// Explicit operator-approved synthetic release policy. This does not classify
// arbitrary domains as public or grant access to real users.
export const disclosurePolicy: DisclosurePolicy = {
  version: 'synthetic-evidence-sharing-v1',
  recipients: ['demo-alpha', 'demo-bravo', 'demo-charlie'],
  suppliers: [{ id: 'demo-maintenance-vendor', displayName: 'Demo MaintenanceTool', approvedVersions: ['4.2.1'] }],
  approvedDomains: ['relay.supplier-incident.example'],
  timeBucketMs: 900_000,
}
