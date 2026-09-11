# GPC bounded observation in production

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
