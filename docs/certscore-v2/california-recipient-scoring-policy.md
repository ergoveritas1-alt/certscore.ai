# California choice-enforcement recipient policy

Owner-authorized local implementation, October 17, 2026. Deployment remains
unauthorized. This supersedes the flat California-only 15-point choice effect
for new canonical materializations; the EU scoring policy is unchanged.

| Distinct supported recipients | Total points |
| --- | --- |
| 1 | 15 |
| 2 | 25 |
| 3 | 32 |
| 4 | 37 |
| 5 | 40 |
| 6 | 43 |
| 7 | 45 |
| 8 or more | 47 |

The initial 15 includes the first recipient. Independently verified GPC receipt
with an applicable recorded sale/sharing opt-out still off can trigger that
initial effect without a collection recipient. It never adds another 15 on top.

Only verified successful advertising/marketing collection events qualify.
Libraries, generic vendor contacts, unchanged analytics and storage presence
alone do not qualify. Existing GPC main-document delivery, original source hash,
session binding and representative-document requirements remain authoritative.
An incomplete paired comparison or unrelated capture does not erase a verified
positive event. Failed or unverifiable evidence remains neutral.

The existing producer retains bounded event-to-canonical-entity attribution
under `canonical_collection_recipients.v1`, through the canonical vendor
registry. Related products and endpoints of one entity count once. Explicit
opt-out evidence resolves its verified endpoint-rule provenance through the
same registry. Missing or ambiguous recipient identity cannot add increments;
an otherwise verified collection concern can still trigger the initial 15.

Both observations remain separate findings. After concern policy and unified
projection, the CA score unions eligible entity IDs from GPC and explicit
opt-out observations and applies one shared family total. It neither sums the
two totals nor takes their maximum when their supported recipients differ.

These are product risk weights, not statutory fines or a determination that
CCPA applies to the operator or that a legal violation occurred. Calibration
uses the offline `scripts/calibrate-california-choice-enforcement.ts` replay.
Record evidence quality and recipient grouping across varied retained sites
before deployment; a convenience cohort does not establish precision/recall.

No new browser run, invocation, wait, model call or storage request is added.
Estimated incremental retained JSON storage is below $0.50/month at 100,000
scans with 30-day retention (bounded to 100 attributed events per scan).
This is within the repository's pre-approved below-$1/month threshold.

## Local endpoint and response-confirmation repair — October 18, 2026

Resolver v6 adds narrow collection rules for Google's
`cm.g.doubleclick.net/pixel`, Amazon's `s.amazon-adsystem.com/iu3`, and
`aax.amazon-adsystem.com/e/dtb/bid`. Nearby paths, bootstrap libraries and
generic vendor contacts do not inherit collection qualification.

Response status is retained before optional header/body enrichment. A bounded
completion fallback checks at most eight previously unconfirmed, completed
requests per visit, using the browser's exact Request/Response object binding.
It adds no network visit, observation window or post-freeze write. It never
uses URL/time correlation to invent a historical response.

Verified retained Ars Technica worker bytes support Google (HTTP 302 at 7.90 s)
and Amazon (HTTP 200 at 10.21 s). Canonical local reassessment changes CA 96 to
71: the shared two-recipient effect is 25 and the existing WCAG effect is 4.
EU remains 70. Original worker bytes and session hashes are unchanged; events
without response confirmation remain neutral. This reassessment made zero
public-site contacts. The completion fallback was also verified against a
local HTTP fixture with a response body that never finishes.

Incremental bounded compute/metadata is estimated below $0.50/month at 100,000
scans, within the below-$1 preapproval. No added model call, browser visit or
wait window is introduced. Changes and reassessment remain local; no deployment
is authorized.

The subsequent local cohort replay covers the latest retained California report
for each of 26 recent public sites. Every original GPC worker hash is preserved;
no new site visit or model call occurs. GEICO changes 65→60 (Amazon as fourth
recipient), Fandango 51→48 (Google as fifth), and MSNBC 91→66 (Adobe and Google).
Vianet changes unavailable→81 because canonical refresh replaces its stale v8
rights score-effect version with the current policy; its GPC evidence and
finding identities are unchanged. All EU scores are unchanged. Full per-report
before/after artifacts are retained under
`artifacts/ca-retained-gpc-rollup-2026-10-18/`.

The report's optional GPC timeline is a descriptive projection of the surfaced
canonical finding. It uses the GPC visit clock, verified delivery, earliest
qualifying event per recipient, and retained observation end. Untimed events
do not receive invented timestamps. It creates no concern or score effect and
adds no capture work or recurring cost. Single-page report snapshots omit the
starting-page qualifier and the visible score label; site-scan context remains.
