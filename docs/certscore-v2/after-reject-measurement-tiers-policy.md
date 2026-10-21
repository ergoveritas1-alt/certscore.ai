# After-Reject measurement scoring tiers

Owner-approved local implementation, October 14, 2026. Deployment is not authorized by this change. Historical reports, evidence and article content remain intact.

Original policy: `after_reject_measurement_tiers.v1`. Original scoring versions: `gdpr-eprivacy-posture.v20`, `overall-posture.v10`, `full-site-distinct-findings.v9`.

## October 21, 2026: registration-independent Reject scoring

The owner explicitly removed semantic refusal verification as a prerequisite for Reject-path deductions. New materializations use `after_reject_measurement_tiers.v2`, `gdpr-eprivacy-posture.v21`, `overall-posture.v12` and `full-site-distinct-findings.v11`. This supersedes the registration prerequisite in the original table below; the 15/5/0 purpose tiers remain unchanged.

A completed authorized Reject click can qualify when retained evidence proves the control/document identity, exact-target authorization, original packet hash, completed bounded v2 after-click capture, zero post-action request drops and request ancestry beginning strictly after dispatch. The successful click and request evidence must agree across the original after-click and scoring projections. The canonical typed assessment retains `registration: unconfirmed`; it does not claim that refusal registered or that the site honored or violated it. A click without qualifying subsequent activity does not earn a deduction.

Direct advertising/replay or observed persistent-identifier requests qualify for 15 points; fully qualified storage-denied measurement qualifies for 5; supported performance-only activity qualifies for 0. Unknown analytics identifier semantics, incomplete measurement/storage proof, pre-click chains, failed/cancelled capture, essential traffic and vendor presence alone remain neutral. Unconfirmed-click storage writes lack the registered-refusal anchors required by the existing storage-write policy and cannot independently earn points. Confirmed refusal contradictions and directly eligible registered-refusal writes keep their existing rules. Apply only the strongest supported family effect, capped at 15.

Use the same persisted source-bound assessment -> normalized concern -> concern policy -> unified finding/checklist -> score path. Customer reports retain factual evidence and the resulting score without deduction explanations. First-layer reportability rules remain unchanged. Historical v1 assessments and v20/overall v10-v11/full-site v9-v10 scores retain their versions and amounts; reading them does not silently re-score them. No bulk backfill, report publication or deployment is authorized by this correction.

This change performs bounded interpretation of already-retained data. It adds no browser work, invocation, model call, timeout, publication wait or retention. Estimated incremental CPU/metadata cost is below $0.10/month at 100,000 scans under existing retention.

## Evidence and weights

| Tier | Deduction | Required evidence |
| --- | ---: | --- |
| High risk | 15 | Verified registered refusal and directly eligible advertising/replay, an observed persistent measurement identifier, an eligible optional storage write, or a verified consent-state contradiction. |
| Measurement | 5 | Verified registered refusal, exact canonical analytics collection endpoint, request-bound denied-storage declaration, complete supported payload/header inspection, no observed identifier transmission, an empty retained response-cookie inventory, and complete/reconciled before/after storage snapshots containing only classified operational storage. |
| Performance only | 0 | Verified registered refusal and exact supported RUM collection endpoint with a supported performance payload, inspected headers without credentials or cookies, no observed persistent identifiers, an empty retained response-cookie inventory and the same bounded storage proof. |
| Review | 0 | Unconfirmed action registration, unknown purpose/identifier semantics, missing original source proof, opaque payloads, incomplete snapshots, failed inspection or otherwise insufficient evidence. This is not a clean result. |

Only the strongest supported tier applies once within the existing 15-point family cap. A supported five-point request is not erased by separate unknown activity, but that uncertainty remains recorded. Unknown activity prevents a performance-only conclusion. Independently verified advertising or optional writes retain 15 points even when some other evidence is unknown.

`G100`, `gcd`, `npa=1`, a vendor name or a supplier's privacy claim alone cannot qualify a request for the five-point tier or the performance-only conclusion. Opaque GA client/session identifiers such as `cid` and `sid` remain unknown, rather than being guessed to be transient. A supported account identifier such as `uid`, or transmission of a canonically classified optional tracking cookie, supports the high tier. Changed storage without a direct eligible write anchor and unchanged storage persistence alone remain neutral.

OPTIONS preflights are retained as raw network facts but excluded from the new eligible measurement count. Pre-action/in-flight redirect ancestry, missing request identity, dropped capture, incomplete action proof and unsupported methods cannot supply a positive deduction. Purpose inspection does not relax exact-target authorization. The October 21 correction removes semantic registration as a request-scoring prerequisite while preserving registration requirements for confirmed-refusal claims, contradictions and storage-write effects.

## Canonical flow

1. The existing Reject observer inspects at most 48 recognized collection requests. It reads already-issued request metadata in the existing browser context, with a 32 KiB body bound. It does not retain raw bodies, header values, identifiers or query values.
2. `measurement_request_evidence.v1` retains only bounded classification facts, request identity, method, endpoint and timestamp binding. Existing response-header capture supplies the bounded response-cookie-name inventory. Failed or pending header reads remain unknown; publication does not wait for new work.
3. The verified original packet projection retains `post_reject_scoring_evidence.v1`, containing the full retained after-action request set, eligible write records and original bounded storage snapshots/clocks. WC01 computes and persists a typed assessment bound to the original packet SHA-256.
4. Normalized concern construction accepts the assessment only when it exactly matches recomputation from that retained source projection. Concern policy distinguishes supported high-risk gaps from measurement/performance/review observations. The canonical checklist and central capped breakdown control scoring and attribution.
5. Unified findings carry the typed policy context, factual copy and guidance. Reports, API, API status and evidence exports consume those shared projections. Zero deduction does not remove an observed request or assert successful refusal.

Scoring uses the full retained source set, not the bounded report display sample. Completeness remains limited to existing capture scope: browser cookie snapshots and main-origin web storage, plus the existing network observer. It does not establish absence from workers, other origins or all future behavior. Snapshot counts must reconcile with the channel diagnostics; the baseline must precede dispatch, and the final snapshot must follow the inspected request's completion. Unknown storage blocks lower-tier qualification. Fresh action snapshots and writes use the shared cookie registry, with versioned `action_storage_purpose.v1` essentiality evidence. A known infrastructure purpose such as GCLB is not silently treated as necessary.

Supported performance payloads use a closed schema based on the published Cloudflare RUM data fields. Unknown fields, nested identifier-like fields, custom headers, URL query data and unsupported formats remain review. There is no blanket Cloudflare or Google exemption.

## Historical compatibility

Existing `reject_click_tracking.v1` factual assessments remain readable. The earlier 15-point unconfirmed-click review policy is used only by historical v18/v19 score explanations. Historical v20 scores assign unconfirmed registration to review with zero points; new v21 materializations use the October 21 correction above. This does not alter the stored registration status, action facts or original score.

Historical overall v8/v9 and source-bound full-site v6/v7/v8 scores retain their original weights and versions. No bulk backfill or report regeneration is performed. The retained OpenAI report still renders score 75 with identical findings and its original score explanation.

Pre-consent measurement scoring remains unchanged in this implementation. Any separate calibration of those weights requires its own decision.

## Verification and later rollout

Local regressions cover all three supported tiers, review states, mixed activity and family caps, source drift, method/endpoint/timestamp binding, storage accounting and timing, unknown cookies, credentials, unsupported payloads, hidden activity outside the display sample and historical scores. A real local browser fixture checks capture through typed packet/projection without visiting a public target. Report/API/status/export tests verify matching 95 and 100 fixture scores, retained observations and qualified guidance.

The intended later sequence is a compatible AWS scanner/web release, verification of the deployed producer and consumer versions, fresh EU-Ireland cohort scans, evidence/coverage review, then article and social-card updates with the new report links, scan date and methodology version. Preserve all original reports. Do not substitute a local simulation for a new scored report or claim that missing capture is a clean result.

## Cost and references

No AWS scan, new browser run, model call, lane, timeout increase, publication wait or standing capacity was added. Request-header inspection is asynchronous inside the existing window. Estimated incremental metadata/CPU cost is below $0.50/month at 100,000 scans with existing retention and typical bounded inventories, disclosed before implementation. No deployment or production scan was performed.

Primary technical references:

- [Cloudflare RUM data and storage behavior](https://developers.cloudflare.com/speed/observatory/rum-beacon/)
- [Cloudflare collection endpoints](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Google consent-mode behavior](https://developers.google.com/tag-platform/security/concepts/consent-mode)

These describe protocol purpose and supplier behavior. The scoring policy is a product risk policy, not a legal determination.
