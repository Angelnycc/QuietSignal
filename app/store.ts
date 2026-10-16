import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { canonical, digest } from './security'
import type { Observation, Snapshot } from '../correlation/model'

export type Role = 'operator' | 'participant'
export interface MemberRow {
  id: string
  name: string
  active: number
  sharing: number
  valid_from: number
  expires_at: number
}
export interface CollectorRow {
  id: string
  organization_id: string
  public_key: string
  active: number
  created_at: number
}
export interface SessionRow {
  id_hash: string
  csrf: string
  key_id: string
  role: Role
  organization_id: string | null
  expires_at: number
}
export interface IncidentRow {
  id: string
  run_id: string
  fingerprint: string
  first_seen: number
  last_seen: number
}

export class PilotStore {
  readonly db: Database
  readonly workspaceId: string
  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true })
    try {
      this.db.exec(
        'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'
      )
      const version = this.db.query('PRAGMA user_version').get() as { user_version: number }
      if (version.user_version > 1)
        throw new Error('Database version is newer than this application')
      this.db.transaction(() => {
        this.db.exec(
          [
            'CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);',
            'CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)),sharing INTEGER NOT NULL CHECK(sharing IN (0,1)),valid_from INTEGER NOT NULL,expires_at INTEGER NOT NULL);',
            'CREATE TABLE IF NOT EXISTS collectors(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),public_key TEXT NOT NULL UNIQUE,active INTEGER NOT NULL CHECK(active IN (0,1)),created_at INTEGER NOT NULL);',
            "CREATE TABLE IF NOT EXISTS access_keys(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('operator','participant')),organization_id TEXT REFERENCES organizations(id),active INTEGER NOT NULL CHECK(active IN (0,1)),expires_at INTEGER NOT NULL);",
            'CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,key_id TEXT NOT NULL REFERENCES access_keys(id),expires_at INTEGER NOT NULL);',
            'CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,scenario TEXT NOT NULL,started_at INTEGER NOT NULL);',
            'CREATE TABLE IF NOT EXISTS observations(collector_id TEXT NOT NULL REFERENCES collectors(id),event_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),organization_id TEXT NOT NULL REFERENCES organizations(id),payload TEXT NOT NULL,payload_hash TEXT NOT NULL,received_at INTEGER NOT NULL,PRIMARY KEY(collector_id,event_id));',
            'CREATE INDEX IF NOT EXISTS observations_run_time ON observations(run_id,received_at);',
            'CREATE TABLE IF NOT EXISTS nonces(collector_id TEXT NOT NULL REFERENCES collectors(id),nonce TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(collector_id,nonce));',
            'CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),fingerprint TEXT NOT NULL UNIQUE,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);',
            'CREATE TABLE IF NOT EXISTS reviews(incident_id TEXT NOT NULL REFERENCES incidents(id),principal TEXT NOT NULL,reviewed_at INTEGER NOT NULL,PRIMARY KEY(incident_id,principal));',
            'CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);',
            'PRAGMA user_version=1;',
          ].join('\n')
        )
        this.db
          .query('INSERT OR IGNORE INTO metadata VALUES (?,?)')
          .run('workspace_id', randomUUID())
      })()
      this.workspaceId = this.meta('workspace_id')!
      if (!this.auditIntegrity().valid)
        throw new Error('Audit chain validation failed; inspect the local database')
    } catch (error) {
      this.db.close()
      throw error
    }
  }
  close() {
    this.db.close()
  }
  meta(key: string): string | null {
    return (
      (this.db.query('SELECT value FROM metadata WHERE key=?').get(key) as { value: string } | null)
        ?.value ?? null
    )
  }
  setMeta(key: string, value: string) {
    this.db
      .query(
        'INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      )
      .run(key, value)
  }
  members(): MemberRow[] {
    return this.db.query('SELECT * FROM organizations ORDER BY id').all() as MemberRow[]
  }
  collectors(): CollectorRow[] {
    return this.db.query('SELECT * FROM collectors ORDER BY id').all() as CollectorRow[]
  }
  collector(id: string): CollectorRow | null {
    return this.db.query('SELECT * FROM collectors WHERE id=?').get(id) as CollectorRow | null
  }
  member(id: string): MemberRow | null {
    return this.db.query('SELECT * FROM organizations WHERE id=?').get(id) as MemberRow | null
  }
  audit(
    actor: string,
    action: string,
    target: string,
    details: Record<string, unknown>,
    at: number
  ) {
    const last = this.db.query('SELECT id,hash FROM audit ORDER BY id DESC LIMIT 1').get() as {
      id: number
      hash: string
    } | null
    const item = { id: (last?.id ?? 0) + 1, at, actor, action, target, details }
    const previous = last?.hash ?? '0'.repeat(64)
    const hash = digest(previous + '\n' + canonical(item))
    this.db
      .query('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?)')
      .run(item.id, at, actor, action, target, canonical(details), previous, hash)
  }
  auditIntegrity(): { valid: boolean; eventCount: number } {
    const rows = this.db.query('SELECT * FROM audit ORDER BY id').all() as Array<{
      id: number
      at: number
      actor: string
      action: string
      target: string
      details: string
      previous_hash: string
      hash: string
    }>
    let previous = '0'.repeat(64)
    try {
      for (const [index, row] of rows.entries()) {
        const item = {
          id: row.id,
          at: row.at,
          actor: row.actor,
          action: row.action,
          target: row.target,
          details: JSON.parse(row.details),
        }
        if (
          row.id !== index + 1 ||
          row.previous_hash !== previous ||
          row.hash !== digest(previous + '\n' + canonical(item))
        )
          return { valid: false, eventCount: rows.length }
        previous = row.hash
      }
    } catch {
      return { valid: false, eventCount: rows.length }
    }
    return { valid: true, eventCount: rows.length }
  }
  snapshot(now: number): Snapshot {
    const run = this.meta('active_run') ?? ''
    const collectors = this.collectors().filter((c) => c.active)
    const rows = this.db
      .query(
        'SELECT payload FROM observations WHERE run_id=? ORDER BY received_at,collector_id,event_id LIMIT 1001'
      )
      .all(run) as { payload: string }[]
    if (rows.length > 1000) throw new Error('Snapshot capacity exceeded')
    return {
      createdAtMs: now,
      members: this.members().map((m) => ({
        organizationId: m.id,
        active: !!m.active,
        shareEvidenceWithConsortium: !!m.sharing,
        validFromMs: m.valid_from,
        expiresAtMs: m.expires_at,
        collectorIds: collectors.filter((c) => c.organization_id === m.id).map((c) => c.id),
      })),
      observations: rows.map((row) => JSON.parse(row.payload) as Observation),
    }
  }
  incident(run: string, tuple: string[], now: number): IncidentRow {
    const fingerprint = digest(canonical([run, ...tuple]))
    const existing = this.db
      .query('SELECT * FROM incidents WHERE fingerprint=?')
      .get(fingerprint) as IncidentRow | null
    if (existing) {
      this.db.query('UPDATE incidents SET last_seen=? WHERE id=?').run(now, existing.id)
      return { ...existing, last_seen: now }
    }
    const id = randomUUID()
    this.db.query('INSERT INTO incidents VALUES (?,?,?,?,?)').run(id, run, fingerprint, now, now)
    this.audit('system', 'pattern_detected', id, { runId: run }, now)
    return { id, run_id: run, fingerprint, first_seen: now, last_seen: now }
  }
}
