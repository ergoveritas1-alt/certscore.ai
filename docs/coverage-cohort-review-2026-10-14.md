# Earlier-site coverage review — October 14, 2026

Reviewed 26 retained/full local scan records across the ten-site earlier cohort.
Four new serial scans were authorized by the owner's request for more recent
coverage where necessary. No deployment, production scan or historical assessment
rewrite. Patagonia and Drupal remained access-limited and were not contacted again.
The SITS contact hold remains in force.

## Site-by-site evidence

Counts below are the **persisted CMP report statuses**, not a comparable coverage
score: older report versions and specific Incomplete reasons differ. In particular,
changing Not assessed to Incomplete is diagnostic clarity, not new evidence.

| Site | Not assessed | Incomplete | Main reason / opportunity | WCAG rules retained |
| --- | ---: | ---: | --- | ---: |
| Ars Technica | 7 | 5 | Fides Options unresolved; parent-company policy ownership unverified; changing frames discard accessibility output | Unknown |
| AT&T | 6 | 6 | CMP readiness incomplete; policy requests returned HTTP errors; changing frames discard accessibility output | Unknown |
| Sentry | 2 | 8 | No first-layer banner or controls observed; optional preference worker cancelled at the publication barrier | 62 |
| FullStory | 10 | 0 | Hidden preferences entrance; chat iframe covers A/R geometry; consent receipt not semantically confirmed | 62 |
| IKEA (reference) | 2 | 0 | Service identities and consent registration unverified; three additional criteria partially assessed | 62 |
| Georgia Tech | 8 | 0 | Drupal first-layer controls observed, but deeper choices and semantic registration not verified | 62 |
| HubSpot, clean process | 3 | 5 | Preference panel binding unavailable; privacy-link reachability, consent registration and CMP expiry unverified | 62 |
| Weather.com | 12 | 0 | Incomplete consent proof; preference readiness/capture consumes allowance; changing frames discard accessibility output | Unknown |
| Patagonia | — | — | Unavailable/non-representative page; keep no-go separate from unknown checklist items | Not reportable |
| Drupal.org | — | — | CAPTCHA; do not retry or infer substantive findings | Not reportable |

FullStory and Georgia Tech retain report v1 conclusions. Weather's new pre-restart
report omitted v3 preference diagnostics; its source packet retains cancellation
and checkpoint information. These records were not rewritten. Unknown WCAG totals
are not zero-rule or zero-issue conclusions.

The eight usable latest reports contain 50 unconfirmed policy checks; 40 are
concentrated in IKEA, Ars, AT&T and Weather. Their causes differ and should not be
treated as a generic request for more model or browser time.

## New scans and direct verification

| Target | Scan ID | Coordinator elapsed | Outcome |
| --- | --- | ---: | --- |
| Weather.com | `6687f0ce-c8c2-423c-8c27-ec2385fd80a6` | 20.188 s | CMP still insufficient; 3.366 s WCAG execution invalidated by frame changes |
| Sentry, exact previously retained final URL | `fcf47867-f63d-4ef7-b100-63db1ae21ab4` | 12.439 s | No A/R observed; 62 WCAG rules; preference worker cancelled at the existing barrier |
| HubSpot | `1f7f8ec3-663c-4e21-a181-574830062437` | 20.073 s | Banner, Reject and prominence verified; retained v3 preference diagnostic omitted by running local materialization |
| HubSpot after restarting localhost | `a32e83a1-416a-4211-b9b6-436d659d5c09` | 19.354 s | v5 CMP assessment and five precise panel-binding limitations survive persistence and export |

Review the clean HubSpot report at
<http://localhost:3000/scan/a32e83a1-416a-4211-b9b6-436d659d5c09#cmp-details>.
Its four Observed criteria include banner, Reject, prominence and privacy-link
presence. The existing post-Reject-click Review remains distinct from confirmed
refusal: both semantic registrations are unconfirmed. WCAG findings remain
contrast (9 elements), frame title (1), list item (2), and nested interaction (3),
with an additional contrast manual-review group; 52 total affected/review elements
and 16 retained examples. No functionality or compliance claim is inferred.

All visits used the local simulated DAG and existing network identity, region
configuration and capture allowances. They are not production regional egress
verification.

## Recommended implementation order

### 1. Protect basic evidence from optional-worker cancellation

The preference worker has a 17 s allowance and a 19 s outer join cap, but the
coordinator only takes output already completed at the existing report barrier.
Sentry published at roughly 12.4 s and cancelled the worker. Reserving the last
second of a 17 s worker cannot protect facts on that faster scan. Weather reached
control inventory around the deadline without a completed basic checkpoint.

Retain small, typed, document-bound basic facts in the already-required owner
lanes: initial consent choices/configuration in consent-proof, runtime cookies and
expiry in runtime-evidence, and policy links/text in policy-evidence. Leave the
isolated Options visit responsible for genuinely deeper evidence. Preserve lane
ownership and pass new typed evidence through assessment, persistence, normalized
concerns, policy and shared projection. Do not borrow another session's visuals or
create display fallbacks. Do not add a tail wait, retry or late publication.

Within the preference worker, perform cheap relevant-candidate discovery before
expensive geometry. It currently hit-tests up to 300 links before filtering them
to privacy candidates. Classify bounded names/URLs first and hit-test only the
retained candidates, with identity revalidation. This is a concrete optimization
lead, not a claim that link geometry alone caused Weather's deadline failure.

### 2. Preserve stable main-document WCAG evidence

Ars, AT&T and Weather discarded completed axe output because any child-frame
change invalidates the entire audit. Their executions finished in approximately
2.5–3.4 s; increasing the existing 8 s audit allowance would not fix this cause.

Use a versioned main-document/frame provenance contract to preserve independent
stable-page results from the same existing axe execution. Exclude unstable-frame
and frame-dependent results, retain an explicit scope limitation, and never claim
complete frame coverage or an absence from the surviving subset. Keep original
historical evidence unchanged. This requires focused capture-to-projection tests,
not simply removing the frame-change guard.

The existing example allocation is effective: Sentry keeps 10 examples for 72
affected/review elements; IKEA 8 for 49; HubSpot 16 for 52. Keep the full configured
rule set and counts. Reducing the rules or collecting every repeated element is
not the useful tradeoff here.

### 3. Repair policy eligibility and completeness at the appropriate scope

- **IKEA:** the target-owned combined privacy/cookie statement is fetched, with
  47,335 text characters retained. Its combined classification fails the
  standalone-policy/body eligibility path, leaving ten topics unconfirmed.
  Preserve the canonical combined-surface classification through privacy-topic
  extraction and eligibility. Cookie-only documents must remain distinct. This
  repair can reuse the same response; it does not require another model call.
- **Weather:** document text is retained, but bounded section text marks overall
  content coverage truncated and propagates truncation to topic diagnostics.
  Evaluate completeness of each retained section/topic independently. A fully
  retained, semantically sufficient passage may support that topic while other
  sections remain limited. Do not turn a truncated clause into a positive or
  infer topic absence from a bounded extract.
- **Ars:** the substantial fetched Condé Nast policy is classified as a service
  provider because target ownership is not verified. Add an evidence-backed,
  versioned publisher/controller relationship only when the retained source
  supports it; never trust a cross-domain footer link alone.
- **AT&T:** retain the specific HTTP retrieval failures. More semantic processing
  cannot recover a policy body that was not retrieved; do not bypass access guards.

Deduplicate equivalent policy candidates and identical content before spending
bounded retrieval/extraction slots on tracking-parameter variants or repeated
locale copies. Allocate section evidence across topics before repeated passages.

### 4. Close the gap between control recipes and semantic verification

Osano, HubSpot and Drupal have recognized control recipes, but the generic
decision decoder does not establish their provider-specific encoded decisions
from the retained receipts. Their unconfirmed outcomes are not simply timeout
failures. Prioritize documented, versioned semantic readers/decoders with complete
category coverage and action-anchored witnesses in the existing observation work.
Receipt IDs, cookie changes, one category, a closed banner and an opt-out boolean
must not become proof of all-purpose refusal or acceptance. Keep post-click
factual observations and confirmed-refusal findings separate.

For deeper inspection, add registered panel bindings only where retained evidence
and fixtures establish the correct unique panel. HubSpot currently stops before
clicking because its Options control cannot bind to a supported panel. FullStory's
hidden preferences and real chat obstruction are different cases; do not invent
an actionable control or click unrelated chat UI.

## How to judge optimization quality

Use per-domain minimum evidence coverage, followed by bounded breadth across
rules/services/topics. Prioritize binding, core facts and one useful proof for
each distinct finding before additional examples. Keep total counts and explicit
overflow/omission accounting. Blind top-20-cookie/top-10-link caps can systematically
hide minority vendors or findings.

Track these separately from the raw number of Not assessed labels:

- Missing core observations, with their exact cause.
- Evidence captured but lost during assessment/persistence/projection.
- Genuine capability/scope limits and items not applicable after complete proof.
- Full counts versus representative examples retained.
- Actual domain/lane timing and budget consumption, including cancellation at the
  report barrier; overlapping lane durations must not be added.

No-forms checks can become Not applicable only after complete verified form
discovery. A missing banner or adapter is not proof that a CMP lacks a feature.
An offscreen privacy link is not proof that the policy is inaccessible.

All eight usable sites have indeterminate paired GPC response assessments, while
seven retain completed independent bounded GPC observations. The existing observed
facts already preserve delivery/activity separately. Keep those facts useful;
do not add waits or claim a response merely to remove an indeterminate badge.

## Verification, repair and costs

The running local materializer omitted v3 CMP audit diagnostics for the first
HubSpot/Weather packets. Current direct and full materialization replay preserved
them. Restarting localhost and performing the one additional HubSpot scan verified
v5 audit persistence, five specific limitation codes, and shared API/SDK/MCP
results. This was local source/runtime drift, not absent source observations.
A new regression test covers v3 diagnostic preservation through full consent
materialization, malformed-version failure and unchanged first-layer conclusions.

72 assessment/materialization tests and web typecheck passed. All four fresh
producer bundles verified against terminal SHA-256 metadata. Twelve fresh
CMP/accessibility/policy section checks matched public export, SDK reconstruction
and in-memory MCP pagination. This parity check is supplemented by source-packet
to-persisted-assessment checks: matching downstream surfaces alone can all repeat
the same upstream omission. No stored result was repaired or upgraded on read.

Canonical selection used successful central all-channel ledger exports, held and
blocked-target exclusions, and the explicit owner-requested cooldown exception.
Three contacts and the additional verification contact were persisted with separate
idempotent keys. The manual ledger candidate was reviewed. Temporary local quota
admission exceptions were restored to 20 immediately after each submission; quota
source SHA-256 remained
`bd443b8bbbeec2f30cd5f1963231394a615843b3c6049771c7bb96ddc62afb68`.

Ignored local evidence: `artifacts/coverage-cohort-review-20261014/`, including
`cohort.json`, source/persisted traces, receipts, export verification and logs.
Estimated one-time scan/operational spend is below $0.50. No new recurring service,
model call policy, deadline, retention period or production behavior was added.
The four implementation priorities above are recommendations, not deployed or
implemented changes. Estimate and obtain any required cost approval before a
future implementation changes paid calls or storage work.
