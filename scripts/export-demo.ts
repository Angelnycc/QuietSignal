import { correlate } from '../correlation/model'
import { buildEvidenceBriefs } from '../correlation/evidence'
import { fixture, policy, scenarios } from './fixtures'
import { disclosurePolicy } from './disclosure'

// Export only approved fictional output, never the fixture roster or raw events.
const nowMs = Date.now()
const outputs = Object.fromEntries(scenarios.map(scenario => {
  const snapshot = fixture(scenario, nowMs)
  return [scenario, {
    scenario, ...correlate(snapshot, policy, nowMs).summary,
    evidenceBriefs: buildEvidenceBriefs(snapshot, policy, disclosurePolicy, 'demo-alpha', nowMs),
    deliveryMode: 'offline-synthetic-demo',
  }]
}))
const template = await Bun.file(new URL('../web/index.html', import.meta.url)).text()
const original = "fetch('/api/member-demo?scenario='+encodeURIComponent(scenario))"
if (template.split(original).length !== 2 || template.split('<script>').length !== 2) {
  throw new Error('Dashboard changed; review the offline export before releasing it')
}
const data = JSON.stringify(outputs).replace(/</g, '\\u003c')
const helper = `const offlineScenarios=${data};\nasync function loadDemoScenario(scenario){return {ok:Object.hasOwn(offlineScenarios,scenario),json:async()=>offlineScenarios[scenario]};}\n`
const document = template.replace('<script>', '<script>\n' + helper)
  .replace('href="/app" data-pilot-link>Open workspace', 'href="#architecture" data-pilot-link>Local pilot status')
  .replace(original, 'loadDemoScenario(scenario)')
  .replace('Synthetic local demonstration.', 'Offline synthetic demonstration. Evidence times are fixed samples; no live monitoring or requests are performed.')
const output = process.argv[2] ?? 'dist/quietsignal-demo.html'
await Bun.write(output, document)
console.log(`Exported five fictional scenarios to ${output}`)
