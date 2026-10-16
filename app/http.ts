import { policy } from '../correlation/defaults'
import { createHash } from 'node:crypto'
import { correlate } from '../correlation/model'
import { scenarioResult } from '../demo/scenarios'
import { fixture, scenarios, type Scenario } from '../demo/fixtures'
import type { PilotApi } from './api'

export function createLocalServer(state: { api: PilotApi }) {
  const origin = state.api.options.origin
  const port = Number(new URL(origin).port)
  const assets = new Map([
    [
      '/',
      {
        file: new URL('../web/index.html', import.meta.url),
        type: 'text/html; charset=utf-8',
        inline: true,
      },
    ],
    [
      '/app',
      {
        file: new URL('../web/app/index.html', import.meta.url),
        type: 'text/html; charset=utf-8',
        inline: false,
      },
    ],
    [
      '/app/styles.css',
      {
        file: new URL('../web/app/styles.css', import.meta.url),
        type: 'text/css; charset=utf-8',
        inline: false,
      },
    ],
    [
      '/app/app.js',
      {
        file: new URL('../web/app/app.js', import.meta.url),
        type: 'text/javascript; charset=utf-8',
        inline: false,
      },
    ],
  ])
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    development: false,
    maxRequestBodySize: 32_768,
    error() {
      return Response.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'The workspace could not complete this request',
          },
        },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        }
      )
    },
    async fetch(request, server) {
      const url = new URL(request.url)
      if (url.origin !== state.api.options.origin)
        return new Response('Unrecognized local host', { status: 421 })
      let response: Response
      if (url.pathname.startsWith('/api/pilot/')) {
        response = await state.api.fetch(request, server.requestIP(request)?.address ?? 'local')
      } else if (request.method !== 'GET') {
        response = new Response('Method not allowed', { status: 405 })
      } else if (assets.has(url.pathname)) {
        const asset = assets.get(url.pathname)!
        const body = await Bun.file(asset.file).text()
        const hashes = asset.inline
          ? [...body.matchAll(/<(script|style)>([\s\S]*?)<\/\1>/g)].map((match) => ({
              kind: match[1],
              hash: "'sha256-" + createHash('sha256').update(match[2]!).digest('base64') + "'",
            }))
          : []
        const scripts = hashes
          .filter((h) => h.kind === 'script')
          .map((h) => h.hash)
          .join(' ')
        const styles = hashes
          .filter((h) => h.kind === 'style')
          .map((h) => h.hash)
          .join(' ')
        response = new Response(body, {
          headers: {
            'Content-Type': asset.type,
            'Cache-Control': 'no-cache',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self' " +
              scripts +
              "; style-src 'self' " +
              styles +
              "; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          },
        })
      } else if (url.pathname === '/health') {
        response = Response.json({
          status: 'ok',
          mode: 'controlled-local-pilot',
          syntheticSourcesOnly: true,
        })
      } else if (['/fixtures/snapshot', '/api/demo', '/api/member-demo'].includes(url.pathname)) {
        const scenario = url.searchParams.get('scenario') ?? 'correlated'
        if (!scenarios.includes(scenario as Scenario))
          return new Response('Unknown scenario', { status: 400 })
        const now = Date.now()
        const snapshot = fixture(scenario as Scenario, now)
        const output =
          url.pathname === '/fixtures/snapshot'
            ? snapshot
            : url.pathname === '/api/demo'
              ? { scenario, ...correlate(snapshot, policy, now).summary }
              : scenarioResult(scenario as Scenario, now)
        response = Response.json(output, { headers: { 'Cache-Control': 'no-store' } })
      } else response = new Response('Not found', { status: 404 })
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('Referrer-Policy', 'no-referrer')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
      response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      return response
    },
  })
}
