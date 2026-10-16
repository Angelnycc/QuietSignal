import { policy } from '../correlation/defaults'
import { correlate } from '../correlation/model'
import { fixture, scenarios } from '../demo/fixtures'

// Source-level business-logic demo; not a native CRE simulation.
const nowMs = Date.now()
console.log('QuietSignal — synthetic local demo; no deployed TEE or ZK proof')
for (const scenario of scenarios) {
  console.log(
    JSON.stringify({ scenario, ...correlate(fixture(scenario, nowMs), policy, nowMs).summary })
  )
}
