import { afterEach, describe, expect, test } from 'bun:test'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { PilotApi, type PilotOptions, type SeedCollector } from '../app/api'
import { PilotStore } from '../app/store'
import { digest, randomToken, signObservation } from '../app/security'
import { fixture, scenarios } from '../scripts/fixtures'
import { disclosurePolicy } from '../scripts/disclosure'
import { createLocalServer } from '../app/http'

const origin = 'http://127.0.0.1:9876'
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
export function testSeeds(): SeedCollector[] {
  return ['alpha', 'bravo', 'charlie'].map((name) => {
    const pair = generateKeyPairSync('ed25519')
    return {
      id: 'collector-' + name,
      organizationId: 'demo-' + name,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    }
  })
}
function setup(extra: Partial<PilotOptions> = {}, path = ':memory:') {
  const clock = { now: 1_800_000_000_000 }
  const token = randomToken()
  const seeds = testSeeds()
  const store = new PilotStore(path)
  const options = { origin, bootstrapToken: token, seeds, now: () => clock.now, ...extra }
  const api = new PilotApi(store, options)
  cleanups.push(() => store.close())
  type Session = { cookie: string; csrf: string }
  const request = (
    path: string,
    method = 'GET',
    value?: unknown,
    session?: Session,
    custom?: HeadersInit
  ) => {
    const headers = new Headers({
      Origin: origin,
      ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
    })
    if (session) {
      headers.set('Cookie', session.cookie)
      headers.set('X-QS-CSRF', session.csrf)
    }
    new Headers(custom).forEach((value, key) => headers.set(key, value))
    return api.fetch(
      new Request(origin + '/api/pilot' + path, {
        method,
        headers,
        body: value === undefined ? undefined : JSON.stringify(value),
      })
    )
  }
  const login = async (accessToken = token): Promise<Session> => {
    const response = await request('/login', 'POST', { accessToken })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { csrf: string }
    return { cookie: response.headers.get('Set-Cookie')!.split(';')[0]!, csrf: body.csrf }
  }
  const participant = async (owner: Session, id = 'demo-alpha') => {
    const response = await request('/members/' + id + '/access', 'POST', {}, owner)
    expect(response.status).toBe(201)
    const credential = (await response.json()) as { accessToken: string }
    return { session: await login(credential.accessToken), token: credential.accessToken }
  }
  const run = async (owner: Session, scenario = 'correlated') => {
    const response = await request(
      '/simulate',
      'POST',
      { scenario, resetTestMembership: true },
      owner
    )
    expect(response.status).toBe(200)
    return response.json() as Promise<{ runId: string; accepted: number; rejected: number }>
  }
  const emptyRun = () => {
    const id = randomUUID()
    store.db.query('INSERT INTO runs VALUES (?,?,?)').run(id, 'test', clock.now)
    store.setMeta('active_run', id)
    return id
  }
  const envelope = (runId: string) => ({
    schemaVersion: 'quietsignal-pilot/v1',
    synthetic: true,
    runId,
    observation: { ...fixture('correlated', clock.now).observations[0]!, eventId: randomUUID() },
  })
  const signed = (value: unknown, key = seeds[0]!, context = {}) => {
    const body = JSON.stringify(value)
    const headers = signObservation(
      {
        workspaceId: store.workspaceId,
        collectorId: key.id,
        timestamp: String(clock.now),
        nonce: randomToken(),
        ...context,
      },
      body,
      key.privateKey
    )
    return { body, headers }
  }
  const submit = (input: { body: string; headers: Headers }) =>
    api.fetch(new Request(origin + '/api/pilot/observations', { method: 'POST', ...input }))
  const incidents = async (session: Session) => {
    const response = await request('/incidents', 'GET', undefined, session)
    expect(response.status).toBe(200)
    return (
      (await response.json()) as {
        incidents: Array<{ id: string; reviewStatus: string; brief: unknown }>
      }
    ).incidents
  }
  return {
    api,
    store,
    token,
    seeds,
    clock,
    options,
    request,
    login,
    participant,
    run,
    emptyRun,
    envelope,
    signed,
    submit,
    incidents,
  }
}

describe('controlled pilot authentication and admission', () => {
  test('rolls back evidence and nonce admission if the audit append fails', async () => {
    const f = setup()
    const signed = f.signed(f.envelope(f.emptyRun()))
    const original = f.store.audit.bind(f.store)
    f.store.audit = (...args) => {
      if (args[1] === 'observation_accepted') throw new Error('private internal failure')
      return original(...args)
    }
    const response = await f.submit(signed)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private internal failure')
    expect(
      (f.store.db.query('SELECT COUNT(*) AS n FROM observations').get() as { n: number }).n
    ).toBe(0)
    expect((f.store.db.query('SELECT COUNT(*) AS n FROM nonces').get() as { n: number }).n).toBe(0)
    f.store.audit = original
    expect((await f.submit(signed)).status).toBe(200)
  })
  test('does not interleave two concurrent controlled runs', async () => {
    const f = setup()
    const owner = await f.login()
    const responses = await Promise.all([
      f.request('/simulate', 'POST', { scenario: 'correlated', resetTestMembership: true }, owner),
      f.request('/simulate', 'POST', { scenario: 'correlated', resetTestMembership: true }, owner),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await f.incidents(owner)).length).toBe(1)
  })
  test('rejects anonymous access and foreign hosts; local login sets protected cookie and stores hashes', async () => {
    const f = setup()
    expect((await f.request('/incidents')).status).toBe(401)
    expect(
      (await f.api.fetch(new Request('http://foreign.example/api/pilot/session'))).status
    ).toBe(421)
    expect((await f.request('/login', 'POST', { accessToken: randomToken() })).status).toBe(401)
    const response = await f.request('/login', 'POST', { accessToken: f.token })
    expect(response.headers.get('Set-Cookie')).toContain(
      'HttpOnly; SameSite=Strict; Path=/api/pilot'
    )
    const row = f.store.db.query('SELECT token_hash FROM access_keys WHERE id=?').get('owner') as {
      token_hash: string
    }
    expect(row.token_hash).toBe(digest(f.token))
    expect(JSON.stringify(f.store.db.query('SELECT * FROM audit').all())).not.toContain(f.token)
  })
  test('requires exact origin, CSRF, role, and rejects credential role injection', async () => {
    const f = setup()
    const owner = await f.login()
    const member = await f.participant(owner)
    expect(
      (await f.request('/simulate', 'POST', {}, owner, { Origin: 'https://attacker.example' }))
        .status
    ).toBe(403)
    expect((await f.request('/simulate', 'POST', {}, owner, { 'X-QS-CSRF': 'wrong' })).status).toBe(
      403
    )
    expect((await f.request('/policy', 'GET', undefined, member.session)).status).toBe(403)
    expect((await f.request('/members/demo-bravo/access', 'POST', {}, member.session)).status).toBe(
      403
    )
    expect(
      (await f.request('/login', 'POST', { accessToken: member.token, role: 'operator' })).status
    ).toBe(400)
  })
  test('rejects expired sessions and logs out permanently', async () => {
    const f = setup()
    const owner = await f.login()
    expect((await f.request('/logout', 'POST', {}, owner)).status).toBe(200)
    expect((await f.request('/incidents', 'GET', undefined, owner)).status).toBe(401)
    const next = await f.login()
    f.clock.now += 8 * 3_600_000 + 1
    expect((await f.request('/incidents', 'GET', undefined, next)).status).toBe(401)
  })
  test('accepts a genuine signed event, rejects exact replay and permits idempotent retry with fresh nonce', async () => {
    const f = setup()
    const value = f.envelope(f.emptyRun())
    const signed = f.signed(value)
    expect((await f.submit(signed)).status).toBe(200)
    expect((await f.submit(signed)).status).toBe(409)
    expect(await (await f.submit(f.signed(value))).json()).toEqual({ status: 'duplicate' })
    value.observation.destination = 'changed.example'
    expect((await f.submit(f.signed(value))).status).toBe(409)
    expect(
      (f.store.db.query('SELECT COUNT(*) AS n FROM observations').get() as { n: number }).n
    ).toBe(1)
  })
  test('rejects modified signed bytes, wrong key, workspace, collector, and old/future signing timestamps', async () => {
    const f = setup()
    const value = f.envelope(f.emptyRun())
    const valid = f.signed(value)
    expect((await f.submit({ ...valid, body: valid.body + ' ' })).status).toBe(401)
    expect((await f.submit(f.signed(value, f.seeds[1]))).status).toBe(403)
    for (const context of [
      { workspaceId: randomUUID() },
      { collectorId: 'unknown' },
      { timestamp: String(f.clock.now - 120_001) },
      { timestamp: String(f.clock.now + 120_001) },
    ]) {
      expect((await f.submit(f.signed(value, f.seeds[0], context))).status).toBe(401)
    }
    const wrongKey = f.signed(value, { ...f.seeds[1]!, id: f.seeds[0]!.id })
    expect((await f.submit(wrongKey)).status).toBe(401)
  })
  test('rejects cross-organization claims, revoked collectors, inactive runs and fabricated non-synthetic schema', async () => {
    const f = setup()
    const value = f.envelope(f.emptyRun())
    value.observation.organizationId = 'demo-bravo'
    expect((await f.submit(f.signed(value))).status).toBe(403)
    value.observation.organizationId = 'demo-alpha'
    expect((await f.submit(f.signed({ ...value, synthetic: false }))).status).toBe(400)
    expect((await f.submit(f.signed({ ...value, secretLog: 'not-allowed' }))).status).toBe(400)
    expect((await f.submit(f.signed({ ...value, runId: randomUUID() }))).status).toBe(409)
    f.store.db.query('UPDATE collectors SET active=0 WHERE id=?').run('collector-alpha')
    expect((await f.submit(f.signed(value))).status).toBe(401)
  })
  test('rejects stale, future, out-of-order, and overlong source sequences', async () => {
    const f = setup()
    const run = f.emptyRun()
    for (const change of [
      { connectionAtMs: f.clock.now + 1 },
      { updateAtMs: f.clock.now - 1_800_000 },
      { updateAtMs: f.clock.now - 30_000 },
      { updateAtMs: f.clock.now - 800_000 },
    ]) {
      const value = f.envelope(run)
      Object.assign(value.observation, change)
      expect((await f.submit(f.signed(value))).status).toBe(422)
    }
  })
  test('enforces bounded JSON bodies and does not echo rejected sensitive fields', async () => {
    const f = setup()
    const value = f.envelope(f.emptyRun())
    const response = await f.submit(f.signed({ ...value, password: 'DO-NOT-ECHO-THIS' }))
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('DO-NOT-ECHO-THIS')
    expect(JSON.stringify(f.store.db.query('SELECT * FROM audit').all())).not.toContain(
      'DO-NOT-ECHO-THIS'
    )
    const large = f.signed({ ...value, extra: 'x'.repeat(20_000) })
    expect((await f.submit(large)).status).toBe(413)
    large.headers.set('Content-Type', 'text/plain')
    expect((await f.submit(large)).status).toBe(415)
  })
  test('enforces collector rate and per-run evidence capacity', async () => {
    const limited = setup({ collectorRateLimit: 1 })
    const run = limited.emptyRun()
    expect((await limited.submit(limited.signed(limited.envelope(run)))).status).toBe(200)
    expect((await limited.submit(limited.signed(limited.envelope(run)))).status).toBe(429)
    const bounded = setup({ capacity: 1 })
    const otherRun = bounded.emptyRun()
    expect((await bounded.submit(bounded.signed(bounded.envelope(otherRun)))).status).toBe(200)
    expect((await bounded.submit(bounded.signed(bounded.envelope(otherRun)))).status).toBe(503)
  })
  test('fails closed when collector is revoked while reading a streaming body', async () => {
    const f = setup()
    const input = f.signed(f.envelope(f.emptyRun()))
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input.body.slice(0, 10)))
        queueMicrotask(() => {
          f.store.db.query('UPDATE collectors SET active=0 WHERE id=?').run('collector-alpha')
          controller.enqueue(new TextEncoder().encode(input.body.slice(10)))
          controller.close()
        })
      },
    })
    expect(
      (
        await f.api.fetch(
          new Request(origin + '/api/pilot/observations', {
            method: 'POST',
            headers: input.headers,
            body: stream,
          })
        )
      ).status
    ).toBe(401)
  })
})

describe('recipient policy, durable incidents, and disclosure', () => {
  test('independent collector CLI registers a public key and submits signed evidence over actual HTTP', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'quietsignal-cli-'))
    cleanups.push(() => rmSync(folder, { recursive: true, force: true }))
    const f = setup({ now: Date.now })
    const owner = await f.login()
    const run = await f.run(owner)
    const keyFile = join(folder, 'collector.json')
    const eventFile = join(folder, 'event.json')
    const generated = Bun.spawn(
      [
        process.execPath,
        'run',
        'scripts/collector.ts',
        'generate',
        'collector-external',
        'demo-alpha',
        keyFile,
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    expect(await generated.exited).toBe(0)
    const material = (await Bun.file(keyFile).json()) as { publicKey: string; privateKey: string }
    expect(await new Response(generated.stdout).text()).not.toContain(material.privateKey)
    expect(
      (
        await f.request(
          '/collectors',
          'POST',
          { id: 'collector-external', organizationId: 'demo-alpha', publicKey: material.publicKey },
          owner
        )
      ).status
    ).toBe(201)
    f.options.origin = 'http://127.0.0.1:0'
    const server = createLocalServer({ api: f.api })
    cleanups.push(() => server.stop(true))
    f.options.origin = 'http://127.0.0.1:' + server.port
    await Bun.write(
      eventFile,
      JSON.stringify({
        ...fixture('correlated', Date.now()).observations[0],
        eventId: randomUUID(),
        collectorId: 'collector-external',
      })
    )
    const submitted = Bun.spawn(
      [
        process.execPath,
        'run',
        'scripts/collector.ts',
        'submit',
        f.options.origin,
        f.store.workspaceId,
        run.runId,
        keyFile,
        eventFile,
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    expect(await submitted.exited).toBe(0)
    expect(JSON.parse(await new Response(submitted.stdout).text())).toEqual({
      httpStatus: 200,
      status: 'accepted',
    })
    expect(f.store.auditIntegrity().valid).toBe(true)
  })
  test.each(scenarios)(
    'signed controlled scenario %s follows threshold rules',
    async (scenario) => {
      const f = setup()
      const owner = await f.login()
      const result = await f.run(owner, scenario)
      expect((await f.incidents(owner)).length).toBe(scenario === 'correlated' ? 1 : 0)
      if (scenario === 'expired') expect(result.rejected).toBe(3)
      if (scenario === 'revoked-member') {
        expect(result.accepted).toBe(2)
        expect(result.rejected).toBe(1)
      }
      expect(f.store.auditIntegrity().valid).toBe(true)
    }
  )
  test('does not distribute identities or source events; acknowledgement belongs to each principal', async () => {
    const f = setup()
    const owner = await f.login()
    const { session } = await f.participant(owner)
    await f.run(owner)
    const incident = (await f.incidents(session))[0]!
    const text = JSON.stringify(incident)
    for (const excluded of [
      'demo-alpha',
      'demo-bravo',
      'collector-alpha',
      'eventId',
      'organizationId',
      'updateAtMs',
      'payload_hash',
    ])
      expect(text).not.toContain(excluded)
    expect(
      (await f.request('/incidents/' + incident.id + '/acknowledge', 'POST', {}, session)).status
    ).toBe(200)
    expect((await f.incidents(session))[0]!.reviewStatus).toBe('acknowledged')
    expect((await f.incidents(owner))[0]!.reviewStatus).toBe('new')
    const download = await f.request(
      '/incidents/' + incident.id + '/download',
      'GET',
      undefined,
      session
    )
    expect(download.status).toBe(200)
    expect(download.headers.get('Content-Disposition')).toContain('attachment')
    expect(JSON.stringify(await download.json())).not.toContain('collector-alpha')
  })
  test('rechecks consent for list, detail, acknowledgement and downloads, then restores eligible evidence', async () => {
    const f = setup()
    const owner = await f.login()
    const { session } = await f.participant(owner)
    const charlie = await f.participant(owner, 'demo-charlie')
    await f.run(owner)
    const incident = (await f.incidents(session))[0]!
    expect(
      (await f.request('/consent', 'POST', { shareEvidence: false }, charlie.session)).status
    ).toBe(200)
    expect(await f.incidents(session)).toEqual([])
    for (const suffix of ['', '/download'])
      expect(
        (await f.request('/incidents/' + incident.id + suffix, 'GET', undefined, session)).status
      ).toBe(404)
    expect(
      (await f.request('/incidents/' + incident.id + '/acknowledge', 'POST', {}, session)).status
    ).toBe(404)
    await f.request('/consent', 'POST', { shareEvidence: true }, charlie.session)
    expect((await f.incidents(session))[0]!.id).toBe(incident.id)
  })
  test('recipient removal blocks access without removing other eligible recipients', async () => {
    const f = setup()
    const owner = await f.login()
    const member = await f.participant(owner)
    await f.run(owner)
    const id = (await f.incidents(member.session))[0]!.id
    expect(
      (
        await f.request(
          '/policy',
          'PUT',
          { ...disclosurePolicy, recipients: ['demo-bravo'] },
          owner
        )
      ).status
    ).toBe(200)
    expect(await f.incidents(member.session)).toEqual([])
    expect((await f.incidents(owner)).length).toBe(1)
    expect((await f.request('/incidents/' + id, 'GET', undefined, member.session)).status).toBe(404)
  })
  test('domain allowlist changes, evidence expiry and collector revocation remove stale delivery', async () => {
    const f = setup()
    const owner = await f.login()
    await f.run(owner)
    await f.request('/collectors/collector-charlie', 'PATCH', { active: false }, owner)
    expect(await f.incidents(owner)).toEqual([])
    await f.request('/collectors/collector-charlie', 'PATCH', { active: true }, owner)
    expect((await f.incidents(owner)).length).toBe(1)
    await f.request(
      '/policy',
      'PUT',
      { ...disclosurePolicy, approvedDomains: ['different.example'] },
      owner
    )
    expect(await f.incidents(owner)).toEqual([])
    await f.request('/policy', 'PUT', disclosurePolicy, owner)
    f.clock.now += 1_800_001
    expect(await f.incidents(owner)).toEqual([])
  })
  test('recipient with no collectors can receive but cannot contribute; new enrollment defaults to no sharing', async () => {
    const f = setup()
    const owner = await f.login()
    await f.run(owner)
    expect(
      (await f.request('/members', 'POST', { id: 'demo-delta', name: 'Test delta' }, owner)).status
    ).toBe(201)
    expect(f.store.member('demo-delta')!.sharing).toBe(0)
    await f.request('/policy', 'PUT', { ...disclosurePolicy, recipients: ['demo-delta'] }, owner)
    const delta = await f.participant(owner, 'demo-delta')
    expect((await f.incidents(delta.session)).length).toBe(1)
  })
  test('member and access-key revocations invalidate existing sessions, and explicit key revocation survives member restoration', async () => {
    const f = setup()
    const owner = await f.login()
    const member = await f.participant(owner)
    await f.request('/members/demo-alpha', 'PATCH', { active: false }, owner)
    expect((await f.request('/incidents', 'GET', undefined, member.session)).status).toBe(401)
    await f.request('/members/demo-alpha', 'PATCH', { active: true }, owner)
    const fresh = await f.login(member.token)
    await f.request('/members/demo-alpha/revoke-access', 'POST', {}, owner)
    expect((await f.request('/incidents', 'GET', undefined, fresh)).status).toBe(401)
    expect((await f.request('/login', 'POST', { accessToken: member.token })).status).toBe(401)
  })
  test('participant audit contains only their own actions and exposes no global sequence numbers', async () => {
    const f = setup()
    const owner = await f.login()
    const member = await f.participant(owner)
    await f.run(owner)
    const response = await f.request('/audit', 'GET', undefined, member.session)
    const result = (await response.json()) as {
      events: unknown[]
      integrity: { eventCount: number }
    }
    expect(result.integrity.eventCount).toBe(result.events.length)
    for (const event of result.events) expect(event).not.toHaveProperty('id')
    expect(JSON.stringify(result)).not.toContain('demo-bravo')
    expect(JSON.stringify(result)).not.toContain('collector-')
  })
  test('rejects private keys and reused collector keys; invalid disclosure references fail closed', async () => {
    const f = setup()
    const owner = await f.login()
    expect(
      (
        await f.request(
          '/collectors',
          'POST',
          { id: 'new-test', organizationId: 'demo-alpha', publicKey: 'not-a-public-key'.repeat(4) },
          owner
        )
      ).status
    ).toBe(400)
    expect(
      (
        await f.request(
          '/collectors',
          'POST',
          { id: 'new-test', organizationId: 'demo-alpha', publicKey: f.seeds[0]!.publicKey },
          owner
        )
      ).status
    ).toBe(409)
    expect(
      (
        await f.request(
          '/policy',
          'PUT',
          { ...disclosurePolicy, recipients: ['unregistered'] },
          owner
        )
      ).status
    ).toBe(400)
  })
  test('restart preserves evidence, opaque incident IDs, audit chain and nonce replay rejection', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'quietsignal-test-'))
    cleanups.push(() => rmSync(folder, { recursive: true, force: true }))
    const path = join(folder, 'pilot.sqlite')
    const f = setup({}, path)
    const owner = await f.login()
    const run = await f.run(owner)
    const incident = (await f.incidents(owner))[0]!
    const signed = f.signed(f.envelope(run.runId))
    expect((await f.submit(signed)).status).toBe(200)
    f.store.close()
    cleanups.pop()
    const reopened = new PilotStore(path)
    cleanups.push(() => reopened.close())
    const api = new PilotApi(reopened, f.options)
    expect(reopened.workspaceId).toBe(f.store.workspaceId)
    const response = await api.fetch(
      new Request(origin + '/api/pilot/incidents', { headers: { Cookie: owner.cookie } })
    )
    const result = (await response.json()) as { incidents: Array<{ id: string }> }
    expect(result.incidents[0]!.id).toBe(incident.id)
    expect(
      (
        await api.fetch(
          new Request(origin + '/api/pilot/observations', { method: 'POST', ...signed })
        )
      ).status
    ).toBe(409)
    expect(reopened.auditIntegrity().valid).toBe(true)
  })
  test('detects local audit tampering on reopening and rejects unsupported database versions', () => {
    const folder = mkdtempSync(join(tmpdir(), 'quietsignal-tamper-'))
    cleanups.push(() => rmSync(folder, { recursive: true, force: true }))
    const path = join(folder, 'pilot.sqlite')
    const store = new PilotStore(path)
    store.audit('system', 'test', '', {}, 1_800_000_000_000)
    store.close()
    const raw = new Database(path)
    raw.query('UPDATE audit SET action=? WHERE id=1').run('rewritten')
    raw.close()
    expect(() => new PilotStore(path)).toThrow('Audit chain validation failed')
    const futurePath = join(folder, 'future.sqlite')
    const future = new Database(futurePath)
    future.exec('PRAGMA user_version=99')
    future.close()
    expect(() => new PilotStore(futurePath)).toThrow('newer')
  })
})
