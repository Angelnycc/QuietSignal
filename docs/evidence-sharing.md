# Selective evidence sharing

QuietSignal should quietly share relevant threat evidence with trusted participants, while withholding unnecessary sensitive context. Confidential processing is a means to that outcome. An aggregate warning alone is insufficient for a useful investigation.

## Member evidence brief

The contributor's policy must authorize each released field and its recipients. Start with an allowlist; do not attempt to clean and forward arbitrary raw logs.

| Potentially useful evidence | Information to withhold by default |
| --- | --- |
| Suspicious public destination or available artifact hash | Internal hostnames, private IPs, employee or customer identifiers |
| Relevant software supplier and version | The contributor's full software inventory or customer relationships |
| Sanitized update → connection → unusual process sequence | Full command lines, access tokens, file contents, unrelated events |
| Coarse observation window and alert expiry | Exact timestamps when unnecessary for investigation |
| Threshold corroboration and evidence provenance | Contributor identities and each contributor's detailed report |
| Reason for the warning and known evidence limitations | An unsupported declaration that activity is malicious |

The local prototype includes approved domains, software/version, a fixed sanitized activity sequence, a coarse search window, threshold-only corroboration, expiry, and an explicit synthetic-source limitation. File hashes, detailed sanitized process evidence, provenance verification, and private delivery require additional implementation.

Example intended member message:

> Multiple enrolled organizations observed connections to relay.example after updating MaintenanceTool to version 4.2.1. Supporting reports include an unusual process sequence. Investigate this destination and version in your own environment. This pattern is corroborated; maliciousness is not established. Evidence window and expiry are supplied with the brief.

## Audience and processing boundaries

- Source organizations retain their full records. Authorized confidential processing evaluates narrowly scoped evidence.
- Authenticated, eligible recipients receive only the policy-approved evidence brief over a protected channel. They do not receive other participants' full logs.
- Public or on-chain records must not expose the member brief by default. Record only deliberately approved metadata or appropriately hiding commitments, if a public audit trail is needed.
- Small cohorts, distinctive evidence, and timing can still reveal identities indirectly. Membership-query controls and disclosure review are necessary; redaction alone does not guarantee anonymity.
- Evidence provenance describes the source and verification performed. It does not guarantee that an upstream system reported the truth.

## Current state

The synthetic fixture service exposes fictional records to the developer. `buildEvidenceBriefs` recomputes corroboration using only evidence from members whose roster entry explicitly permits consortium evidence sharing, and only suppliers, software versions, and destinations approved by the separate disclosure policy. Unapproved source fields never become display text. Recipients must be active, unexpired roster members and listed in the policy. The `/api/member-demo` endpoint uses a fixed fictional recipient; these policy checks are not production authentication.

`shareEvidenceWithConsortium` governs release of member briefs. It does not disable aggregate correlation; membership revocation (`active: false`) excludes contributions from both. A real deployment must define and obtain the permissions for both processing and each form of disclosure.

The CRE workflow still returns a minimal aggregate status only. No production member access control, encrypted delivery, or source authenticity guarantee is implemented. The demo exposes the brief locally to illustrate the intended recipient experience. Moving that flow into confidential processing and protected delivery is a separate milestone.
