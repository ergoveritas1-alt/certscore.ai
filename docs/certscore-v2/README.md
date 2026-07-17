# CertScore v2 scanner/review foundation

CertScore v2 is an additive scanner/review architecture. It is intentionally separate from the current production web app and report UI in this phase.

```text
URL
-> certscore-scan-core
-> CanonicalEvidenceBundle.json
-> certscore-review-engine
-> ReviewResult.json
```

The guiding boundary is:

- Scan-core observes public-web/runtime evidence.
- Review-engine interprets observed evidence into finding candidates.
- The web app presents review output later, after an explicit integration phase.

## Packages

### `@certscore/contracts`

Path: `packages/certscore-contracts`

Defines the shared Zod schemas and TypeScript types for:

- `CanonicalEvidenceBundle`
- scan metadata, profiles, module runs, runtime events, artifacts, and evidence refs
- normalized vendor observations and derived runtime signals
- finding candidates, eligibility, coverage limitations, review results, and placeholder report projection

The current schema version is `certscore.v2.alpha.1`.

### `@certscore/vendor-resolver`

Path: `packages/certscore-vendor-resolver`

Maps high-confidence request URL, hostname, script URL, cookie, and iframe evidence into normalized vendor observations. The resolver keeps entity/vendor, product, purpose, confidence, basis, and regulatory relevance separate.

Initial high-confidence coverage includes Google Tag Manager, Google Analytics, Google Ads / DoubleClick, Meta Pixel, Microsoft Clarity, Hotjar, FullStory, TikTok Pixel, LinkedIn Insight, OneTrust, Cookiebot, Didomi, and TrustArc.

The resolver classifies product/evidence patterns, not entire vendors globally.

Endpoint attribution cleanup is intended to reduce unresolved endpoint noise in internal calibration and shadow projection. New mappings must remain evidence-pattern based, with entity/vendor, product, purpose, confidence, and resolver basis kept separate. Advertising, analytics, and session-replay collection endpoints may support review candidates only through existing evidence gates. Security, performance-monitoring, and customer-support mappings, such as bot-defense, RUM, fraud-prevention, and live-chat endpoints, are non-tracker purposes by default and do not imply tracker findings.

### `@certscore/scan-core`

Path: `packages/certscore-scan-core`

Runs the phase-1 pre-consent browser scan and writes `CanonicalEvidenceBundle.json`.

Current implementation:

- launches a fresh Playwright Chromium context
- captures network requests and responses
- captures Set-Cookie evidence where headers expose it
- captures browser cookie snapshot
- captures localStorage and sessionStorage snapshot
- captures script and iframe observations
- captures screenshot and DOM text artifacts
- detects likely consent UI from DOM text signals
- resolves observed vendors
- can run a bounded policy-surface scan as a separate module
- can run a bounded consent-flow runtime scan as a separate research/diagnostic module
- emits a validated canonical evidence bundle

First-party and third-party boundaries use public-suffix-aware registrable-domain logic via `tldts`, a small maintained PSL parser, with local-safe handling for localhost, IP addresses, and internal fixture hosts.

`policySurfaceScanner` fetches the target homepage, extracts an observed inventory of policy/control link candidates, requires Nano-assisted link classification/ranking, fetches the Nano-ranked candidate set, and stores bounded policy excerpts and topics. Nano may select only from provided scanner candidates. Observed homepage candidates are ranked first; common-path candidates are only offered to Nano as a second-pass fallback when the observed candidate pass yields no fetchable surfaces. Exact standard common paths such as `/privacy`, `/privacy-policy`, `/cookie-policy`, and `/privacy-choices` may be retained at a moderate Nano confidence threshold for fetch validation, but unfetched or failed candidates remain non-evidence. If Nano is unavailable or explicitly disabled, policy-surface scanning fails/escalates instead of falling back to deterministic URL classification.

`consentFlowRuntimeScanner` is research/diagnostic-only under the current production scanner posture. It may launch bounded fresh-context scenarios for baseline pre-consent, reject-all, and accept-all flows and emit cross-phase comparisons, but these outputs must remain internal artifacts unless a separate production integration is explicitly approved. Current production core scanning is centered on pre-consent runtime observations, public policy surfaces, collection surfaces, passive GPC observations where retained, runtime vendor vs policy alignment, and accessibility of privacy/consent controls.

### `@certscore/review-engine`

Path: `packages/certscore-review-engine`

Consumes `CanonicalEvidenceBundle` and emits `ReviewResult`.

Initial finding candidates:

- `third_party_vendors_observed`
- `pre_consent_tracking_detected`
- `third_party_cookie_pre_consent`
- `consent_banner_observed_or_not_observed`
- `session_replay_or_behavioral_analytics_observed`
- conservative policy-surface observed/not-observed candidates
- conservative policy/runtime vendor alignment review signal

Each candidate includes eligibility, matched criteria, missing corroborators, demotion reasons, confidence, direct-vs-inferred classification, source evidence refs, related vendors, source module requirements, source modules present, and coverage limitations where applicable.

The review engine does not emit legal conclusions, display-only findings, reject-flow findings without consent-flow evidence, or policy/runtime disclosure-gap findings. Policy/runtime comparison is currently a review signal only.

The generic `accept_reject_runtime_delta_observed` candidate requires a confident direct `after_reject_vs_after_accept` comparison. Confident accept-only deltas may still support accept-only review signals, but they do not satisfy accept/reject comparability by themselves.

## Local commands

Run a scan:

```bash
pnpm v2:scan --url https://example.com --profile tiny --out ./artifacts/example
```

### Lambda memory canary

Lambda scan artifacts retain bounded container/RSS samples in `V2RuntimeResourceTelemetry.json`; the Lambda manifest also identifies the critical module and observed memory peak. The current production function API caps memory at 3008 MB, so use a paired 3008 MB versus 2048 MB cohort to test whether reducing memory preserves evidence and timing. Keep production at 3008 MB unless the lower-memory cohort retains evidence parity without a material latency regression.

Run the same Lambda cohort after configuring each dev/canary memory variant, using distinct output files and variant labels:

```bash
pnpm v2:local-dag-lambda-benchmark -- --mode lambda-only --profile full --lambda-concurrency 10 --submit-concurrency 5 --scan-from eu_ie --expected-memory-mb 3008 --variant memory-3008 --out artifacts/memory-3008.json
pnpm v2:local-dag-lambda-benchmark -- --mode lambda-only --profile full --lambda-concurrency 10 --submit-concurrency 5 --scan-from eu_ie --expected-memory-mb 2048 --variant memory-2048 --out artifacts/memory-2048.json
pnpm v2:lambda-memory-canary-compare -- --baseline artifacts/memory-3008.json --candidate artifacts/memory-2048.json --out artifacts/memory-comparison.json
```

The variant name is only a cohort label. Change and verify the selected Lambda function's real memory configuration between cohorts; `--expected-memory-mb` fails rows whose retained runtime diagnostics do not match. Use one region for the paired canary, restore its prior memory after capture unless the evidence review approves promotion, and do not change all production regions from a label alone.

The benchmark runner keeps at most ten Lambda scans active, limits concurrent web submissions to five, and uses one result-queue pump with three-message receives and a 60-second visibility lease. This prevents 50-site cohorts from creating one competing queue poller per scan.

The comparison is only a screening gate. Review screenshot readability, consent-control identity, policy URLs/topics, and retained evidence before promoting a memory change.

### Regulatory gold corpus

The regulatory gold corpus refresh is documented in `docs/certscore-v2/regulatory-gold-corpus.md`. It is an internal v2 diagnostic workflow for bounded live-scan indexing, promoted examples, deterministic fixtures, and regression gates. It remains artifact-only and does not change production report behavior.

### Scan quality calibration program

Ongoing scanner calibration follows `docs/certscore-v2/scan-quality-calibration-program.md`.
The canonical lane registry is `docs/certscore-v2/scan-quality-calibration-manifest.json`.
Validate it with:

```bash
pnpm v2:calibration-registry-check
```

The registry check is deterministic and safe to run without live-site access. Use the
existing Scan Lab and gold-corpus commands for live evidence capture and review.

### Replay corpus confidence gate

Before spending time and storage on the full 100-site replay corpus, run a small capture/replay pilot and inspect the diagnostic reports. This is capture/replay infrastructure only; it does not change production scoring, report copy, regulatory classification, checklist rows, or customer-facing report output.

Pilot capture:

```bash
pnpm tsx scripts/run-wc01-v2-scan-lab-cohort.ts \
  --urls artifacts/v2-cmp-reject-reliability-expansion/pilot-10-urls.txt \
  --profile full \
  --limit 10 \
  --capture-replay \
  --out-dir artifacts/v2-cmp-reject-reliability-replay-pilot
```

This writes the normal cohort summary plus:

```text
artifacts/v2-cmp-reject-reliability-replay-pilot/ReplayCaptureHealthReport.md
artifacts/v2-cmp-reject-reliability-replay-pilot/ReplayCaptureHealthReport.json
```

HAR validation:

```bash
pnpm v2:replay \
  --corpus artifacts/v2-cmp-reject-reliability-replay-pilot \
  --out artifacts/v2-cmp-reject-reliability-replay-pilot-validation
```

Evidence replay:

```bash
pnpm v2:replay \
  --corpus artifacts/v2-cmp-reject-reliability-replay-pilot \
  --mode evidence \
  --out artifacts/v2-cmp-reject-reliability-replay-pilot-evidence
```

Inspect:

```text
artifacts/v2-cmp-reject-reliability-replay-pilot/ReplayCaptureHealthReport.md
artifacts/v2-cmp-reject-reliability-replay-pilot-validation/ConsentFlowReplayValidationReport.md
artifacts/v2-cmp-reject-reliability-replay-pilot-evidence/ReplayEvidenceReport.md
artifacts/v2-cmp-reject-reliability-replay-pilot-evidence/ReplayReadinessReport.md
```

The evidence replay readiness report emits `READY_FOR_100_SITE_CAPTURE` or `NOT_READY_FOR_100_SITE_CAPTURE` with reasons. Treat that as a diagnostic gate only; it does not fail the replay CLI unless the CLI itself crashes.

The same sequence is available as:

```bash
pnpm v2:replay-pilot
```

Full 100-site capture, only after readiness looks good:

```bash
pnpm tsx scripts/run-wc01-v2-scan-lab-cohort.ts \
  --urls artifacts/v2-cmp-reject-reliability-expansion/expanded-100-urls.txt \
  --profile full \
  --limit 100 \
  --capture-replay \
  --out-dir artifacts/v2-cmp-reject-reliability-replay-corpus
```

Root-level v2 scan/demo/calibration commands load `apps/web/.env.local`, matching the repo's local runtime convention, while using the standard Playwright browser cache for scanner launches. Nano assist is mandatory for every v2 scan profile, including `tiny`, `quick`, and `consent`; `OPENAI_API_KEY` must be present in the loaded environment or the command fails fast. `tiny` is the minimal pre-consent runtime profile and does not run policy-surface discovery. `quick` remains accepted as a compatibility alias for the same pre-consent-only scope.

Policy profiles additionally use Nano policy assist for policy discovery/extraction:

```bash
pnpm v2:scan --url https://example.com --profile policy --out ./artifacts/policy-example
```

Run the consent-flow scanner:

```bash
pnpm v2:scan --url https://example.com --profile consent --out ./artifacts/consent-example
```

The `consent` profile runs pre-consent runtime plus consent-flow runtime modules. `consent_flow` remains accepted as a compatibility alias.

Review an existing bundle:

```bash
pnpm v2:review --bundle ./artifacts/example/CanonicalEvidenceBundle.json --out ./artifacts/example/ReviewResult.json
```

Run scan and review together:

```bash
pnpm v2:demo --url https://example.com --profile tiny --out ./artifacts/example
```

Project a saved review or bundle into the internal report-adapter draft:

```bash
pnpm v2:project \
  --bundle ./artifacts/example/CanonicalEvidenceBundle.json \
  --out ./artifacts/example/V2ReportProjectionDraft.json
```

When a saved `ReviewResult.json` is already available, pass it explicitly:

```bash
pnpm v2:project \
  --bundle ./artifacts/example/CanonicalEvidenceBundle.json \
  --review ./artifacts/example/ReviewResult.json \
  --out ./artifacts/example/V2ReportProjectionDraft.json
```

The v2 report adapter is an internal draft only. It maps `ReviewResult` to `V2ReportProjectionDraft` and optional WC01-compatible draft rows for future integration analysis; it is not wired into the production report UI or any customer-facing report. The adapter preserves review candidate eligibility, status, confidence, direct/inferred classification, source module requirements, coverage limitations, matched criteria, missing corroborators, demotion reasons, related vendors, evidence excerpt IDs, and source evidence refs.

Projected evidence packets cap and deduplicate representative display-safe excerpts per row. This happens only in `V2ReportProjectionDraft` and WC01-compatible draft rows; raw `ReviewResult.evidenceExcerpts` remain unchanged for auditability. Projection preserves original evidence excerpt IDs and source evidence refs, and includes reduction counts so internal reviewers can tell when repeated evidence was omitted from display.

Projection is intentionally conservative:

- review-only candidates, policy/runtime alignment, unresolved endpoint review, and consent-flow persistence/delta findings remain `review_signal`
- missing, failed, partial, skipped, or not-testable source modules remain coverage limitations
- Nano-assisted candidates without verified source evidence are not promoted to observed
- no adapter output maps to `gap_observed`, violation, or legal-conclusion language
- evidence packets include display-safe excerpts, redacted evidence refs, artifact refs, vendors, module context, and limitations only
- raw runtime events, raw cookie values, request bodies, sensitive query values, and full policy-page dumps are excluded from projected report output

Run internal shadow projection over a calibration artifact directory:

```bash
pnpm v2:shadow-project \
  --calibration ./artifacts/v2-calibration-expanded-full \
  --out ./artifacts/v2-shadow-projection
```

Shadow projection writes `V2ReportProjectionDraft.json` per site plus aggregate `shadow-projection-summary.json` and `shadow-projection-summary.md`. The summary includes rows by status, review-signal counts, observed counts, limitation/not-testable counts, capped excerpt rows, missing excerpt rows, disallowed status checks, sanitization warnings, top row keys, module statuses, and coarse endpoint groups. It is internal-only and is not production report UI integration.

Generate a WC01 v2 shadow projection from an existing `V2ReportProjectionDraft.json`:

```bash
pnpm v2:wc01-shadow \
  --projection ./artifacts/v2-shadow-projection-expanded-fresh-registry/cnn.com/V2ReportProjectionDraft.json \
  --out ./artifacts/v2-wc01-shadow/cnn.com/Wc01V2ShadowProjection.json
```

The command writes `Wc01V2ShadowProjection.json` and, by default, `Wc01V2ShadowProjection.summary.md` next to it. This artifact is an internal diagnostic view of what WC01 could eventually consume through an explicit adapter boundary. It is not production UI integration, not customer-facing report output, and does not alter existing checklist, executive-summary, or report-card behavior.

The summary includes source URL and scan ID, contract version, row counts by v2 status and WC01 assessment status, sanitizer warnings, vendor counts by purpose, coverage-limited rows, and guardrail confirmations that `productionEligible`, top-finding eligibility, and gap eligibility remain false. It also confirms that no forbidden gap status token or raw blocked evidence fields appear in the shadow artifact.

Generate WC01 v2 shadow projections for every saved site projection in a shadow-projection directory:

```bash
pnpm v2:wc01-shadow \
  --projection-dir ./artifacts/v2-shadow-projection-expanded-fresh-registry \
  --out-dir ./artifacts/v2-wc01-shadow-expanded-fresh-registry
```

Directory mode finds every `V2ReportProjectionDraft.json`, writes a matching per-site `Wc01V2ShadowProjection.json` and `Wc01V2ShadowProjection.summary.md`, and writes aggregate summaries at the output root:

```text
wc01-shadow-batch-summary.json
wc01-shadow-batch-summary.md
```

The aggregate summary reports projection files found, succeeded/failed site counts, per-site failures, total row counts, status counts, WC01 assessment-status counts, sanitizer warnings, vendor purpose counts, coverage-limited sites, not-testable sites, and batch guardrails. Guardrail counters should remain zero for production eligibility, top-finding eligibility, gap eligibility, forbidden gap status token presence, raw blocked field presence, unsupported shadow output statuses, disallowed source statuses, and legal-conclusion warnings.

Run both current fresh-registry batches with:

```bash
pnpm v2:wc01-shadow \
  --projection-dir ./artifacts/v2-shadow-projection-expanded-fresh-registry \
  --out-dir ./artifacts/v2-wc01-shadow-expanded-fresh-registry

pnpm v2:wc01-shadow \
  --projection-dir ./artifacts/v2-shadow-projection-stress-fresh-registry \
  --out-dir ./artifacts/v2-wc01-shadow-stress-fresh-registry
```

## Internal WC01 shadow preview

WC01 includes a platform-admin-only preview reader for saved `Wc01V2ShadowProjection.json` artifacts. It is also gated by an explicit local/internal flag:

```bash
CERTSCORE_V2_SHADOW_PREVIEW_ENABLED=1 pnpm --filter @website-signal-risk-scanner/web dev
```

Open the preview with an artifact path under the repo `artifacts/` directory:

```text
http://localhost:3000/app/admin/v2-shadow-preview?artifact=artifacts/v2-wc01-shadow-expanded-fresh-registry/cnn.com/Wc01V2ShadowProjection.json
```

The preview reads only `Wc01V2ShadowProjection.json`. It does not read `V2ReportProjectionDraft.json`, call production report builders, map rows into normalized concerns, build checklist rows, build executive summary rows, or select top findings. It renders internal diagnostic rows only, with row counts, WC01 assessment-status counts, sanitizer warnings, guardrail counters, vendor diagnostic labels, coverage limitations, matched criteria, missing corroborators, demotion reasons, and capped/omitted evidence counts.

The preview fails closed if the artifact has an unsupported contract version, `productionEligible: true`, any top-finding eligible row, any gap-eligible row, a forbidden gap status token, or raw blocked evidence fields. Sanitizer warnings are displayed as diagnostics only and do not promote rows.

This preview is not production report integration, not customer-facing output, and not legal-conclusion language. V2 rows still cannot feed checklist, executive-summary, top-finding, scoring, regulatory-lens, or normalized-concern pipelines.

## Internal policy/copy review artifact

Generate an artifact-only WC01 v2 policy/copy review artifact from a saved policy/copy input artifact:

```bash
pnpm v2:wc01-policy-copy-review \
  --input ./artifacts/example/Wc01V2PolicyCopyReviewInput.json \
  --out ./artifacts/example/Wc01V2PolicyCopyReviewArtifact.json
```

The command writes `Wc01V2PolicyCopyReviewArtifact.json` and, by default, `Wc01V2PolicyCopyReviewArtifact.summary.md` next to it. The input references grouped evidence preview, manual reviewer log context, queue item metadata, reviewer action, sensitive-context categories, safe evidence/excerpt refs, confidence/directness, family context, internal phrasing posture, policy/copy owner decisions, unresolved-ref disposition, and redaction/sanitization status.

The generated artifact is internal-only and non-persistent. It hard-defaults `productionEligible` to `false`, `customerFacingEligible` to `false`, and `explicitApprovalRequired` to `true`. Sensitive-context labels remain routing metadata only. The artifact can route to a production-readiness gate draft only as an internal next step; it does not approve customer-facing wording, UI, persistence, report rows, checklist rows, executive rows, top findings, scoring output, regulatory-lens output, API/MCP/export output, production concern policy calls, unified findings, or persisted normalized concerns.

The artifact fails closed when policy/copy owner decisions, safe evidence refs, display-safe excerpt refs, sensitive-context categories, family evidence context, internal phrasing posture, redaction/sanitization, or unresolved-ref disposition are incomplete or blocking.

## Internal production readiness gate draft

Generate an artifact-only WC01 v2 production readiness gate draft from a saved readiness input artifact:

```bash
pnpm v2:wc01-production-readiness-gate \
  --input ./artifacts/example/Wc01V2ProductionReadinessGateInput.json \
  --out ./artifacts/example/Wc01V2ProductionReadinessGateDraft.json
```

The command writes `Wc01V2ProductionReadinessGateDraft.json` and, by default, `Wc01V2ProductionReadinessGateDraft.summary.md` next to it. The input references a grouped evidence preview packet, manual reviewer log, optional policy/copy review artifact, queue item metadata, reviewer action, safe evidence/excerpt refs, gate decisions, approval record, and rollback/suppression plan.

The generated draft is internal-only and non-persistent. It hard-defaults `productionEligible` to `false`, `customerFacingEligible` to `false`, and `explicitApprovalRequired` to `true`. It computes only internal next steps such as `policy_copy_review`, `product_surface_proposal_draft`, `evidence_followup`, or `internal_hold`; it does not create production eligibility, UI, persistence, report rows, checklist rows, executive rows, top findings, scoring output, regulatory-lens output, API/MCP/export output, production concern policy calls, unified findings, persisted normalized concerns, or customer-facing copy.

The draft fails closed when required gates, evidence refs, excerpt refs, approval records, guardrail scans, or rollback/suppression sections are missing or failed. It is a gate-review artifact only, not implementation approval.

## Internal product surface proposal draft

Generate an artifact-only WC01 v2 product surface proposal draft from a saved proposal input artifact:

```bash
pnpm v2:wc01-product-surface-proposal \
  --input ./artifacts/example/Wc01V2ProductSurfaceProposalInput.json \
  --out ./artifacts/example/Wc01V2ProductSurfaceProposalDraft.json
```

The command writes `Wc01V2ProductSurfaceProposalDraft.json` and, by default, `Wc01V2ProductSurfaceProposalDraft.summary.md` next to it. The input is a small internal proposal artifact with the proposed surface class, audience, purpose, allowed/blocked families, sensitive-context handling, copy posture, evidence requirements, guardrails, approval requirements, and rollback/suppression plan.

The generated draft is internal-only and non-persistent. It hard-defaults `implementationStatus` to `not_approved`, `productionEligible` to `false`, `customerFacingEligible` to `false`, and `explicitApprovalRequired` to `true`. It does not create UI, persistence, report rows, checklist rows, executive rows, top findings, scoring output, regulatory-lens output, API/MCP/export output, production concern policy calls, unified findings, persisted normalized concerns, or customer-facing copy.

The draft records fail-closed reasons when required proposal sections or approvals are missing. It is a proposal-review artifact only, not implementation approval.

## Internal artifact chain smoke

Run the policy/copy review, production-readiness gate, and product surface proposal example chain:

```bash
pnpm v2:wc01-artifact-chain-smoke
```

By default, the smoke reads example inputs from `docs/certscore-v2/examples/` and writes generated artifacts to `artifacts/v2-internal-artifact-chain-example/`.

It validates the closed-default flags across the generated artifacts:

- `productionEligible: false`
- `customerFacingEligible: false`
- `explicitApprovalRequired: true`
- policy/copy sensitive-context metadata remains routing-only
- product surface proposal remains `not_approved`

The command writes:

- `Wc01V2ArtifactChainSmoke.summary.json`
- `Wc01V2ArtifactChainSmoke.summary.md`

Use `--examples-dir <dir>` and `--out-dir <dir>` to run the same smoke against another internal example set.

When reviewing this command's diff in the current local worktree, note that `apps/web/components/scans/shared-scan-detail-view.tsx` may already be dirty from unrelated prior work. The WC01 v2 shadow command does not require modifying `apps/web`.

## Internal real-site calibration

Run a small internal calibration batch:

```bash
pnpm v2:calibrate \
  --profile consent \
  --urls ./docs/certscore-v2/calibration-urls.txt \
  --out ./artifacts/v2-calibration
```

The checked-in starter URL list is [calibration-urls.txt](/Users/benmasek/WC01/docs/certscore-v2/calibration-urls.txt). It is diagnostic only and does not define production behavior.

The starter list is the small smoke cohort. A broader internal cohort lives in [calibration-urls-expanded.txt](/Users/benmasek/WC01/docs/certscore-v2/calibration-urls-expanded.txt) and is used to stress publisher, ecommerce, SaaS, healthcare, finance, government, global, privacy-mature, CMP/privacy-center, and Do Not Sell / Share paths. A third stress cohort lives in [calibration-urls-stress.txt](/Users/benmasek/WC01/docs/certscore-v2/calibration-urls-stress.txt) and targets higher-friction ecommerce, travel, healthcare, finance/insurance, and publisher consent/policy behavior. All lists are internal diagnostics only; none defines production behavior, customer-facing report scope, or legal conclusions.

The edge cohort lives in [calibration-urls-edge.txt](/Users/benmasek/WC01/docs/certscore-v2/calibration-urls-edge.txt). It is smaller than a broad regression suite but more targeted than smoke coverage. It intentionally samples edge buckets: heavy publisher/adtech, dense ecommerce adtech, low-tracking SaaS, healthcare and sensitive-context surfaces, finance/insurance, government/public-sector, privacy-mature or CMP-heavy sites, session-replay candidates, sites with no obvious consent banner, EU/global consent variations, and likely headless/blocking/failure cases.

Run the edge cohort diagnostic sequence with:

```bash
pnpm v2:calibrate \
  --profile consent \
  --urls ./docs/certscore-v2/calibration-urls-edge.txt \
  --out ./artifacts/v2-calibration-edge-consent

pnpm v2:shadow-project \
  --calibration ./artifacts/v2-calibration-edge-consent \
  --out ./artifacts/v2-shadow-projection-edge-consent

pnpm v2:wc01-shadow \
  --projection-dir ./artifacts/v2-shadow-projection-edge-consent \
  --out-dir ./artifacts/v2-wc01-shadow-edge-consent

pnpm v2:wc01-allowlist-dry-run \
  --shadow-dir ./artifacts/v2-wc01-shadow-edge-consent \
  --out-dir ./artifacts/v2-wc01-allowlist-dry-run-edge-consent
```

The edge dry-run remains internal diagnostics only. It must not be used to create persisted normalized concerns, unified findings, checklist rows, executive summaries, top findings, scoring changes, regulatory-lens output, or customer-facing report copy.

The expanded cohort comparison report is [calibration-expanded-comparison.md](/Users/benmasek/WC01/docs/certscore-v2/calibration-expanded-comparison.md).

Targeted fixture coverage from expanded and stress calibration is tracked in [fixture-todos.md](/Users/benmasek/WC01/docs/certscore-v2/fixture-todos.md).

Calibration writes:

```text
calibration-summary.json
calibration-summary.md
```

The harness records per-site module states, Nano assist counts, consent action outcomes, preference-center traversal counts, consent-flow deltas, policy surfaces, runtime vendors, policy vendor mentions, review candidate counts, evidence excerpt counts, coverage limitations, and scan failures/partials. Missing `OPENAI_API_KEY` fails fast because Nano is mandatory for every v2 profile. Individual site scan failures are recorded and do not stop the rest of the batch.

Calibration output is internal diagnostic output only. It is not customer-facing report prose, does not emit legal conclusions, and does not integrate with the production web/report UI.

## Internal calibration utilities

Inspect a saved `CanonicalEvidenceBundle.json` without rerunning a live scan:

```bash
pnpm -s v2:inspect --bundle ./artifacts/example/CanonicalEvidenceBundle.json --format text
```

Emit deterministic JSON for resolver/review calibration checks:

```bash
pnpm -s v2:inspect --bundle ./artifacts/example/CanonicalEvidenceBundle.json --format json
```

The inspection output is an internal diagnostic view only. It summarizes endpoint attribution, vendor/product resolution, journey classification, cookie classification, consent-flow outcomes, policy surfaces, Google endpoint subtypes, and review finding candidates from already-saved canonical evidence. Consent-flow rows, unresolved endpoint rows, and policy/runtime alignment rows are evidence review signals, not legal conclusions, named vendor conclusions, or disclosure-gap conclusions. Resolver cleanup should make repeated known endpoint families easier to review, but it must not turn infrastructure/security/performance/support evidence into tracker findings or any `gap_observed` status.

Vendor observations, observed journeys, and finding candidates preserve structured traceability back to source scanner event IDs. Resolver matches include evidence refs and match-source metadata with redacted matched values rather than raw cookie values, request bodies, or sensitive parameter values.

Review output also includes bounded display-safe evidence excerpts for future report projection. These excerpts are internal evidence metadata, not customer-facing report prose, and must not include raw cookie values, raw request bodies, sensitive raw parameter values, or full policy-page dumps.

Saved-bundle calibration fixtures live in:

```text
packages/certscore-contracts/fixtures/saved-bundles/
```

These fixtures are minimal valid `CanonicalEvidenceBundle` files, not full live scan archives. They exist so resolver, journey, and review calibration can be checked from stable canonical evidence without rerunning browser scans. Inspect JSON snapshots for those bundles live in:

```text
packages/certscore-scan-core/fixtures/inspect-snapshots/
```

Scan-core also has a test-only local static fixture server:

```text
packages/certscore-scan-core/src/test-fixtures/static-server.ts
```

The local fixture server tests browser, policy, and consent-flow capture behavior from controlled pages. It serves deterministic pages, scripts, cookies, static assets, consent banners, ambiguous consent controls, policy/control links, policy documents, broken policy links, delayed hydrated global policy footers, ambiguous privacy-choice links, and simulated preference-center routes on an ephemeral local port, while scan-core test route fulfillment simulates selected third-party request URLs without external network or DNS dependencies. It covers GTM library-only, GA collection, Google Ads measurement, Google consent/tag support, Google-owned unresolved collection, Clarity collection, Akamai security cookie, CMP cookie, first-party GA cookie, third-party cookie, New Relic monitoring, site-owned infrastructure, generic CDN noise, unresolved collection endpoint cases, policy-surface discovery/topic fixtures, and consent-flow accept/reject/persistence/not-testable/preference-center traversal fixtures. Saved-bundle fixtures test canonical states; local fixture-server tests verify that scanner modules can produce those states from observed evidence.

Run saved-bundle fixture checks:

```bash
pnpm --filter @certscore/contracts test:fixtures
pnpm --filter @certscore/review-engine test:saved-bundles
pnpm --filter @certscore/scan-core test:inspect-snapshots
pnpm --filter @certscore/scan-core test:integration-fixtures
```

Focused verification:

```bash
pnpm --filter @certscore/contracts typecheck
pnpm --filter @certscore/contracts test:fixtures
pnpm --filter @certscore/vendor-resolver test
pnpm --filter @certscore/review-engine test
pnpm --filter @certscore/scan-core typecheck
pnpm --filter @certscore/scan-core test
node --import tsx --test packages/certscore-scan-core/src/consent-flow-runtime-scanner.test.ts
pnpm --filter @certscore/scan-core test:integration-fixtures
```

## Phase-1 constraints

- Do not integrate with the current production report UI yet.
- Do not rewrite login, admin, marketing, billing, or existing report flows.
- Do not synthesize evidence.
- Do not promote display-only findings.
- Do not emit legal conclusions.
- Do not classify reject-related findings unless the consent-flow scanner ran and the action/delta evidence is testable.
- Do not classify policy/runtime mismatch unless the policy-surface scanner ran.
- Preserve the observed-evidence -> review-candidate separation.

## Proposed next steps

1. Calibrate the new stress cohort across standard and full profiles, then compare smoke/expanded/stress outcomes before WC01 integration work.
2. Decide the explicit adapter layer for projecting `ReviewResult` into the existing WC01 unified finding/checklist pipeline.
3. Expand policy/runtime and consent-flow calibration with additional saved bundles, alias review cases, and GPC scenarios.
4. Keep production UI integration blocked until endpoint attribution cleanup, privacy choices/cookie-policy recall, adapter shadow stability, and final report-copy review are complete.
