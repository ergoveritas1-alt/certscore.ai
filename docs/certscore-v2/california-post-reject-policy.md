# California assessment of post-Reject evidence

Owner-authorized local implementation and retained-evidence replay, October 21,
2026. No deployment, new browser work, Options/Manage opening, model call or
historical report rewrite is authorized.

## Scope and qualifying evidence

Preserve the EU non-essential-presence policy unchanged. California separately
assesses source-bound requests on completed, authorized Reject paths. Require
verified target/control/frame provenance, completed bounded after-click capture,
positive post-click request ancestry and the retained original packet hash.
Confirmed semantic registration is not required. Failed, cancelled, changed-target
or unjoined paths remain neutral.

A reviewed necessary-only control or explicit Reject/Decline/Deny All [Cookies]
label establishes cookie-tracking rejection for this rule, not rejection of every
CCPA processing purpose. Ambiguous, partial-category and unsupported labels remain
unknown. This initial scope includes cookie-based advertising/identity collection;
it does not infer a statutory sale/sharing request from every generic Reject.

October 22 scope correction: new v4 assessments also accept exact direct Reject
labels whose retained v2 action context and matching control read establish the
cookie-consent surface. This resolves the earlier narrow label gate; it does not
relax collection or response requirements. V1-v3 assessments retain the preceding
scope. See [retained Reject scope policy](california-reject-scope-policy.md).

Initial worker requests optionally retain `california_reject_request.v1`: exact
request ID, method, timestamp, origin/path, original URL hash, same-Response HTTP
status, body-presence disposition, canonical entity attribution and request-local
sale/sharing qualification. The worker reads existing Request/Response objects;
there is no additional network operation. At most 32 candidate requests per
packet carry this metadata. No raw identifier,
request body or GPP string is added to retention. Opaque/uninspected bodies remain
neutral. Successful collection requires a 2xx/3xx response and bounded completion.

Fresh capture now uses `california_reject_request.v2` for bounded supported POST
bodies and full same-Request header inspection, prioritizing distinct recipients
within that same 32-request cap. It shares the existing 48 measurement/header
inspection slots. Require complete v2 proof; preserve v1 historical meaning. See
`reject-request-proof-policy.md` for exact bounds, exclusions and slot reservation.

Use the same current closed endpoint/identity/audience qualification and
restricted-processing/GPP checks as GPC. A script download, generic advertising
contact, analytics label, cookie snapshot, attempted cookie write or unknown
purpose cannot establish a qualifying California recipient. RDP/NPA/LDU, declared
US Privacy opt-out, decoded GPP restrictions and unresolved privacy signals remain
neutral for that request. Earlier/later CMP states cannot fill missing request
parameters. Restricted declarations are evidence limitations, not proof of honoring.

Historical sanitized URLs do not establish that the original request had no
restriction flags, identifiers or opaque payload. Do not reconstruct qualification
from those URLs, cookie names or response setters. Preserve missing proof as
insufficient evidence. Independent retained positive facts may survive unrelated
capture limitations; a limited comparison is not an automatic veto.

## Canonical pipeline and scoring

Verified worker packet -> typed report projection with parent scan/target identity
-> persisted `california-post-reject.v1` assessment -> normalized concern -> concern
policy -> `california_post_reject_collection` unified finding -> CA score/API/Admin.
Re-derive the persisted assessment from its source projection before admitting a
concern; source drift or malformed request binding fails closed. Prefer retained
qualified requests within the 32-row assessment cap and mark truncated coverage.

Union eligible canonical entities across Reject, GPC and explicit opt-out evidence
and apply the existing shared 15/25/32/37/40/43/45/47-point family once. A recipient
seen on multiple paths counts once. Do not add standalone family totals, inflate
GPC# with Reject recipients, or change the separate capped GPP propagation family.
Applied new assessments use `california-regulatory-posture.v14-reject`; historical
assessments without new evidence keep their original interpretation. Customer
reports retain factual collection entities and visit-relative timestamps without
point explanations. This is a product risk signal, not a legal violation finding.

## Budgets and limitations

No lane, invocation, browser visit, Options panel, retry, wait, model call,
worker-size increase or retention extension. Bounded in-memory qualification and
metadata are estimated below $0.50/month incremental at 100,000 scans and existing
30-day retention, within the below-$1 preapproval. Actual replay sizes and results
are retained in `artifacts/california-post-reject-2026-10-21/`.

A replay cannot recover facts the original producer did not retain. Zero
additional qualified deductions therefore does not establish that post-Reject
sale/sharing stopped; fresh scans after an authorized deployment are needed to
measure coverage from the new capture fields.


October 22 revision: new assessments use the [qualified-disclosure policy](ca-qualified-disclosure-policy.md). NPA alone is no longer an automatic veto; historical v1 assessments retain the preceding rules. No cookie-match prerequisite applies to supported CA collection.
