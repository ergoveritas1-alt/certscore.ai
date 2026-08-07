# Scan Quality Calibration & Regression Program

This is the canonical operating process for ongoing scanner-quality calibration.
It exists to turn real-site review into repeatable evidence checks rather than treating
the latest few scans as an acceptance sample.

The program is internal diagnostic infrastructure. It does not create production
findings, alter customer-facing scoring, or establish legal conclusions.

## Ownership

- **Luna owns calibration quality:** benchmark composition, lane expectations,
  evidence review, baseline changes, and regression decisions.
- **SO owns production operations:** scheduled canaries, deployment-triggered runs,
  alerting, artifact retention, and escalation when a live canary regresses.
- **WC01 remains the implementation boundary:** scanner evidence, contracts,
  normalized concerns, policy, projections, and report behavior stay in their
  existing packages and pipelines.

If Luna and SO are represented by different planning systems, this document is the
source-of-truth handoff between them: Luna approves the quality baseline and SO
executes the operational canary.

## Calibration model

The canonical benchmark is the set of stable capability lanes below, supported by a
layered calibration pyramid. Public domains are replaceable evidence sources, not the
baseline itself.

## Initial consent-quality target

The initial release target for the consent-controls lane is **95%**, measured
separately for banner presence and each first-layer control field (accept, reject,
and options). The target applies only to normally reachable, representative pages
with human-adjudicated ground truth. Blocked, challenged, blank, or otherwise
non-representative pages are measured in the no-go/incomplete lane instead of being
silently counted as consent negatives.

For the initial gate, require:

- at least 95% exact A/R/O agreement on loaded, adjudicated pages;
- at least 95% per-field agreement for accept, reject, and options;
- no more than 1% false-positive control claims;
- retained screenshot or equivalent visual proof for every loaded adjudicated page;
- no material regression in cookies, storage, trackers, policy, transport, or no-go
  evidence; and
- no more than 0.5 seconds median or 2 seconds p95 paired latency increase.

The 95% number is a release target, not a claim that a small public cohort proves
95% internet-wide accuracy. Promote a baseline only after the retained replay corpus
and the region-stratified adjudicated sample meet the target. The A/R/O gate accepts
the thresholds explicitly through `--min-loaded-exact-agreement` and
`--min-field-agreement`; do not lower them to make an unstable cohort pass.

1. **Deterministic fixtures** run for every scanner change and provide exact,
   repeatable coverage without public traffic.
2. **Retained replay** runs the change against bounded, sanitized evidence captured
   previously. Replay is refreshed deliberately, not on every change.
3. **Owned canaries** provide live end-to-end coverage on domains CertScore controls.
4. **Rotating public samples** provide ecological coverage from a larger approved
   inventory without repeatedly contacting the same domains.
5. **Passive production sampling** reviews scans users already requested. It creates
   bug leads and post-deploy signals without generating additional scans.

Owned cross-origin consent, policy, runtime-storage, and transport canaries are
registered in `docs/certscore-v2/ergoveritas-owned-live-canaries.json`. Their source
pages live on the independently hosted `ergoveritas.com` origin. They are no-index,
artifact-only calibration surfaces and do not authorize consent-control interaction.
Their expected observations are fixtures for scanner regression review, not production
findings about the ErgoVeritas site.

The approved public-target inventory is registered in:

- `docs/certscore-v2/scan-quality-calibration-manifest.json`
- `docs/certscore-v2/calibration-urls-lab-50.txt`
- `docs/certscore-v2/scan-quality-calibration-ledger.json`

The JSON manifest is authoritative for lane expectations, layer requirements, and
public contact safeguards. The URL list remains the input format consumed by the
Scan Lab runner, and the registry check requires both files to stay in exact agreement.
The complete inventory must not be run as the routine acceptance gate.

The inventory is intentionally stratified across publishers, ecommerce, SaaS,
healthcare, finance, government, global/CMP-heavy sites, behavioral analytics,
and likely no-go or headless-sensitive sites.

## Required calibration lanes

Every qualifying run must report these lanes separately:

| Lane | What must be reviewed |
| --- | --- |
| Consent controls | Retained first-layer surface, accept, reject, preferences/options, locale, and late-control evidence. |
| GDPR transparency | Policy-surface discovery, usable policy text, canonical topic extraction, and honest Not testable reasons. |
| Transport evidence | HTTPS delivery, certificate/transport observations, redirect behavior, and timeout/unknown handling. |
| Third-party attribution | First-party versus third-party classification, final-document redirects, vendors, cookies, and requests. |
| No-go resilience | Blocked, captcha, timeout, unsupported, and incomplete scans with explicit reason propagation. |
| Language inference | Best-effort primary language with evidence source and unknown fallback. |

The lanes are the regression surface, not a set of hard-coded claims that every site
must have a banner, reject control, tracker, or GDPR topic. A site may legitimately
produce `observed`, `gap`, `not_testable`, `limited`, or `no-go`; calibration reviews
whether the status is supported by retained evidence and whether it is stable.

## Public-target selection and contact policy

For a scanner release, select 8–12 eligible public targets, with 10 as the default.
Stratify the sample across the required lanes and roles. Rotate through the inventory
so the capability mix remains stable while individual domains change.

The production contact ledger automatically records scan creation and outcomes across
customer, API/SDK/MCP, admin, preview, browser, validation, and other channels at the
shared database boundary. Before a live calibration run, the workflow exports those
records and merges them with the repository-controlled manual ledger. Selection fails
closed if central history is unavailable. The workflow also requires explicit SO
authorization and is deliberately not scheduled. The following rules are mandatory:

- honor repository-controlled live-test contact holds in
  `packages/certscore-scan-core/src/public-test-contact-holds.ts`; these holds apply to
  CertScore-initiated calibration and diagnostic traffic, not ordinary customer scans;

- wait at least 28 days before selecting the same domain again;
- run at most one calibration scan for a domain at a time;
- do not automatically retry a blocked, rate-limited, captcha, or other no-go result;
- do not switch regions or identities to bypass a site's restriction;
- move repeated no-go targets to `do_not_calibrate` and replace them with another
  target serving the same lane/role;
- use `eligible`, `cooldown`, `blocked`, and `do_not_calibrate` as the operational
  eligibility states.

A blocked result is useful no-go-resilience evidence. It is not permission to increase
contact frequency. Retained evidence should be inspected before any rescan request.

## Operating loops

### Every scanner change

1. Run focused deterministic fixtures for the affected lanes.
2. Run the bounded retained-replay set for those lanes.
3. Review every gained or lost evidence row, status transition, and material score
   change.
4. Classify differences as intended change, evidence improvement, evidence loss,
   runtime instability, extraction error, projection error, or unresolved review.

### Scanner release

1. Complete the change-level fixture and replay gates.
2. Run the owned live canaries.
3. Select and run a cooldown-eligible 8–12-site public sample.
4. Verify completion and retain the summary plus bounded evidence artifacts.
5. Compare lane-level results with the last Luna-approved baseline.
6. Promote a new baseline only after Luna approves the evidence review.

### Post-deploy and anomaly review

1. Review a passive sample of 10 recent, normally initiated production scans across
   useful lanes and outcomes. Do not create replacement scans to fill the sample.
2. Treat those scans as canaries and bug leads, not acceptance truth.
3. For an anomaly, inspect retained evidence and the full projection chain first.
4. Request a rescan only when retained evidence is insufficient or stale and the
   domain is otherwise eligible under the contact policy.

Useful commands:

```bash
pnpm v2:calibration-registry-check
pnpm v2:calibration-ledger-export \
  --ecs-oneoff \
  --out artifacts/v2-scan-quality-calibration/effective-eligibility-ledger.json
pnpm v2:calibration-target-select \
  --ledger artifacts/v2-scan-quality-calibration/effective-eligibility-ledger.json \
  --limit 10 \
  --rotation-key <release-or-week-key> \
  --out-urls artifacts/v2-scan-quality-calibration/selected-targets.txt \
  --out-selection artifacts/v2-scan-quality-calibration/CalibrationTargetSelection.json
pnpm v2:wc01-scan-lab-cohort \
  --urls artifacts/v2-scan-quality-calibration/selected-targets.txt \
  --profile full \
  --limit 10 \
  --out-dir artifacts/v2-scan-quality-calibration
pnpm v2:wc01-verify-scan-lab-cohort \
  --summary artifacts/v2-scan-quality-calibration/Wc01V2ScanLabCohort.summary.json \
  --min-sites 10
pnpm v2:privacy-policy-capture-gate \
  --candidate-dir artifacts/v2-scan-quality-calibration/privacy-policy-candidate \
  --baseline-dir artifacts/v2-scan-quality-calibration/privacy-policy-baseline \
  --expectations artifacts/v2-scan-quality-calibration/privacy-policy-expectations.json \
  --out-dir artifacts/v2-scan-quality-calibration/privacy-policy-candidate
pnpm v2:calibration-ledger-record \
  --summary artifacts/v2-scan-quality-calibration/Wc01V2ScanLabCohort.summary.json \
  --out artifacts/v2-scan-quality-calibration/scan-quality-calibration-ledger.candidate.json
pnpm v2:calibration-contact-persist \
  --ecs-oneoff \
  --run-key <idempotent-run-key> \
  --summary artifacts/v2-scan-quality-calibration/Wc01V2ScanLabCohort.summary.json
```

The ledger recorder never silently overwrites the canonical ledger. It writes a
candidate beside the run artifacts. SO reviews that candidate and commits it as the
canonical ledger before another public calibration run. This keeps contact history
auditable and prevents a failed or partial workflow from corrupting eligibility state.
Production central-ledger reads and writes use the approved ECS psql one-off boundary;
GitHub-hosted runners must not connect directly to the private production database.
The workflow also persists calibration contacts into the central event table using an
idempotent run key, so subsequent selections see them even before the repository
candidate is committed.

The privacy-policy capture gate requires an explicit reviewed expectations file shaped
as `{ "sites": [{ "domain": "example.com", "privacyPolicyExpected": true,
"evidence": "review note or retained artifact reference" }] }`. It excludes no-go and
normally unreachable scans from capture and latency denominators, gives no credit to
URL-only guesses, and fails closed when reviewed expected-policy coverage is too small.
Its default release thresholds are at least 30 normally reached candidate and baseline
sites, at least 83% policy capture, at least 15 reviewed expected-policy sites, no more
than 3% reviewed false negatives, no invalid captured evidence, no more than 1 second
median scan-latency increase, and no more than 5 seconds p95 increase. Latency uses
paired-domain deltas when enough paired artifacts exist; otherwise Luna must confirm
that the baseline and candidate cohorts are composition-matched before treating the
result as a release decision.

The public live-sample workflow is manually dispatched for a scanner release after SO
confirms target eligibility and cooldown. Its automatic 10-site slot selection rotates
across five non-overlapping inventory segments, but the attestation remains necessary
because calendar rotation cannot see customer scans, ad-hoc calibration, or block
history. A live run may be skipped when scanner secrets are unavailable; that is an
operational limitation and must not be reported as a passing quality result.

## Release decision rules

- A single recent scan is a bug lead, not a calibration pass.
- Three recent scans can identify a failure class, but cannot establish cohort-wide
  accuracy.
- Ten passive production scans can identify operational patterns, but cannot replace
  fixtures, replay, owned canaries, or the release sample.
- No regression may be accepted solely because a screenshot looks correct; the
  structured evidence and projection chain must also be inspected.
- A reduction in `not_testable` is only an improvement when the newly observed status
  has valid retained evidence.
- A score increase is not automatically positive; score changes must be explainable
  from evidence and policy changes.
- Baseline labels and expected evidence must never be changed to make a failing run
  pass without a review note and owner approval.

## Registry evolution

The registry defines lane coverage and review obligations but intentionally does not
make a public site's current output a permanent expected status. Durable expectations
belong in deterministic fixtures and bounded replay artifacts. Public targets may be
added, retired, or replaced after Luna reviews their lane/role coverage and SO reviews
their operational eligibility. Inventory changes must preserve coverage without
weakening the approved lane baseline.

The central ledger and repository ledger jointly enforce recorded contact history.
Unattended public calibration remains disabled: explicit authorization is still
required, no-go targets still require human review before re-enablement, and inventory
composition remains a Luna baseline decision.
