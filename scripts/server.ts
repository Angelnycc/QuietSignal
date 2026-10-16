import { correlate } from '../correlation/model'
import { buildEvidenceBriefs } from '../correlation/evidence'
import { disclosurePolicy } from './disclosure'
import { fixture, policy, scenarios, type Scenario } from './fixtures'

const page = Bun.file(new URL('../web/index.html', import.meta.url))
const server = Bun.serve({ hostname: '127.0.0.1', port: 8787,
  fetch(request) {
    const url = new URL(request.url)
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    if (url.pathname === '/') return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    if (url.pathname === '/health') return Response.json({ status: 'ok', data: 'synthetic-only' })
    if (!['/fixtures/snapshot', '/api/demo', '/api/member-demo'].includes(url.pathname)) return new Response('Not found', { status: 404 })
    const scenario = url.searchParams.get('scenario') ?? 'correlated'
    if (!scenarios.includes(scenario as Scenario)) return new Response('Unknown scenario', { status: 400 })
    const nowMs = Date.now()
    const snapshot = fixture(scenario as Scenario, nowMs)
    // Operator-only mock source, intentionally exposing only synthetic records.
    if (url.pathname === '/fixtures/snapshot') return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
    const summary = correlate(snapshot, policy, nowMs).summary
    if (url.pathname === '/api/demo') return Response.json({ scenario, ...summary }, { headers: { 'Cache-Control': 'no-store' } })
    // Fixed fictional demo participant. No user identity is accepted from a
    // query parameter. This endpoint is NOT authenticated production delivery.
    const evidenceBriefs = buildEvidenceBriefs(snapshot, policy, disclosurePolicy, 'demo-alpha', nowMs)
    return Response.json({ scenario, ...summary, evidenceBriefs, deliveryMode: 'synthetic-local-demo' },
      { headers: { 'Cache-Control': 'no-store' } })
  },
})
console.log(`QuietSignal synthetic fixture service ready on port ${server.port}`)
