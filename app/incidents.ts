import { correlate } from '../correlation/model'
import { disclosurePolicySchema, evaluateEvidenceReleases } from '../correlation/evidence'
import { policy } from '../correlation/defaults'
import { PilotStore, sessionPrincipal, type SessionRow } from './store'

/** Incident identity and delivery projection; HTTP authentication stays in PilotApi. */
export class IncidentService {
  constructor(private readonly store: PilotStore) {}

  disclosure() {
    return disclosurePolicySchema.parse(JSON.parse(this.store.meta('disclosure')!))
  }

  refresh(now: number) {
    const run = this.store.meta('active_run')
    if (!run) return
    for (const finding of correlate(this.store.snapshot(now), policy, now).privateFindings) {
      this.store.incident(
        run,
        [finding.supplierId, finding.softwareVersion, finding.destination],
        now
      )
    }
  }

  visible(session: SessionRow, now: number) {
    const disclosure = this.disclosure()
    const snapshot = this.store.snapshot(now)
    const recipients =
      session.role === 'participant' ? [session.organization_id!] : disclosure.recipients
    // An operator preview uses a currently eligible recipient's release rules.
    const recipient = recipients.find(
      (id) =>
        disclosure.recipients.includes(id) &&
        snapshot.members.some(
          (m) => m.organizationId === id && m.active && m.validFromMs <= now && m.expiresAtMs > now
        )
    )
    if (!recipient) return []
    const releases = evaluateEvidenceReleases(snapshot, policy, disclosure, recipient, now)
    const run = this.store.meta('active_run') ?? ''
    return releases.flatMap(({ finding, brief }) => {
      const incident = this.store.findIncident(run, [
        finding.supplierId,
        finding.softwareVersion,
        finding.destination,
      ])
      if (!incident) return []
      const review = this.store.db
        .query('SELECT reviewed_at FROM reviews WHERE incident_id=? AND principal=?')
        .get(incident.id, sessionPrincipal(session)) as { reviewed_at: number } | null
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
}
