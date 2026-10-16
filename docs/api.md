# Local pilot API

All paths below start with `/api/pilot`. Responses are JSON with `Cache-Control: no-store`. Errors contain a stable `error.code`, generic `error.message`, and opaque `requestId`; they do not echo rejected fields. The server accepts its exact configured loopback origin and supplies no permissive CORS policy.

| Method/path | Access | Purpose |
| --- | --- | --- |
| POST `/login` | Same origin | Strict `{accessToken}` body; issue session cookie and CSRF value |
| GET `/session` | Anonymous or session | Current authentication status; authenticated workspace UUID and own identity |
| POST `/logout` | Session + CSRF | Delete session and clear cookie |
| POST `/observations` | Signed registered collector | Admit one synthetic observation |
| GET `/incidents` | Session | Current releasable incidents; operator receives a labeled policy-constrained preview |
| GET `/incidents/:uuid` | Session + current release permission | Current brief and own review status |
| POST `/incidents/:uuid/acknowledge` | Session + current release permission + CSRF | Record acknowledgement for this principal |
| GET `/incidents/:uuid/download` | Session + current release permission | Approved evidence JSON attachment; audited |
| GET `/profile` | Session | Own organization for a participant |
| POST `/consent` | Participant + CSRF | Strict `{shareEvidence: boolean}` for own organization |
| GET `/audit` | Session | Operator trail or only participant's own actions |
| GET, POST `/members` | Operator (+ CSRF on POST) | List or enroll `{id,name}`; new members start without sharing consent |
| PATCH `/members/:id` | Operator + CSRF | Optional `active` and/or `sharing` booleans |
| POST `/members/:id/access` | Operator + CSRF | Issue participant credential once; only hash retained |
| POST `/members/:id/revoke-access` | Operator + CSRF | Revoke all participant keys/sessions for that member |
| GET, POST `/collectors` | Operator (+ CSRF on POST) | List fingerprints or register `{id,organizationId,publicKey}` |
| PATCH `/collectors/:id` | Operator + CSRF | Strict `{active: boolean}` |
| GET, PUT `/policy` | Operator (+ CSRF on PUT) | Inspect rules or replace strict disclosure policy |
| POST `/simulate` | Operator + CSRF | `{scenario,resetTestMembership}`; five predefined synthetic scenarios; concurrent runs rejected |

Cookie-authenticated mutations require both an exact `Origin` and `X-QS-CSRF` from `/session`. Access files never go into URLs. Private collector keys never go to the registration endpoint.

## Signed admission

Body schema:

```json
{
  "schemaVersion": "quietsignal-pilot/v1",
  "synthetic": true,
  "runId": "ACTIVE_RUN_UUID",
  "observation": {
    "kind": "new-destination",
    "eventId": "unique-event-id",
    "organizationId": "demo-alpha",
    "collectorId": "collector-lab",
    "supplierId": "demo-maintenance-vendor",
    "softwareVersion": "4.2.1",
    "destination": "relay.supplier-incident.example",
    "connectionAtMs": 1800000000000
  }
}
```

The example UUID and timestamp are explanatory; use the current run and current valid evidence times. Unknown fields and `synthetic: false` are rejected. For a sequence, use `post-update-process-chain` and add `updateAtMs` and `childProcessAtMs`.

`X-QS-Workspace`, `X-QS-Collector`, `X-QS-Timestamp`, and `X-QS-Nonce` are included in the signing context. Timestamp is a thirteen-digit Unix millisecond value. Nonce is 22–86 base64url characters; the utility generates 32 random bytes. `X-QS-Signature` is the canonical unpadded base64url encoding of a 64-byte Ed25519 signature over UTF-8 text:

```text
QUIETSIGNAL-OBSERVATION-V1
<workspace UUID>
POST
/api/pilot/observations
<collector ID>
<timestamp>
<nonce>
<hex SHA-256 of exact request body bytes>
```

There is no trailing newline. Content-Type is `application/json`. Queries, alternate methods, inactive runs, identity conflicts, unauthorized organization claims, stale evidence, invalid sequences and reused nonces fail closed. No private key is transmitted. A successful duplicate retry needs a new signed nonce and returns `status: duplicate`; it does not increase corroboration. See `app/security.ts` and the tested collector utility for the executable protocol.
