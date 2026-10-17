# GPC bounded observation in production

Release authorization, October 17, 2026: the owner requested preparation and
deployment once ready. Earlier local-only/hold statements below describe prior
verification stages. Release remains subject to canonical AWS readiness checks;
existing observation, scoring and approved cost bounds are unchanged.

Owner-authorized September 11, 2026. This integration follows the request to finish
the disabled prototype, test it locally, and deploy through the canonical AWS
workflow. Incremental compute and evidence storage are approved up to $5/month at
100,000 scans/month. It introduces no browser lane, model call, retry, longer
module timeout, or publication after the canonical barrier.

## Evidence and meaning

New `certscore.gpc-response-assessment.v3` records retain the unchanged v2 paired
response assessment plus `certscore.gpc-bounded-observation.v1`. These answer
separate questions. A complete bounded observation does not mean GPC was honored,
that sale/sharing stopped, or that a site complies with California law.

The observation retains actual main-document Sec-GPC and navigator readback,
source/session/document hashes, terminal GPP probe status, current CMP-recorded
sale and sharing states, optional CMP GPC signal, supported acknowledgment-search
coverage, and directly classified request/collection counts. Unknown CMP state
remains unknown when its API is absent or unsupported, even when the observation
is complete. Recorded state never claims GPC causation. Resource requests and
collection requests remain distinct; neither is a legal sale/sharing conclusion.
A zero classified count is bounded to a complete request capture and the canonical
classification registry. It is not evidence of no tracking outside that window.

The scope is `main_document_and_retained_http_requests`. Full frame/worker delivery
and paired comparison remain independently limited when their proof is missing.
Representative-page and all-submitted denominators must be reported separately.
ErgoVeritas canaries never enter public-cohort statistics.
Completion additionally requires representative homepage-runtime evidence from
the GPC worker's own verified bundle. Its no-go or unknown access cannot borrow
successful access from the baseline lane; retain its raw window facts with an
explicit `representative_access_not_verified` limitation.

## Same-request pre-transmission blocks

Session and completion contract v2 preserve browser attempts blocked before any
HTTP transmission separately from actual delivered HTTP requests. Playwright
1.58.2 Chromium forwards `loadingFailed.errorText || blockedReason` to the exact
public Request object's failure record. Only exact `csp` and `mixed-content`
reasons qualify, with missing Sec-GPC, zero start time, absent request/response
network timing, no response, no service-worker ownership, and a main-frame loader
that matches the committed document. Provisional UA/referrer headers are not
wire-delivery proof. Keep the original missing Sec-GPC value unchanged.

All other requests still require their own retained Sec-GPC: 1. Generic blocked
errors, aborts, network failures, redirect-hop ambiguity, another loader, overflow,
or missing proof remain limited. CDP diagnostic URL/method/timing correlation
cannot supply a header or a block classification. Real localhost CSP and
mixed-content fixtures verify that the blocked resource server receives nothing;
adverse tests reject response/timing/worker/loader conflicts and unknown reasons.
These tests must pass when upgrading Playwright or Chromium.

Historical session/completion v1 packets retain their original rules. Do not
backfill pre-transmission evidence or recompute stronger historical conclusions.
The fresh v2 completion gate keeps the same domains/eligibility rules, at least
200 representative observations, and a 95% Wilson lower bound strictly above 95%.
This measures bounded evidence completion, not claim precision or legal outcomes.

## Canonical retention and publication

The isolated GPC worker opts into production capture through server-owned
`retainGpcObservation`. Public dispatch cannot inject an in-process callback.
The session is schema-validated and hashed into its producer binding, then retained
inside the existing worker CanonicalEvidenceBundle. No new S3 object is required.
The coordinator reuses the original checksum- and size-verified worker bytes;
it verifies scan, capture, document, interval and session identity before building
v3. It never constructs a fictional retained sidecar or uses configured delivery
as observed delivery. Failed or unverifiable workers remain explicitly limited.

The typed assessment follows existing persisted runtime assessment -> normalized
concern -> concern policy -> unified finding -> report/Overview/Admin/API/Pulse
projection. Standalone public API schemas, OpenAPI and SDK types are generated
from the canonical bounded-observation schema with a regression drift check.
Old v1/v2 response records remain their original versions on read.

Observation completeness and request activity add no scoring effect. The approved
California-only 15-point paired-response policy is unchanged and still requires
its original determinate comparison and full-count eligibility. An indeterminate
comparison remains score-neutral even with a complete observation. Existing
resource-only scoring limitations are not relabeled as proven sale/sharing.

## Rollout and evidence quality

### September 14 navigation recovery and sparse-page finalization

The owner approved an incremental allowance of $50/month at 100,000 scans/month
for the bounded navigation-recovery repairs. The planning estimate is $5–$15/month
compute, with a roughly $31 high-duration sensitivity before evidence and
downstream overhead. Recovering previously short failures can increase actual
runtime despite unchanged timeout caps. Release measurement must remain within
the approved allowance; this does not authorize extra lanes, scan invocations,
navigation candidates, model calls, longer timeouts, or late publication.

The existing one-second navigation-reset allowance includes stopping the failed
navigation, awaiting Chromium's exact main-frame error-document commit when its
page is briefly inactive, and committing the single about:blank reset. A pending
or failed reset prevents the next candidate. Preserve the original target error
alongside reset diagnostics. `ERR_EMPTY_RESPONSE` is a transport failure eligible
for the existing bounded URL candidates; unsafe-target and DNS guard failures
remain blocked.

For initially sparse pages, retain the GPC listener through the already-required
same-session page-confirmation work and perform the same single terminal semantic
read afterward. The overlapping document proof remains anchored before that
work, so navigation or URL drift invalidates it. The paired impact-capture freeze
retains its original position and policy. Cancellation, exhausted budgets,
overflow, missing headers and unverifiable finalization remain limited. The
estimated incremental retention/finalization cost is $0.10–$0.50/month, included
in the allowance above. Historical packets and assessments remain unchanged.

### Release verification

Deploy the compatible web/materializer and any affected validation consumers
before enabling the new scanner images in all three approved Lambda regions.
Require fresh localhost retained-artifact calibration, canonical contact-ledger
persistence, boundary regressions, latency/byte/cost measurement, clean committed
source, and the repository AWS preflight/deployment workflow. Verify serving SHA,
image parity and newly produced typed evidence before declaring production live.

Deterministic fixture truth establishes the implemented proof invariants. Luna's
review is model-assisted engineering review, not independent human adjudication.
Do not report an independently measured false-positive/false-negative or GPC
honoring rate from a completion benchmark. Any later stronger interpretation or
new scoring policy requires its own evidence and approval.

### October 17 matched passive settling — local approval

The owner approved up to **$50/month incremental at 100,000 scans/month** for
`matched_passive_settle.v1`, superseding the earlier prohibition on additional
settling only within this bounded scope. The approved implementation/testing is
local; deployment still requires separate authorization.

After the initial passive quiet gate times out, both runtime-evidence and GPC
may use up to **3,000 additional milliseconds** to await pending page activity and
complete the existing 250ms quiet requirement. The allowance does not depend on
a form screenshot reviewer or whether GPC is enabled. Quiet pages skip it. It
uses the existing browser/session/request tracker and stays inside the existing
module/parent deadline with the same atomic-inventory reserve. No lane, invocation,
retry, model call or late publication is added.

Preserve the earlier loading-parser and baseline form-readiness allowance by
subtracting time already consumed by matched settling from its existing ten-second
cap. A parsed pending-only GPC visit stops after three seconds; it cannot borrow
the form allowance. Cancellation, document changes, crashes, capture overflow or
unverified delivery continue to fail closed. The new settling policy and cap are
included in both conditions' browser-protocol fingerprint. The existing source-
bound quiet checkpoint proves whether capture actually settled; timing success
alone never upgrades evidence or creates a finding.

Cost estimate uses the repository-controlled 3,008 MB Lambda configuration and
$0.0000166667/GB-second compute planning rate. A conservative bound of three extra
seconds in each passive worker and coordinator is about **$44.06/month** at
100,000 scans. The owner-approved $50 ceiling includes bounded incremental evidence
storage and rounding. Actual cost depends on how many visits need the allowance
and whether the coordinator is already awaiting another lane. Additional report
latency is at most the three-second allowance attributable to this change, often
absorbed by parallel work. Existing parser/form recovery budgets are unchanged.

A completed pair with zero classified tracking in both visits is presented as
"No qualifying tracking activity observed." This describes the retained result;
it does not establish GPC honoring or a lack of activity outside the capture.
The owner-approved 15-point California choice-enforcement risk policy remains
independent and uses verified direct collection or recorded-choice contradiction
through the canonical concern/policy/finding path.

### October 17 capture retention repairs — local verification

Keep final redirected main-document and classified collection request/response
identities ahead of lower-priority samples during the existing bounded core
compaction. Large GPC window packets compete within that same budget; small
packets retain the existing bounded additive restoration. Overflow remains an
explicit limitation. Capture the response's directly observed HTTP status and
request identity synchronously, before asynchronous header metadata reads. The
optional response `metadataCapture` distinguishes pending, complete and limited
metadata; a pending read does not prove absent headers or cookies.

An independently retained GPC bounded observation uses its own verified lane's
representative-page access, challenge state and execution outcome. Unrelated DOM
inventory incompleteness does not invalidate an otherwise complete producer-bound
GPC session. The original byte/session/document/delivery/completion invariants
remain required. This does not relax paired comparison or advertising-collection
eligibility, and it does not make missing capture scoreable.

Policy retrieval divides its existing request allowance between a stalled apex
and its already-supported WWW fallback. Both remain within the original deadline;
there is no extra candidate, retry allowance or model call. More frequent use of
that existing fallback is estimated below $0.10/month additional network spend
at 100,000 scans, disclosed before implementation. Matched settling remains
within the separately approved $50/month ceiling. These repairs are local only;
no deployment is authorized by this entry.

### October 17 owner-requested positive-evidence scoring — local only

The owner requested that an incomplete overall pass must not hide a supported
GPC deduction. New producer assessments retain optional
`positiveEvidence.policyVersion=gpc_positive_evidence.v1` and the independently
verified representative-document state. WC01 policy
`california-gpc-response.v4-positive-evidence` accepts a source/session/document-
bound positive advertising collection event or retained acknowledged-GPC/current-
opt-out contradiction independently of unrelated request drops, frame/worker
coverage, and paired-comparison completion. Main-document header and navigator
readback remain required. Advertising collection still requires exact canonical
endpoint attribution and a directly retained successful response; a library,
unresolved request, failed response, unknown signal or blocked/unverifiable visit
is insufficient. This is a 15-point California risk effect through canonical
concern/policy/finding projection, not a legal determination.

California posture policy v9 keeps supported deductions numeric when unrelated
coverage is limited. A checksum-verified complete governing-policy source also supports a bounded
numeric score while unrelated coverage stays limited. Missing or truncated
policy alone cannot support a clean score. This does not invent absence findings,
change weights or remove the 15-point choice-family cap.
Existing persisted score generations remain unchanged. Legacy observations lacking
positive-evidence provenance keep the earlier complete-observation requirement.
Historical paired response records and their response/completeness states remain
unchanged. The public API/OpenAPI/SDK observation contract is synchronized from
the canonical schema; no separate MCP method or endpoint is introduced.
