import { randomUUID, type KeyObject } from 'node:crypto'
import { z, ZodError } from 'zod'
import { correlate, observationSchema, type Observation } from '../correlation/model'
import {
  buildEvidenceBriefs,
  disclosurePolicySchema,
  type EvidenceBrief,
} from '../correlation/evidence'
import { policy } from '../scripts/fixtures'
import { fixture, scenarios, type Scenario } from '../scripts/fixtures'
import { disclosurePolicy as defaultDisclosure } from '../scripts/disclosure'
import {
  canonical,
  constantTimeToken,
  digest,
  publicKey,
  randomToken,
  RateLimiter,
  signObservation,
  verifyObservation,
} from './security'
import { PilotStore, type Role, type SessionRow, type IncidentRow } from './store'

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const boolean = z.boolean()
const envelopeSchema = z
  .object({
    schemaVersion: z.literal('quietsignal-pilot/v1'),
    synthetic: z.literal(true),
    runId: z.string().uuid(),
    observation: observationSchema,
  })
  .strict()
export interface SeedCollector {
  id: string
  organizationId: string
  publicKey: string
  privateKey: KeyObject | string
}
export interface PilotOptions {
  origin: string
  bootstrapToken: string
  seeds: SeedCollector[]
  now?: () => number
  collectorRateLimit?: number
  capacity?: number
}
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message)
}
const actor = (session: SessionRow) =>
  session.role === 'operator' ? 'operator' : 'member:' + session.organization_id

export class PilotApi {
  readonly limiter = new RateLimiter()
  private readonly now: () => number
  private simulationActive = false
  constructor(
    readonly store: PilotStore,
    readonly options: PilotOptions
  ) {
    this.now = options.now ?? Date.now
    if (options.bootstrapToken.length < 32)
      throw new Error('A generated local access token is required')
    if (
      store.meta('owner_hash') &&
      !constantTimeToken(options.bootstrapToken, store.meta('owner_hash')!)
    ) {
      throw new Error('Local operator access file does not match this database')
    }
    store.db.transaction(() => {
      if (!store.meta('owner_hash')) {
        store.setMeta('owner_hash', digest(options.bootstrapToken))
        store.db
          .query('INSERT INTO access_keys VALUES (?,?,?,?,?,?)')
          .run(
            'owner',
            digest(options.bootstrapToken),
            'operator',
            null,
            1,
            Number.MAX_SAFE_INTEGER
          )
        store.audit(
          'system',
          'workspace_initialized',
          store.workspaceId,
          { mode: 'controlled-local-pilot' },
          this.now()
        )
      }
      if (!store.members().length) {
        for (const seed of options.seeds) {
          publicKey(seed.publicKey)
          store.db
            .query('INSERT OR IGNORE INTO organizations VALUES (?,?,?,?,?,?)')
            .run(
              seed.organizationId,
              seed.organizationId.replace('demo-', 'Test organization '),
              1,
              1,
              this.now() - 86_400_000,
              this.now() + 30 * 86_400_000
            )
          store.db
            .query('INSERT INTO collectors VALUES (?,?,?,?,?)')
            .run(seed.id, seed.organizationId, seed.publicKey, 1, this.now())
        }
        store.audit(
          'system',
          'test_consortium_registered',
          store.workspaceId,
          { organizations: store.members().length },
          this.now()
        )
      }
      if (!store.meta('disclosure')) store.setMeta('disclosure', canonical(defaultDisclosure))
    })()
  }
  private disclosure() {
    return disclosurePolicySchema.parse(JSON.parse(this.store.meta('disclosure')!))
  }
  private cookie(request: Request): string | null {
    const value = request.headers
      .get('Cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('qs_pilot='))
      ?.slice(9)
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null
  }
  private session(request: Request): SessionRow | null {
    const token = this.cookie(request)
    if (!token) return null
    const session = this.store.db
      .query(
        'SELECT s.id_hash,s.csrf,s.key_id,k.role,k.organization_id,MIN(s.expires_at,k.expires_at) AS expires_at FROM sessions s JOIN access_keys k ON k.id=s.key_id WHERE s.id_hash=? AND k.active=1 AND s.expires_at>? AND k.expires_at>?'
      )
      .get(digest(token), this.now(), this.now()) as SessionRow | null
    if (!session) return null
    if (session.role === 'participant') {
      const member = this.store.member(session.organization_id!)
      if (!member?.active || member.valid_from > this.now() || member.expires_at <= this.now())
        return null
    }
    return session
  }
  private requireSession(request: Request): SessionRow {
    return (
      this.session(request) ?? fail(401, 'AUTH_REQUIRED', 'Sign in with a valid local access file')
    )
  }
  private operator(session: SessionRow) {
    if (session.role !== 'operator')
      fail(403, 'OPERATOR_REQUIRED', 'This action requires workspace operator access')
  }
  private checkMutation(request: Request, session?: SessionRow) {
    if (
      request.headers.get('Origin') !== this.options.origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site'
    ) {
      fail(403, 'ORIGIN_REJECTED', 'This request must originate from the local workspace')
    }
    if (session && request.headers.get('X-QS-CSRF') !== session.csrf)
      fail(403, 'CSRF_REJECTED', 'Refresh your workspace session and retry')
  }
  private async body(request: Request, maximum = 16_384): Promise<string> {
    if (
      request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    ) {
      fail(415, 'JSON_REQUIRED', 'Use application/json')
    }
    const length = Number(request.headers.get('Content-Length') ?? 0)
    if (!Number.isFinite(length) || length > maximum)
      fail(413, 'BODY_TOO_LARGE', 'Request body exceeds the allowed size')
    const reader = request.body?.getReader()
    if (!reader) fail(400, 'BODY_REQUIRED', 'A JSON request body is required')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maximum) {
        await reader.cancel()
        fail(413, 'BODY_TOO_LARGE', 'Request body exceeds the allowed size')
      }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    const path = new URL(request.url).pathname
    if (path !== '/api/pilot/login' && path !== '/api/pilot/observations')
      this.requireSession(request)
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return fail(400, 'INVALID_JSON', 'Request body is not valid UTF-8 JSON')
    }
  }
  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return fail(400, 'INVALID_JSON', 'Request body is not valid JSON')
    }
  }
  private setCookie(token: string, maxAge: number) {
    return (
      'qs_pilot=' +
      token +
      '; HttpOnly; SameSite=Strict; Path=/api/pilot; Max-Age=' +
      maxAge +
      (this.options.origin.startsWith('https:') ? '; Secure' : '')
    )
  }
  private refresh() {
    const run = this.store.meta('active_run')
    if (!run) return
    const result = correlate(this.store.snapshot(this.now()), policy, this.now())
    for (const finding of result.privateFindings) {
      this.store.incident(
        run,
        [finding.supplierId, finding.softwareVersion, finding.destination],
        this.now()
      )
    }
  }
  private visible(session: SessionRow) {
    const disclosure = this.disclosure()
    const snapshot = this.store.snapshot(this.now())
    const recipients =
      session.role === 'participant' ? [session.organization_id!] : disclosure.recipients
    let briefs: EvidenceBrief[] = []
    for (const recipient of recipients) {
      const member = snapshot.members.find((m) => m.organizationId === recipient)
      if (
        !member?.active ||
        member.validFromMs > this.now() ||
        member.expiresAtMs <= this.now() ||
        !disclosure.recipients.includes(recipient)
      )
        continue
      briefs = buildEvidenceBriefs(snapshot, policy, disclosure, recipient, this.now())
      // Operator gets an explicitly labeled preview of currently releasable
      // evidence, not a bypass of disclosure rules or a raw event feed.
      if (session.role === 'operator') break
    }
    const run = this.store.meta('active_run') ?? ''
    return briefs.flatMap((brief) => {
      const suppliers = disclosure.suppliers.filter(
        (s) =>
          s.displayName === brief.supplier.name &&
          s.approvedVersions.includes(brief.supplier.version)
      )
      if (suppliers.length !== 1) return []
      const fingerprint = digest(
        canonical([run, suppliers[0]!.id, brief.supplier.version, brief.indicator.value])
      )
      const incident = this.store.db
        .query('SELECT * FROM incidents WHERE fingerprint=?')
        .get(fingerprint) as IncidentRow | null
      if (!incident) return []
      const review = this.store.db
        .query('SELECT reviewed_at FROM reviews WHERE incident_id=? AND principal=?')
        .get(incident.id, actor(session)) as { reviewed_at: number } | null
      return [
        {
          id: incident.id,
          firstRecognizedAtMs: incident.first_seen,
          reviewStatus: review ? 'acknowledged' : 'new',
          collectorVerification:
            'Ed25519 registered-key signatures checked on admission; event truth is not established',
          reviewedAtMs: review?.reviewed_at ?? null,
          operatorPreview: session.role === 'operator',
          brief,
        },
      ]
    })
  }
  private async ingest(request: Request, clientIp: string) {
    if (!this.limiter.take('ingest-ip:' + clientIp, 600, this.now()))
      fail(429, 'RATE_LIMITED', 'Ingestion rate limit reached')
    const context = {
      workspaceId: request.headers.get('X-QS-Workspace') ?? '',
      collectorId: request.headers.get('X-QS-Collector') ?? '',
      timestamp: request.headers.get('X-QS-Timestamp') ?? '',
      nonce: request.headers.get('X-QS-Nonce') ?? '',
    }
    const collector = this.store.collector(context.collectorId)
    if (
      !collector?.active ||
      context.workspaceId !== this.store.workspaceId ||
      !/^\d{13}$/.test(context.timestamp) ||
      Math.abs(this.now() - Number(context.timestamp)) > 120_000 ||
      !/^[A-Za-z0-9_-]{22,86}$/.test(context.nonce)
    )
      fail(401, 'COLLECTOR_AUTH_FAILED', 'Collector authentication failed')
    if (
      !this.limiter.take(
        'collector:' + collector.id,
        this.options.collectorRateLimit ?? 120,
        this.now()
      )
    ) {
      fail(429, 'RATE_LIMITED', 'Collector rate limit reached')
    }
    const raw = await this.body(request)
    if (
      !this.store.collector(collector.id)?.active ||
      Math.abs(this.now() - Number(context.timestamp)) > 120_000
    ) {
      fail(401, 'COLLECTOR_AUTH_FAILED', 'Collector authentication failed')
    }
    if (
      !verifyObservation(
        context,
        raw,
        request.headers.get('X-QS-Signature') ?? '',
        collector.public_key
      )
    ) {
      fail(401, 'COLLECTOR_AUTH_FAILED', 'Collector authentication failed')
    }
    const envelope = envelopeSchema.parse(this.parse(raw))
    const event = envelope.observation
    const member = this.store.member(collector.organization_id)
    if (
      !member?.active ||
      member.valid_from > this.now() ||
      member.expires_at <= this.now() ||
      event.organizationId !== collector.organization_id ||
      event.collectorId !== collector.id
    ) {
      fail(403, 'COLLECTOR_SCOPE_REJECTED', 'Collector is not authorized for this organization')
    }
    if (envelope.runId !== this.store.meta('active_run'))
      fail(409, 'RUN_INACTIVE', 'This controlled run is no longer active')
    const times =
      event.kind === 'post-update-process-chain'
        ? [event.updateAtMs, event.connectionAtMs, event.childProcessAtMs]
        : [event.connectionAtMs]
    if (
      times.some(
        (t) =>
          t <= this.now() - policy.windowMs ||
          t > this.now() ||
          t < member.valid_from ||
          t >= member.expires_at
      )
    ) {
      fail(
        422,
        'EVIDENCE_TIME_REJECTED',
        'Observation timestamps are outside the permitted evidence window'
      )
    }
    if (
      event.kind === 'post-update-process-chain' &&
      (event.updateAtMs > event.connectionAtMs ||
        event.connectionAtMs > event.childProcessAtMs ||
        event.childProcessAtMs - event.updateAtMs > policy.maxSequenceSpanMs)
    ) {
      fail(422, 'SEQUENCE_REJECTED', 'Observation sequence is invalid')
    }
    const hash = digest(canonical(envelope))
    const result = this.store.db.transaction(() => {
      this.store.db.query('DELETE FROM nonces WHERE expires_at<=?').run(this.now())
      if (
        this.store.db
          .query('SELECT 1 FROM nonces WHERE collector_id=? AND nonce=?')
          .get(collector.id, context.nonce)
      ) {
        fail(409, 'REPLAY_REJECTED', 'This signed request has already been used')
      }
      const existing = this.store.db
        .query('SELECT payload_hash FROM observations WHERE collector_id=? AND event_id=?')
        .get(collector.id, event.eventId) as { payload_hash: string } | null
      if (existing && existing.payload_hash !== hash)
        fail(409, 'EVENT_CONFLICT', 'Event identity conflicts with accepted evidence')
      if (!existing) {
        const count = this.store.db
          .query('SELECT COUNT(*) AS count FROM observations WHERE run_id=?')
          .get(envelope.runId) as { count: number }
        if (count.count >= (this.options.capacity ?? 1000))
          fail(503, 'CAPACITY_REACHED', 'This pilot run has reached its bounded evidence capacity')
      }
      this.store.db
        .query('INSERT INTO nonces VALUES (?,?,?)')
        .run(collector.id, context.nonce, this.now() + 300_000)
      if (existing) return { status: 'duplicate' as const }
      this.store.db
        .query('INSERT INTO observations VALUES (?,?,?,?,?,?,?)')
        .run(
          collector.id,
          event.eventId,
          envelope.runId,
          member.id,
          canonical(event),
          hash,
          this.now()
        )
      this.store.audit(
        'collector:' + collector.id,
        'observation_accepted',
        envelope.runId,
        { synthetic: true },
        this.now()
      )
      this.refresh()
      return { status: 'accepted' as const }
    })()
    return result
  }
  private startRun(scenario: Scenario, reset: boolean, session: SessionRow) {
    const id = randomUUID()
    this.store.db.transaction(() => {
      if (reset) {
        for (const seed of this.options.seeds) {
          this.store.db
            .query(
              'UPDATE organizations SET active=1,sharing=1,valid_from=?,expires_at=? WHERE id=?'
            )
            .run(this.now() - 86_400_000, this.now() + 30 * 86_400_000, seed.organizationId)
          this.store.db.query('UPDATE collectors SET active=1 WHERE id=?').run(seed.id)
        }
      }
      this.store.db.query('INSERT INTO runs VALUES (?,?,?)').run(id, scenario, this.now())
      this.store.setMeta('active_run', id)
      this.store.audit(
        actor(session),
        'controlled_run_started',
        id,
        { scenario, resetTestMembership: reset },
        this.now()
      )
    })()
    return id
  }
  private async simulate(scenario: Scenario, reset: boolean, session: SessionRow) {
    if (this.simulationActive) fail(409, 'RUN_BUSY', 'A controlled run is already in progress')
    this.simulationActive = true
    try {
      const runId = this.startRun(scenario, reset, session)
      const sample = fixture(scenario, this.now())
      if (scenario === 'revoked-member') {
        this.store.db.query('UPDATE organizations SET active=0 WHERE id=?').run('demo-charlie')
        this.store.audit(
          actor(session),
          'membership_revoked',
          'demo-charlie',
          { controlledScenario: true },
          this.now()
        )
      }
      let accepted = 0
      let rejected = 0
      let duplicates = 0
      for (const observation of sample.observations) {
        const seed = this.options.seeds.find((s) => s.id === observation.collectorId)
        if (!seed) continue
        const event = { ...observation, eventId: runId + ':' + observation.eventId }
        const body = JSON.stringify({
          schemaVersion: 'quietsignal-pilot/v1',
          synthetic: true,
          runId,
          observation: event,
        })
        const headers = signObservation(
          {
            workspaceId: this.store.workspaceId,
            collectorId: seed.id,
            timestamp: String(this.now()),
            nonce: randomToken(),
          },
          body,
          seed.privateKey
        )
        // Exercise the exact HTTP admission route, including signature/replay/time
        // verification. The simulator never writes observations directly.
        const response = await this.fetch(
          new Request(this.options.origin + '/api/pilot/observations', {
            method: 'POST',
            headers,
            body,
          }),
          'controlled-simulator'
        )
        if (response.ok) {
          const result = (await response.json()) as { status: string }
          if (result.status === 'accepted') accepted++
          else duplicates++
        } else rejected++
      }
      this.store.audit(
        actor(session),
        'controlled_run_completed',
        runId,
        { accepted, rejected, duplicates },
        this.now()
      )
      return { runId, scenario, accepted, rejected, duplicates }
    } finally {
      this.simulationActive = false
    }
  }
  async fetch(request: Request, clientIp = 'local'): Promise<Response> {
    const requestId = randomUUID()
    const reply = (body: unknown, status = 200, extra?: HeadersInit) => {
      const headers = new Headers(extra)
      headers.set('Cache-Control', 'no-store')
      headers.set('Vary', 'Cookie')
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Referrer-Policy', 'no-referrer')
      headers.set('X-Request-ID', requestId)
      headers.set('Content-Type', 'application/json; charset=utf-8')
      return new Response(JSON.stringify(body), { status, headers })
    }
    try {
      const url = new URL(request.url)
      if (url.origin !== this.options.origin)
        fail(421, 'HOST_REJECTED', 'Unrecognized workspace host')
      const path = url.pathname
      if (path === '/api/pilot/observations') {
        if (request.method !== 'POST' || url.search)
          fail(405, 'METHOD_REJECTED', 'Use the signed POST observation endpoint')
        return reply(await this.ingest(request, clientIp))
      }
      if (path === '/api/pilot/login' && request.method === 'POST') {
        this.checkMutation(request)
        if (!this.limiter.take('login:' + clientIp, 8, this.now()))
          fail(429, 'RATE_LIMITED', 'Too many login attempts; retry later')
        const input = z
          .object({ accessToken: z.string().min(32).max(128) })
          .strict()
          .parse(this.parse(await this.body(request, 4096)))
        const key = this.store.db
          .query('SELECT * FROM access_keys WHERE token_hash=? AND active=1 AND expires_at>?')
          .get(digest(input.accessToken), this.now()) as {
          id: string
          role: Role
          organization_id: string | null
          expires_at: number
        } | null
        if (
          !key ||
          (key.organization_id &&
            (!this.store.member(key.organization_id)?.active ||
              this.store.member(key.organization_id)!.valid_from > this.now() ||
              this.store.member(key.organization_id)!.expires_at <= this.now()))
        ) {
          fail(401, 'LOGIN_FAILED', 'Access file is invalid, expired, or revoked')
        }
        const token = randomToken()
        const csrf = randomToken()
        this.store.db.transaction(() => {
          this.store.db.query('DELETE FROM sessions WHERE expires_at<=?').run(this.now())
          this.store.db
            .query('INSERT INTO sessions VALUES (?,?,?,?)')
            .run(digest(token), csrf, key.id, Math.min(this.now() + 8 * 3_600_000, key.expires_at))
          this.store.audit(
            key.role === 'operator' ? 'operator' : 'member:' + key.organization_id,
            'session_started',
            key.id,
            {},
            this.now()
          )
        })()
        return reply({ authenticated: true, role: key.role, csrf }, 200, {
          'Set-Cookie': this.setCookie(token, 8 * 3600),
        })
      }
      if (path === '/api/pilot/session' && request.method === 'GET') {
        const session = this.session(request)
        return reply(
          session
            ? {
                authenticated: true,
                role: session.role,
                csrf: session.csrf,
                organization: session.organization_id
                  ? {
                      id: session.organization_id,
                      name: this.store.member(session.organization_id)!.name,
                    }
                  : null,
                workspaceId: this.store.workspaceId,
                mode: 'controlled-local-pilot',
              }
            : { authenticated: false }
        )
      }
      const session = this.requireSession(request)
      if (request.method !== 'GET') {
        this.checkMutation(request, session)
        if (!this.limiter.take('mutation:' + session.id_hash, 60, this.now()))
          fail(429, 'RATE_LIMITED', 'Workspace action rate limit reached')
      }
      if (path === '/api/pilot/logout' && request.method === 'POST') {
        this.store.db.query('DELETE FROM sessions WHERE id_hash=?').run(session.id_hash)
        return reply({ loggedOut: true }, 200, { 'Set-Cookie': this.setCookie('', 0) })
      }
      if (path === '/api/pilot/incidents' && request.method === 'GET') {
        return reply({
          incidents: this.visible(session),
          operatorPreview: session.role === 'operator',
          activeRun: this.store.meta('active_run'),
        })
      }
      const incidentPath =
        /^\/api\/pilot\/incidents\/([a-f0-9-]{36})(\/acknowledge|\/download)?$/.exec(path)
      if (incidentPath) {
        const incident = this.visible(session).find((i) => i.id === incidentPath[1])
        if (!incident)
          fail(404, 'NOT_FOUND', 'Incident is unavailable under your current evidence permissions')
        if (!incidentPath[2] && request.method === 'GET') return reply({ incident })
        if (incidentPath[2] === '/download' && request.method === 'GET') {
          this.store.audit(actor(session), 'brief_downloaded', incident.id, {}, this.now())
          return reply(
            {
              synthetic: true,
              notice: 'Controlled pilot evidence; not a real incident verdict',
              brief: incident.brief,
            },
            200,
            { 'Content-Disposition': 'attachment; filename="quietsignal-pilot-brief.json"' }
          )
        }
        if (incidentPath[2] === '/acknowledge' && request.method === 'POST') {
          this.store.db.transaction(() => {
            this.store.db
              .query(
                'INSERT INTO reviews VALUES (?,?,?) ON CONFLICT(incident_id,principal) DO NOTHING'
              )
              .run(incident.id, actor(session), this.now())
            this.store.audit(actor(session), 'incident_acknowledged', incident.id, {}, this.now())
          })()
          return reply({ acknowledged: true })
        }
      }
      if (path === '/api/pilot/profile' && request.method === 'GET') {
        return reply({
          role: session.role,
          organization: session.organization_id ? this.store.member(session.organization_id) : null,
        })
      }
      if (path === '/api/pilot/consent' && request.method === 'POST') {
        if (!session.organization_id)
          fail(
            403,
            'PARTICIPANT_REQUIRED',
            'Use participant access to change your own sharing consent'
          )
        const input = z
          .object({ shareEvidence: boolean })
          .strict()
          .parse(this.parse(await this.body(request)))
        this.store.db.transaction(() => {
          this.store.db
            .query('UPDATE organizations SET sharing=? WHERE id=?')
            .run(Number(input.shareEvidence), session.organization_id)
          this.store.audit(
            actor(session),
            'evidence_consent_changed',
            session.organization_id!,
            { sharing: input.shareEvidence },
            this.now()
          )
        })()
        return reply({ sharing: input.shareEvidence })
      }
      if (path === '/api/pilot/audit' && request.method === 'GET') {
        const rows =
          session.role === 'operator'
            ? this.store.db
                .query(
                  'SELECT id,at,actor,action,target,details FROM audit ORDER BY id DESC LIMIT 100'
                )
                .all()
            : this.store.db
                .query(
                  'SELECT at,action,target,details FROM audit WHERE actor=? ORDER BY id DESC LIMIT 100'
                )
                .all(actor(session))
        return reply({
          events: rows,
          integrity:
            session.role === 'operator'
              ? this.store.auditIntegrity()
              : { valid: this.store.auditIntegrity().valid, eventCount: rows.length },
          scope: session.role === 'operator' ? 'operator' : 'your-actions-only',
          limitation:
            'Local hash chain; not immutable, externally anchored, or protected from the database owner',
        })
      }
      this.operator(session)
      if (path === '/api/pilot/members' && request.method === 'GET')
        return reply({ members: this.store.members() })
      const memberPath =
        /^\/api\/pilot\/members\/([a-z][a-z0-9-]{0,63})(\/access|\/revoke-access)?$/.exec(path)
      if (path === '/api/pilot/members' && request.method === 'POST') {
        const input = z
          .object({ id, name: z.string().min(1).max(100) })
          .strict()
          .parse(this.parse(await this.body(request)))
        if (this.store.members().length >= 100 || this.store.member(input.id))
          fail(409, 'MEMBER_REJECTED', 'Member already exists or roster capacity reached')
        this.store.db.transaction(() => {
          this.store.db
            .query('INSERT INTO organizations VALUES (?,?,?,?,?,?)')
            .run(input.id, input.name, 1, 0, this.now(), this.now() + 30 * 86_400_000)
          this.store.audit(
            actor(session),
            'member_registered',
            input.id,
            { sharing: false },
            this.now()
          )
        })()
        return reply({ registered: true }, 201)
      }
      if (memberPath) {
        const member = this.store.member(memberPath[1]!)
        if (!member) fail(404, 'NOT_FOUND', 'Member not found')
        if (memberPath[2] === '/access' && request.method === 'POST') {
          if (!member.active || member.expires_at <= this.now())
            fail(409, 'MEMBER_INACTIVE', 'Member is not eligible')
          const token = randomToken()
          const keyId = randomUUID()
          const expires = Math.min(member.expires_at, this.now() + 7 * 86_400_000)
          this.store.db.transaction(() => {
            this.store.db
              .query('INSERT INTO access_keys VALUES (?,?,?,?,?,?)')
              .run(keyId, digest(token), 'participant', member.id, 1, expires)
            this.store.audit(
              actor(session),
              'participant_access_issued',
              member.id,
              { keyId, expiresAtMs: expires },
              this.now()
            )
          })()
          return reply(
            {
              kind: 'quietsignal-local-access/v1',
              accessToken: token,
              organizationId: member.id,
              expiresAtMs: expires,
            },
            201
          )
        }
        if (memberPath[2] === '/revoke-access' && request.method === 'POST') {
          this.store.db.transaction(() => {
            this.store.db
              .query(
                'DELETE FROM sessions WHERE key_id IN (SELECT id FROM access_keys WHERE organization_id=?)'
              )
              .run(member.id)
            this.store.db
              .query('UPDATE access_keys SET active=0 WHERE organization_id=?')
              .run(member.id)
            this.store.audit(
              actor(session),
              'participant_access_revoked',
              member.id,
              {},
              this.now()
            )
          })()
          return reply({ revoked: true })
        }
        if (!memberPath[2] && request.method === 'PATCH') {
          const input = z
            .object({ active: boolean.optional(), sharing: boolean.optional() })
            .strict()
            .refine((v) => v.active !== undefined || v.sharing !== undefined)
            .parse(this.parse(await this.body(request)))
          this.store.db.transaction(() => {
            this.store.db
              .query('UPDATE organizations SET active=?,sharing=? WHERE id=?')
              .run(
                input.active === undefined ? member.active : Number(input.active),
                input.sharing === undefined ? member.sharing : Number(input.sharing),
                member.id
              )
            if (input.active === false)
              this.store.db
                .query(
                  'DELETE FROM sessions WHERE key_id IN (SELECT id FROM access_keys WHERE organization_id=?)'
                )
                .run(member.id)
            this.store.audit(actor(session), 'member_policy_changed', member.id, input, this.now())
            this.refresh()
          })()
          return reply({ updated: true })
        }
      }
      if (path === '/api/pilot/collectors' && request.method === 'GET')
        return reply({
          collectors: this.store.collectors().map(({ public_key, ...row }) => ({
            ...row,
            fingerprint: digest(public_key).slice(0, 20),
          })),
        })
      if (path === '/api/pilot/collectors' && request.method === 'POST') {
        const input = z
          .object({ id, organizationId: id, publicKey: z.string().min(32).max(256) })
          .strict()
          .parse(this.parse(await this.body(request)))
        try {
          publicKey(input.publicKey)
        } catch {
          fail(400, 'KEY_REJECTED', 'Supply a base64 SPKI Ed25519 public key, never a private key')
        }
        if (
          !this.store.member(input.organizationId) ||
          this.store.collector(input.id) ||
          this.store.collectors().filter((c) => c.organization_id === input.organizationId)
            .length >= 20 ||
          this.store.collectors().some((c) => c.public_key === input.publicKey)
        )
          fail(409, 'COLLECTOR_REJECTED', 'Registration conflicts with the collector registry')
        this.store.db.transaction(() => {
          this.store.db
            .query('INSERT INTO collectors VALUES (?,?,?,?,?)')
            .run(input.id, input.organizationId, input.publicKey, 1, this.now())
          this.store.audit(
            actor(session),
            'collector_registered',
            input.id,
            { organizationId: input.organizationId },
            this.now()
          )
        })()
        return reply({ registered: true }, 201)
      }
      const collectorPath = /^\/api\/pilot\/collectors\/([a-z][a-z0-9-]{0,63})$/.exec(path)
      if (collectorPath && request.method === 'PATCH') {
        const input = z
          .object({ active: boolean })
          .strict()
          .parse(this.parse(await this.body(request)))
        if (!this.store.collector(collectorPath[1]!)) fail(404, 'NOT_FOUND', 'Collector not found')
        this.store.db.transaction(() => {
          this.store.db
            .query('UPDATE collectors SET active=? WHERE id=?')
            .run(Number(input.active), collectorPath[1]!)
          this.store.audit(
            actor(session),
            'collector_state_changed',
            collectorPath[1]!,
            input,
            this.now()
          )
          this.refresh()
        })()
        return reply({ updated: true })
      }
      if (path === '/api/pilot/policy' && request.method === 'GET')
        return reply({ correlation: policy, disclosure: this.disclosure() })
      if (path === '/api/pilot/policy' && request.method === 'PUT') {
        const disclosure = disclosurePolicySchema.parse(this.parse(await this.body(request)))
        if (
          new Set(disclosure.suppliers.map((s) => s.id)).size !== disclosure.suppliers.length ||
          new Set(disclosure.suppliers.map((s) => s.displayName)).size !==
            disclosure.suppliers.length ||
          disclosure.recipients.some((r) => !this.store.member(r))
        )
          fail(400, 'POLICY_REJECTED', 'Disclosure policy references are invalid or ambiguous')
        this.store.db.transaction(() => {
          this.store.setMeta('disclosure', canonical(disclosure))
          this.store.audit(
            actor(session),
            'disclosure_policy_changed',
            disclosure.version,
            {},
            this.now()
          )
        })()
        return reply({ updated: true })
      }
      if (path === '/api/pilot/simulate' && request.method === 'POST') {
        const input = z
          .object({ scenario: z.enum(scenarios), resetTestMembership: boolean })
          .strict()
          .parse(this.parse(await this.body(request)))
        return reply(await this.simulate(input.scenario, input.resetTestMembership, session))
      }
      fail(404, 'NOT_FOUND', 'Endpoint not found')
    } catch (error) {
      const known =
        error instanceof ApiError
          ? error
          : error instanceof ZodError
            ? new ApiError(400, 'INVALID_INPUT', 'Request fields do not match the required schema')
            : new ApiError(500, 'INTERNAL_ERROR', 'The workspace could not complete this request')
      // Never log bodies, cookies, signatures, access tokens, or raw error text.
      if (new URL(request.url).pathname === '/api/pilot/observations') {
        this.store.audit(
          'ingestion',
          'observation_rejected',
          '',
          { reason: known.code },
          this.now()
        )
      }
      return reply({ error: { code: known.code, message: known.message }, requestId }, known.status)
    }
  }
}
