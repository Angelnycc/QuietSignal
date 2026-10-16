import { correlate } from '../correlation/model'
import { buildEvidenceBriefs } from '../correlation/evidence'
import { policy, disclosurePolicy } from '../correlation/defaults'
import { fixture, type Scenario } from './fixtures'

/** The same approved fictional result powers the HTTP showcase and static export. */
export function scenarioResult(scenario: Scenario, now: number, offline = false) {
  const snapshot = fixture(scenario, now)
  return {
    scenario,
    ...correlate(snapshot, policy, now).summary,
    evidenceBriefs: buildEvidenceBriefs(snapshot, policy, disclosurePolicy, 'demo-alpha', now),
    deliveryMode: offline ? 'offline-synthetic-demo' : 'synthetic-local-demo',
  }
}
