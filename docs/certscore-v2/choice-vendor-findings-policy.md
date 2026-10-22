# CertScore.ai vendor findings across GPC and Reject

Owner-approved local implementation, October 22, 2026. No deployment or historical report rewrite.

## Objective and minimum evidence

California's opt-out objective is sale/sharing, including cross-context behavioral advertising. A cookie being optional is not itself proof of sale/sharing. Conversely, absence of a recognized cookie or advertising ID does not prove that personal information was not shared. Browser identifiers, hashed contact identifiers, identity matching and audience workflows can be relevant. These are CertScore.ai evidence thresholds for factual risk findings, not a statutory requirement to find a particular parameter or a legal determination.

| Finding | Minimum retained evidence |
| --- | --- |
| GPC vendor finding for California choice enforcement | Verified original source/session/document and usable representative visit; delivered GPC in both page HTTP header and browser; the specific request bound to that signal; canonical advertising recipient and reviewed collection endpoint; successful response; supported identified-advertising, audience or identity-sync activity; no disqualifying request-local restriction or unresolved privacy signal in the supported qualification. A missing paired comparison or unrelated incomplete capture does not erase an independently verified positive request. |
| Non-essential entity after Reject, EU presence finding | Verified authorized Reject control and completed click/path in the original document, completed bounded capture, positive canonically classified non-essential cookie snapshot and/or service request. Requests require strictly post-click ancestry and retained source proof. Cookie snapshots prove presence, not a new write. A transmitted identifier and semantic confirmation that the CMP registered refusal are **not** prerequisites. |
| California recipient after Reject | The verified Reject path above, with a control scope covering optional tracking, plus same-request positive advertising identity/audience/synchronization collection proof, response and completion within the capture window, supported complete body/header proof for current v2 captures, and request-local processing checks. Cookie presence, a script download or ordinary analytics alone does not establish this California finding. Semantic refusal registration is **not** a prerequisite. |

The existing verified GPC acknowledgment with the applicable sale/sharing opt-out off remains a separate trigger within the recipient family. It does not invent a recipient identity. The separate GPP propagation family is unchanged.

Restricted processing declarations (including RDP, NPA/limited ads, Meta LDU, sale opt-out and supported GPP restrictions) and unsupported/invalid signals remain neutral for that request. They neither establish compliance nor cancel another independently qualifying request. Network evidence cannot prove contractual relationships or downstream recipient use. CertScore.ai therefore reports observed risk, not a definitive CCPA violation or a guarantee of complete detection.

## Findings and scoring are separate projections

Keep a vendor's GPC and Reject evidence visible independently. GPC summaries name supported recipients and first-observed time from the GPC worker visit start. Reject summaries name non-essential entities, cookie snapshot/service request type, and first-observed time after the click. Full retained detail remains available when summaries are bounded to eight entities. GPC detail distinguishes supported identity/audience/synchronization requests from other advertising requests retained for review.

Deduplicate only within the relevant score family: California unions canonical recipient IDs across GPC, explicit opt-out and eligible Reject evidence, retaining 15/25/32/37/40/43/45/47. EU Reject retains its separate 15/20/23/25/27/28/29/30 entity schedule. A LinkedIn finding on both paths must not be removed merely because California already counted LinkedIn. Customer reports contain factual findings and resulting scores, never point explanations.

## Expanded identifiers and historical compatibility

- `gpc_sale_sharing_evidence.v3` / `california-gpc-response.v8-identifiers` add exact Meta pixel `ud[em]` (email) and `ud[ph]` (phone) matching fields at HTTPS `facebook.com/tr/` or `www.facebook.com/tr/`, with the existing pixel/event fields. Accept a single SHA-256 hex digest; reject raw contact data, empty/zero/empty-string digests, duplicate keys and unsupported formats. Existing query captures support these on GPC; already-inspected query or body fields support Reject.
- `bounded_ca_request_proof.v3` adds exact root LinkedIn `hem` in the supported POST `/wa/` envelope, alongside existing root `liFatId`. Accept only the reviewed decoded body and SHA-256 format, retaining a digest of the identifier rather than its raw value. This is advertising matching evidence even when a cookie identifier is absent. LinkedIn's `liGiant`, page/request IDs and security/routing cookies remain excluded.
- For decoded LinkedIn bodies, retain three bounded field dispositions for `liFatId`, `hem` and `liGiant`: absent, null, empty, invalid, valid, or explicitly excluded. This distinguishes future absence from unsupported content. Missing historical dispositions remain unknown.
- New matching bases cannot be labeled as historical v1/v2 qualification or pre-v3 request proof. Stored assessments keep their original versions and are not silently reinterpreted. Generated API/OpenAPI and SDK source types follow the canonical contract; no package publication is part of this change.

This release does not add GPC POST-body/header capture. LinkedIn `hem` support is available where the existing Reject decoder has exact body proof; a GPC request whose only identifier is in an unretained body remains unresolved. Likewise, a complete historical body hash cannot recover a discarded `hem` field. Endpoint knowledge or another path's identifier must never fill that gap.

## Budgets and provenance

No new visits, Options/Manage panels, browser calls, header reads, waits, retries, lanes, model calls, workers or retention changes. Preserve 32 KiB input/output, 128 decoded fields, depth 8, 48 shared inspections, 32 California request proofs and eight identifier digests per request. The extra three small field dispositions and bounded validation/report metadata are estimated below $0.50/month at 100,000 scans with existing retention. No raw payload or contact identifier is added to retention.

Primary sources checked October 22, 2026:

- [CPPA consumer rights FAQ](https://cppa.ca.gov/faq): sale/sharing opt-out, cross-context behavioral advertising and linked personal information. The operational thresholds above are CertScore.ai's implementation choices.
- [LinkedIn Insight Tag FAQ](https://www.linkedin.com/help/linkedin/answer/a427660/): enhanced matching sends hashed email; the tag supports conversion tracking and website retargeting. Exact `hem` envelope mapping was corroborated against the retained public vendor script, not inferred to have occurred on Ovid.
- [Meta's advanced matching training](https://www.facebookblueprint.com/student/path/211540-advanced-matching-course): hashed customer information accompanies pixel website events. Exact `ud[em]`/`ud[ph]` and hashing were checked against [Meta's public pixel implementation](https://connect.facebook.net/en_US/fbevents.js); local source hash is recorded in the implementation artifact. This protocol review is not evidence that any particular scanned site sent those fields.


October 22 follow-up: local GPC body/header capture is now implemented under
[gpc-request-proof-policy.md](gpc-request-proof-policy.md). The earlier capture
limitation describes the retained historical scans; it no longer describes the
new local producer. It remains undeployed.
