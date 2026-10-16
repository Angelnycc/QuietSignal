import { correlate } from '../correlation/model'
import { fixture, policy, scenarios } from './fixtures'

// Source-level business-logic demo; not a native CRE simulation.
const nowMs = Date.now()
console.log('QuietSignal — synthetic local demo; no deployed TEE or ZK proof')
for (const scenario of scenarios) {
  console.log(JSON.stringify({ scenario, ...correlate(fixture(scenario, nowMs), policy, nowMs).summary }))
}
