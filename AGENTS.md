# CertScore Agent Notes

> **Project:** CertScore (`certscore.ai`) — a production-minded MVP for scanning public websites for accessibility, privacy, cookie, policy, and disclosure risk signals.
> **Repo codename:** `WC01`
> **Package manager:** pnpm 10.6.3 (workspace monorepo with Turbo)
> **Node engines:** `>=22.0.0 <25.0.0` (Node 25 is unsupported and can fail DNS resolution on localhost)

## Absolute prohibition: Vercel

WC01 and WS01 are AWS-only. Never use, inspect, load, recommend, or invoke any Vercel skill, plugin, documentation, CLI, API, integration, deployment, hosting, or build workflow for these repositories.

A request containing “deploy,” “production,” “hosting,” “CI/CD,” or “release” must not trigger Vercel tooling. The only authorized deployment paths are the repository-controlled AWS workflows and scripts, including `scripts/deploy-fast.ts` and the checked-in GitHub Actions AWS workflows.

If platform discovery is needed, inspect the repository’s deployment topology first. If any system capability suggests Vercel, treat it as inapplicable and continue with the canonical AWS path. Stop and ask before introducing any non-AWS deployment platform.

## Cost-change approval

Any change that can increase recurring infrastructure cost, per-request or
per-scan spend, paid-service usage, model/API usage, storage/retention cost, or
reserved/provisioned capacity requires explicit product-owner approval before
implementation or deployment when the reasonably estimated incremental cost is
$1 USD/month or more. Changes reasonably estimated below $1 USD/month are
pre-approved, but the agent must disclose every such cost increase to the
product owner, including the estimate, before or when proceeding. Record the
estimate in the work summary. Present the expected cost, benefit, and lower-cost
alternatives before requesting approval for changes at or above the threshold.
Do not infer approval from a latency, reliability, or scaling request.
Cost-neutral diagnostics and optimizations may proceed normally.

---

## Project overview

This is a **pnpm workspace monorepo** managed with **Turbo**. It contains the product-facing web application, a background validation worker, shared libraries, and operational tooling.

CertScore is a risk-signal and monitoring product, not a legal certification platform. The repo boundary is intentionally split:

- **`WC01` (this repo)** — product web flows, scan creation, reporting, validation, and control-plane workflows.
- **`WS01` (external repo)** — standalone scanner runtime, crawler identity, scheduled scans, heartbeat behavior, and scanner deploy flow. Do not add scanner runtime logic here.

### Canonical scan-to-report flow

All new scan-to-report logic must preserve the canonical CertScore pipeline:

```text
WS01 observed evidence
→ WC01 normalized concern
→ WC01 concern policy
→ WC01 unified finding / checklist projection
→ executive/regulatory display
```

WC01 must consume scanner evidence through normalized concern construction, concern policy, and unified finding/checklist projection. Do not add synthetic evidence, display-layer promotion, repair-based findings, raw signal shortcuts, or one-off surfacing paths.

Agents have access to both WS01 and WC01. Keep their responsibilities separate:

- WS01 is responsible for observed runtime signal identification, evidence capture, and logging.
- WC01 must consume that evidence only through normalized concern -> concern policy -> unified finding/checklist projection -> executive/regulatory display.

Executive-summary and top-finding selection may rank, allowlist, suppress, or group already-projected findings, but must not create, upgrade, or infer findings from raw signals or display-only context.

If a valid signal is missing, add or fix the upstream WS01 observed evidence and the WC01 concern/policy mapping. Do not patch around missing evidence in display code. If a deviation from this flow seems necessary, stop and call it out before implementing.

### Canonical consent-control flow

Consent-control logic is a production specialization of the canonical scan-to-report flow:

```text
WS01 typed observations
→ verified retained evidence packet
→ WC01 ConsentControlAssessment v2
→ persisted typed assessment/evidence projection
→ normalized consent concerns
→ concern policy
→ unified findings/checklist
→ score, report, Overview, Admin Scans, and API Activity
```

WS01 owns pre-consent observation and retained evidence capture. WC01 owns typed assessment, persistence, normalized concerns, policy, findings, scoring, and presentation.

Persistence must preserve the assessment's contract version, provenance, retained-evidence references, and source hash. Persistence must not synthesize observations, upgrade confidence, or create findings.

Every downstream surface must consume the canonical persisted projection or its normalized concern, concern-policy, and unified finding/checklist outputs. Do not infer consent findings, status, severity, prominence, or score effects directly from raw labels, screenshots, DOM signals, or display-layer context.

Missing, malformed, stale, or unverifiable evidence must fail closed to an unknown, insufficient-evidence, or review state. It must not become an observed gap solely because evidence is absent.

If a downstream result is incorrect, trace the first broken stage in this sequence and fix it there. Do not add surface-specific fallbacks.

### Four-lane production Lambda evidence capture with reject observation

Production v2 DAG Lambda scans with reject observation enabled fan out into
four independent, bounded browser-session lanes. The coordinator must await a
terminal outcome from all four lanes before it verifies and merges one
canonical evidence bundle for WC01 assessment or projection:

```text
consent-proof lane: typed first-layer A/R/O inventory + geometry + representative screenshot
runtime-evidence lane: network, cookies/storage, scripts/iframes/forms, vendors, journeys, and transport
policy-evidence lane: policy discovery, ownership, retrieval, retained text/excerpts, and policy diagnostics
reject-observation lane: one authorized deterministic reject action + confirmed post-refusal evidence
→ coordinator verifies and merges lane-owned evidence
→ CanonicalEvidenceBundle
→ ConsentControlAssessment v2 and the canonical downstream flow
```

Start `reject_observation` 500 milliseconds after the three passive lanes to
avoid an immediate four-browser burst. Do not publish a primary result before
that branch reaches a terminal outcome, and do not publish an independent
post-refusal artifact that triggers a later report generation. Reconcile,
score, persist, and publish exactly once. A neutral, unsupported, unconfirmed,
failed, stale, or unverifiable reject outcome must not create a finding or
affect score. There must be no late refresh or report-regeneration path for
Reject Path evidence.
The coordinator may wait at most six seconds beyond the slowest passive lane;
after that it must terminate its reject-lane wait and retain an explicit,
score-neutral coverage limitation in the single result.

Post-refusal storage persistence must require a completed settle window, exact
cookie name/domain/path/partition identity or exact web-storage
origin/type/key identity, and the same retained value hash before and after the
confirmed refusal. A changed value without a separately refusal-anchored write
remains neutral. Exact unchanged persistence by itself is a factual review
signal, not proof of active use, and must not affect score; only direct eligible
post-refusal requests/writes or a retained consent-signal contradiction receive
the canonical post-refusal scoring effect.

When consent-proof returns a complete first-layer inventory with no Reject,
the coordinator must stop accepting `reject_observation` output and retain a
score-neutral `not_applicable` outcome. Aborting an AWS synchronous invocation
is best-effort and may not terminate already-running Lambda compute; any late
worker output must remain isolated and must not reopen or independently publish
the terminal result.

Retain bounded operational timing telemetry for every lane: coordinator-observed
invocation start, terminal-outcome time, elapsed duration, worker-reported
completion/duration when available, and each outcome's delta from the passive
lane barrier. Persist the typed timing summary with the terminal scan event so
cohort analysis can measure how often `reject_observation` adds latency, finishes
before the passive barrier, fails, or reaches the six-second cap. Timing
telemetry must not create evidence, findings, or score effects.

The consent-proof lane must capture typed A/R/O, geometry, and the representative pre-consent screenshot from the same browser session. It may use bounded same-session settling and recapture, but it must not click consent controls. The runtime lane must not spend its budget on consent screenshots or screenshot recovery. The policy lane owns policy-surface work and must not depend on spare time left by consent or runtime capture.

Keep lane ownership strict when merging. Consent evidence and visuals come from consent-proof; runtime facts come from runtime-evidence; policy observations come from policy-evidence. Do not let one lane synthesize, infer, or overwrite another lane's evidence. Preserve lane artifact provenance, verify retained pointers, and publish only the merged canonical bundle through the existing persistence path.

The coordinator is orchestration only. It may dispatch `reject_observation`
when the feature is explicitly enabled and the target passes the interaction
authorization gate, but it must not run browser work in the coordinator
process. Worker artifacts use isolated lane prefixes while retaining the parent
scan identity. A failed or unverifiable lane must fail closed or remain
explicitly limited; it must not be filled from display context or another
lane's absence.

A `complete` `ConsentControlAssessment v2` must contain binary A/R/O states (`observed` or `not_observed`). If any required first-layer inventory is incomplete, stale, document-mismatched, or unbound to the representative evidence, the assessment remains `limited` with the affected controls `unknown`. Unknown reduction must come from better upstream evidence capture, never from probabilistic or display-layer conversion to absence.

### Finding-domain classification

Classify changes by the finding type they produce:

- **Consent:** CMP or consent mechanism, Accept/Reject/Options (A/R/O), refusal or opt-out path, consent state, or control behavior.
- **Non-consent:** cookies/storage, trackers/vendors, fingerprinting, session replay, GDPR Transparency, Transport Security, policy or policy/runtime comparison, iframe, social-media, or third-party embeds.
- **Mixed:** pre-consent cookies or trackers. Keep consent and runtime evidence separate, then relate them through normalized concerns and concern policy.

If a finding concerns the visitor's ability to choose or refuse, use the consent flow. Otherwise use the non-consent flow. Downstream surfaces must consume the resulting canonical projection or unified finding/checklist only.

Changes to this flow require focused regression coverage at the affected boundaries:

- WS01 observation -> retained evidence contract
- retained evidence -> `ConsentControlAssessment v2`
- assessment -> persisted projection
- persisted projection -> normalized concern and concern policy
- unified projection -> score and every downstream surface

### CertScore v2 internal diagnostic architecture

CertScore v2 exists in this repo as a clean scanner/review architecture and internal diagnostic pipeline. Its current operating principle is:

```text
scan-core observes
Nano assists
review-engine interprets
report-adapter projects internal artifacts
web app presents only after separate approval
```

### Model-assisted review roles

Use explicit model roles rather than treating every task as generic Nano enrichment:

```text
deterministic evidence and registries
→ Nano extraction / routine triage
→ Mini interpretation when semantics or conflicts require it
→ optional bounded escalation
→ internal shadow artifact
```

- `CERTSCORE_EXTRACTION_MODEL` defaults to `gpt-5.4-nano`.
- `CERTSCORE_REVIEW_MODEL` defaults to `gpt-5.4-mini`.
- `CERTSCORE_ESCALATION_MODEL` is optional and has no default.
- Mini review and escalation are disabled by default.
- `CERTSCORE_MODEL_REVIEW_MODE` defaults to `shadow`.

Keep passage location, candidate-topic extraction, normalization, evidence compression, and routine taxonomy triage on the extraction role. Use the review role for substantive policy interpretation, contradictory evidence, legal-basis wording, retention, transfers, rights, vendor disclosure, and policy/runtime consistency. Use escalation only for bounded high-impact or conflicting cases that remain inconclusive or low-confidence after review.

Model outputs must use strict structured schemas, application-side validation, explicit provenance, bounded inputs/outputs, and safe failed/inconclusive states. Batch policy and finding review where possible and cache policy review by canonical content hash, contract version, prompt version, schema version, and model.

When `CERTSCORE_PARALLEL_POLICY_PROJECTION_ENABLED=1`, production report readiness must not start or await a fresh model call after `v2_lambda_result.received`. Static Mini review runs from the verified policy-evidence lane and caches by canonical policy content hash. Terminal projection may consume only a verified completed early/cached review plus deterministic runtime rows. If the semantic artifact is unavailable, fail closed without model-derived rows; directly comparable policy/runtime claims remain unknown. Do not restore terminal model fallback, polling delays, or display-derived findings to improve apparent coverage.

Deterministic code remains authoritative for observed runtime facts, timestamps, canonical registries, legal-framework dates/validity, thresholds, severity, finding eligibility, scoring, and display projection. Model-review artifacts must remain internal and non-production until a separate production integration is explicitly approved.

Model-review rollout evaluation must fail closed and must record review provenance honestly. `independently_reviewed` is reserved for evidence-only human review. `human_adjudicated` may be used when a named product owner reviews the retained evidence and a multi-model comparison, then personally decides every label. Human-adjudicated labels count for the approved precision-first observed-only production scope, but they must not be relabeled as independent review. The stricter full-status rollout gate still requires its canonical balance, coverage, precision, recall, and exact-agreement thresholds.

Independent policy-review labels must be created from evidence-only reviewer packets that omit Mini/Nano outputs, provisional labels, model-derived candidate classifications, and other reviewers' decisions. Bind every response to the packet's retained-evidence hash, require a named human reviewer plus explicit no-model/no-provisional-label attestations, require topic-level rationale and valid evidence references, and fail closed on evidence drift or malformed responses. Ingestion must write a review candidate rather than silently overwriting the canonical corpus.

The v2 packages and artifacts are not production report integration by default. V2 shadow, allowlist dry-run, concern-input dry-run, policy simulation, normalized-concern candidate, comparison, reviewer-packet, and evidence-preview outputs must remain artifact-only, internal-only, and non-persistent unless the user explicitly approves a separate production integration proposal.

Do not wire v2 outputs into production report cards, checklist builders, executive summaries, top findings, scoring, regulatory lenses, persisted normalized concerns, unified findings, or customer-facing copy without explicit approval. Do not map v2 dry-run rows directly to `gap_observed`.

The product owner approved one narrow production integration on July 25, 2026:
completed `gpt-5.4-mini` policy-semantic review may supplement GDPR
Transparency checklist coverage only when the artifact is in `enforced` mode,
is explicitly production-projectable, and every projected `observed` row has
passed the versioned deterministic topic-relevance, target-ownership,
coverage, retained-evidence, and confidence invariants. This approval does not
allow model output to create absence findings, scoring changes, executive/top
findings, legal conclusions, or direct display-layer findings. The approved
path remains persisted typed artifact -> normalized concern -> concern policy
-> checklist projection. Shadow, failed, incomplete, low-confidence,
ambiguous, conflicting, and insufficient-evidence rows remain non-production.
The owner also confirmed that their July 25 review covered all 200 topic rows
in the 25-case corpus. Those rows are canonical `human_adjudicated` calibration
labels. The approved observed-only scope is production-eligible when its
precision-first gate passes even if the separate full-status rollout gate
remains blocked by recall or exact agreement.

On August 18, 2026, the product owner set the operating goal that Mini be used
for fewer than 3% of unique policy hashes reviewed by Nano. The Nano-primary
precision mode uses one bounded Nano recovery pass for routine uncertainty;
remaining uncertainty stays `unknown` or review and must not invoke Mini merely
because confidence is low, evidence is insufficient, or absence is unproven.
Mini is reserved for invariant-verified retained contradictions and must record
row-level provenance. Cookie inventory remains deterministic. Only
high-confidence, evidence-bound Nano `observed` rows and bounded Mini conflict
adjudications may enter the existing observed-only GDPR Transparency path
through persisted artifact -> normalized concern -> concern policy ->
checklist projection. Nano absence, scoring changes, direct display findings,
and surface-specific fallbacks remain prohibited. Keep the production switch
off until corpus and fresh-cohort calibration demonstrate both the evidence
quality gate and the Mini invocation-rate goal.

Sensitive-context labels in v2 are review routing metadata only. They must not create stronger findings, customer-facing language, legal conclusions, or production eligibility.

General post-consent consent-flow runtime remains disabled for WC01 scanner
runs. A narrow reject-only observation path is authorized for deterministic
fixtures, explicitly owned canaries such as ErgoVeritas, per-run public
calibration targets selected through the canonical scan-quality and
contact/cooldown controls, and ordinary customer scans that use the sharded
production Lambda topology. Every eligible sharded scan with the explicit
reject-observation feature flag receives a non-reusable authorization bound to
that scan's exact normalized HTTPS target URL. That authorization may not be
broadened to a host, origin, path prefix, redirect destination, or later scan;
the observer must fail closed when the loaded document does not retain the
authorized exact target. Do not infer authorization from the presence of a
banner, CMP signal, or Reject label. Non-sharded scans and ineligible targets
must not launch the reject-observation lane.

The reject observer may perform at most one deterministic first-layer `reject`
or necessary-only-equivalent action in a fresh isolated browser context. It
must resolve from the bounded canonical CMP registry and use a versioned
named-CMP Reject recipe; no guessed DOM/text fallback is permitted. Multiple
matches, unsupported CMPs, and unresolved controls fail closed without a click.
It must not click Accept, Options/Manage, privacy
opt-out, Save, forms, authentication, purchases, or unrelated controls; follow
deeper preference-center paths; reuse visitor state; or interact where the
action could affect an account or transaction. Evidence is eligible only after
confirmed semantic refusal registration, with an anchored grace rule for
already-in-flight activity. Coverage failure is score-neutral and must never be
converted to an observed gap.

Retain bounded, display-safe reject evidence and provenance; do not retain raw
TC strings, raw cookie values, sensitive query values, or unbounded bodies.
Consent-flow-dependent review rows remain evidence aids and must enter
production only through the typed retained-evidence contract, normalized
concern, concern policy, and unified finding/checklist path. Reject interaction
must remain separately disableable. When it is enabled, its terminal outcome is
part of the single canonical report-readiness barrier; when it is disabled, the
existing three passive lanes remain the complete barrier.

### WC01 responsibility boundary

WC01 owns:

- scan creation, product web flows, reporting, validation, and control-plane workflows
- normalized concern construction
- concern policy
- unified findings and checklist/regulatory projection
- executive summary and report display for already-projected findings

WC01 does not own scanner runtime observation, crawler identity, or raw evidence capture. Those belong in WS01.

Agents may inspect WS01 for scanner evidence contract, runtime signal, and retained evidence context. Only edit WS01 when the user request explicitly spans both repos or when a WC01 concern/policy change exposes a missing or incorrect upstream WS01 signal.

### Canonical API read-rate policy

`packages/shared/src/api-read-rate-policy.ts` `API_READ_RATE_POLICY` is the sole source of truth for completed-scan retrieval and status-polling windows, scope limits, and unit weights across the Pulse API, API v2, hosted MCP, and any future API or agent-facing read path. Import this policy; do not duplicate its numeric limits in route, SDK, MCP, worker, infrastructure, documentation, `.plist`, JSON, or environment-specific configuration. This file intentionally does not restate the current numbers.

The terminal-read and status-polling profiles are separate. Operation-to-weight mappings must be explicit and must obtain their unit values from the canonical policy. Rolling-window evaluation must use the windows and scoped limits from the canonical policy rather than service-local constants.

Enforcement storage remains service-owned: WC01 API paths use the shared database-backed event ledger for cross-instance bounds, while hosted MCP may reject composite calls at its HTTP boundary before internal fan-out. Rejected protected reads must return `429` with `Retry-After`, canonical bot-facing guidance, and machine-readable policy/profile/scope/window/usage metadata; they must not create API Activity rows or begin report/evidence projection work. Emit one structured denial log without bearer tokens, raw IPs, raw URLs, or target identifiers. Protection failure on direct API reads must fail closed with a retryable response.

The full public numeric policy table may appear only on approved developer and integration surfaces and must render through the shared server component that reads `API_READ_RATE_POLICY`. Approved customer, marketing, dashboard, and scan-report pages may render the compact automated-access notice, which must also derive its values from the canonical policy and link to the full developer reference. Static guides and READMEs must link to that rendered documentation or the machine-readable OpenAPI extension rather than copying numeric limits. Do not add either component to finding, checklist, executive-summary, or regulatory sub-surfaces where it could be mistaken for scan evidence or finding policy.

Documentation tests must verify both rendered policy components against the canonical policy, require exact policy parity in OpenAPI and agent-discovery documents, and enforce separate allowlists for pages permitted to render the full table and compact notice. Any policy change must update the canonical module first and include focused shared-policy, WC01 quota, MCP boundary, 429 contract/logging, and documentation-parity tests. Coordinate the database migration and all consuming service deployments so different services do not enforce different policy versions.

### Evidence contract discipline

WC01 should not consume loose, ad hoc, or display-only scanner fields. New scanner evidence consumed by WC01 should be structured, typed, bounded, and covered by focused fixtures/tests. Prefer shared runtime contract fixtures when adding or changing WS01 -> WC01 evidence shapes.

If WC01 starts consuming a new WS01 field, add or update a runtime contract fixture and the relevant normalized concern/policy test in the same change.

For CertScore v2, artifact contracts must stay typed, bounded, display-safe where projected, and covered by focused fixtures/tests. Do not carry raw cookies, raw request/response bodies, sensitive query values, unbounded DOM/policy text, or raw Nano reasoning into reviewer, report-adapter, or web-facing artifacts.

Production v2 Lambda policy-semantic review must consume retained policy evidence from the checksum- and size-verified `CanonicalEvidenceBundle.json` S3 pointer recorded on `v2_lambda_result.received`. `scan_document_sources` is a legacy/fallback input and must not be assumed to contain v2 Lambda policy surfaces. Keep this handoff typed, bounded, restricted to approved scanner regions, and fail closed when retained artifact metadata does not verify.

### Scan reliability and evidence quality

Ongoing scanner calibration is governed by `docs/certscore-v2/scan-quality-calibration-program.md`, its machine-readable registry, its central all-channel contact ledger, and its repository-controlled manual ledger. For scanner-quality changes, use deterministic fixtures and retained replay first, then owned canaries and a ledger-selected, cooldown-aware rotating public sample; the capability lanes are stable, not the public domains. Do not treat the latest three scans or any fixed public-site set as an acceptance sample. Run `pnpm v2:calibration-registry-check` before live calibration, require a successful central contact-history export, use the canonical target selector, persist the run with an idempotent key, and review/commit the generated repository ledger candidate. Live selection must fail closed when central history is unavailable. Luna owns benchmark and baseline decisions; SO owns production canaries, public-target eligibility/cooldowns, and operational escalation.

For GDPR/ePrivacy scan-quality work, start by auditing retained evidence, normalized concerns, concern policy, and unified finding projection before changing display code. Missing, downgraded, or unclear findings should be traced to the first broken point in the evidence pipeline.

Preserve evidence quality over deploy speed or runtime size. Full Chromium remains the default browser runtime for scanner/validation paths unless the user explicitly approves a browser-runtime change after an evidence-quality review.

Do not remove or downsample evidence artifacts, screenshots, browser traces, consent-flow proof, runtime diagnostics, or policy-surface context as a deploy optimization unless the change includes an explicit quality assessment and focused tests/fixtures showing GDPR/ePrivacy evidence is not degraded.

When a GDPR/ePrivacy signal is missing, prefer one of these fixes in order: upstream WS01 observed evidence capture, the WC01 typed evidence contract/fixture, WC01 normalized concern construction, WC01 concern policy, then unified finding/checklist projection. Do not create display-only fallbacks for missing evidence.

### Scan timing triage

When asked why a scan was slow, inspect retained timing artifacts before guessing. For local v2 DAG Lambda scans, start with the scan artifact directory and read:

- `V2ScanCorePhases.json` for scanner-core checkpoints, module start/finish order, and whether policy-surface work overlapped pre-consent runtime.
- `CanonicalEvidenceBundle.json` `modulesRun[].timingBreakdown` for child timings such as page navigation, early screenshot capture, consent UI capture/recapture, rendered policy discovery, policy fetch groups, vendor resolver, and artifact writes.
- `LocalV2DagLambdaManifest.json` for Lambda phase timings, scan tuning, runtime diagnostics, target region, proxy/egress, viewport, and artifact upload durations.
- `LambdaArtifactMirrorManifest.json` and scan events such as `v2_lambda_result.received` for post-Lambda result handoff, SQS polling, artifact mirroring, and WC01 materialization timing.

Report scanner core time separately from post-completion handoff. Call out overlapping lanes explicitly; for example, policy-surface extraction may run in parallel with the pre-consent path, so its duration should not be added to scanner wall time unless the phase checkpoints show it was awaited after pre-consent. Preserve evidence quality when optimizing slow phases such as early screenshot capture or rendered footer/header discovery.

### Canonical classification registries

Use canonical tracker, vendor, CMP, and domain classification registries for classification logic. Do not create feature-specific, regulation-specific, or display-specific vendor/domain registries unless the user explicitly approves a new canonical registry.

If a module needs different thresholds, severity, or status treatment, express that as WC01 policy over canonical classifications, not duplicated domain/vendor lists.

`packages/shared/src/known-cmps.ts` `KNOWN_CMP_REGISTRY` is the canonical CMP registry. Use it for CMP identity, aliases, domains, cookies, DOM selectors, globals, standards, and infrastructure treatment. CMPs may also appear in vendor resolution and vendor lists as consent-management vendors, but do not create a competing CMP list when the classification belongs in `KNOWN_CMP_REGISTRY`.

For CertScore v2 endpoint/vendor attribution, use `packages/certscore-vendor-resolver` as the canonical resolver home. Do not add local endpoint or vendor lists inside scan modules, report adapters, dry-run bridges, or docs when the classification belongs in the resolver.

`packages/certscore-contracts/src/legal-framework-validity.ts` `LEGAL_FRAMEWORK_VALIDITY_REGISTRY` is the canonical registry for named, time-sensitive legal or regulatory frameworks recognized in retained policy text. Use it for framework identity, aliases, subject area, effective dates, invalidation or supersession dates, successor relationships, authoritative source metadata, and safe review wording. Do not add checklist-specific or display-specific stale-framework lists. Framework status must be evaluated relative to the scan date and carried through typed evidence, normalized concern, concern policy, and checklist/finding projection.

Multilingual privacy-surface and consent-control coverage supports the 40 typed locales enumerated by `SUPPORTED_PRIVACY_EVIDENCE_LOCALES`. These surfaces and controls must use `PRIVACY_EVIDENCE_LOCALE_REGISTRY` plus their canonical classifiers. GDPR Transparency topic extraction has its separately calibrated locale set in `SUPPORTED_GDPR_TRANSPARENCY_LOCALES` and must use its canonical topic classifier. Localized text should normalize to typed evidence before findings. Do not add display-layer phrase lists, raw text shortcuts, or consent-clicking runtime behavior for multilingual coverage.

Consent UI control discovery must use the canonical consent-control label classifier/registry for label-based classification of accept, reject, options/manage, and privacy opt-out controls. Do not add feature-specific or display-specific accept/reject/options regexes when the same rule belongs in the canonical classifier. New language terms, CMP label variants, or consent-control synonyms should be added to the canonical registry with typed intent, locale, match strength, optional variant, and focused tests.

Consent-control discovery should use canonical control terms not only for final label classification, but also for bounded scanner control-inventory candidate discovery. If a CMP renders localized controls as spans, divs, custom elements, shadow DOM content, or other text-ish interactive surfaces, prefer feeding canonical consent-control terms and locale context into the inventory probe rather than adding scanner-local phrase lists. When broadening control discovery, guard against evidence inflation: do not retain composite parent containers that merely concatenate multiple child controls such as `Settings Reject Accept`. Retain the individual actionable controls instead, and cover new discovery behavior with focused fixtures/tests.

Keep consent-control intents distinct. `reject` means refusal of optional cookies, tracking, or consent, including necessary-only equivalents. `privacy_opt_out` is refusal-adjacent evidence for sale/share, targeted advertising, legitimate-interest objection, or broader privacy-choice surfaces, but it must not automatically satisfy GDPR/ePrivacy first-layer cookie-banner reject availability. `options` may indicate a path to choices, but does not prove reject availability without retained deeper-path evidence.

WC01 display, executive summary, checklist, and top-finding code must not infer consent findings directly from raw labels. Label evidence should flow through observed structured evidence, normalized concerns, concern policy, and unified finding/checklist projection.

### Display and summary rules

Display copy may explain retained evidence and the already-determined policy/checklist status. Display copy must not create, upgrade, suppress, or infer findings, and must not change status, severity, eligibility, or regulatory posture.

Executive summaries and top findings may rank, allowlist, suppress, or group already-projected findings only. Top findings should be traceable to unified finding IDs or checklist/regulatory projection rows. Do not create executive-only findings from raw signals or display context.

DB repair and backfill scripts may repair records, but must not create findings that bypass normalized concern construction, concern policy, and unified finding/checklist projection.

When retained evidence includes a resolved vendor and reliable first-seen timing, finding and checklist descriptors should identify the vendor and first-seen time. Keep this descriptive only: missing display detail must not change finding eligibility or cause display code to infer a vendor or timestamp.

Evidence Mix uses `Essential` only for genuinely necessary functional, security, authentication, transaction, or service-delivery runtime activity. Use `Contextual` for consent-management, disclosure, governance, policy-surface, or page-context evidence that explains the scan but is not itself essential runtime activity. CMP identity or banner context is `Contextual`; a genuinely necessary functional runtime request remains `Essential`.

### Policy semantic validity

Policy review must keep four questions separate: whether disclosure text exists, whether the evidence is relevant to the checklist topic, whether a named time-sensitive mechanism was current on the scan date, and whether legal compliance has been established. Evidence for one topic must not satisfy another topic merely because it appears nearby in the same excerpt.

Policy-review absence labels are coverage-gated. `not_observed_with_sufficient_coverage` is permitted only when the governing target source was retained, the document is usable and attributable to the target or a confirmed first-party brand, the relevant section is complete and untruncated, material linked supplements were retained or shown irrelevant, and any required runtime lane is usable. Otherwise use `insufficient_retained_evidence`. Caveats in rationale text must not rescue an absence label whose deterministic coverage preconditions failed.

Keep evidence-presence topics distinct from completeness or adequacy. One retained named vendor, recipient category, substantive right, or cookie/storage identifier may establish the corresponding presence signal; it does not establish that the disclosure or inventory is complete. Name findings for the evidence they prove. Canonical policy-review display labels are `Processing-purpose disclosure`, `Processing legal-basis language`, `Retention period or substantive criteria`, `International-transfer disclosure`, `Named vendors or recipient categories`, `Substantive privacy-rights signals`, `Observed cookie/storage names`, and `Policy/runtime comparison`.

`Policy/runtime comparison` is a comparison result, not a generic disclosure-presence row. Compare a specific retained policy promise only with a directly comparable runtime fact in the same jurisdiction and consent state. Use typed outcomes equivalent to no material mismatch retained, material contradiction retained, insufficient comparison evidence, or ambiguous comparison. Mutual silence is not alignment.

Policy-document ownership is part of evidence quality. Retain typed owner entity, target relationship, confidence, and reason codes. A service-provider or unrelated policy may be retained as vendor evidence but must not establish the scanned target's policy coverage or support a target-policy absence conclusion.

Invalidated, superseded, or not-yet-effective framework references are retained evidence and should produce an evidence-scoped review signal. They must not receive unqualified `Observed` credit, positive scoring that hides the stale reference, or customer-facing language implying that the named mechanism establishes compliance. Current framework or safeguard language may support disclosure presence, but does not by itself prove that the site qualifies for or correctly implements that mechanism.

International-transfer disclosure presence and transfer-framework validity are separate checks. An obsolete framework reference must produce the deterministic `Outdated transfer framework referenced` review signal and must not, by itself, turn an otherwise supported international-transfer disclosure row into `conflicting`.

Implement policy-validity rules in the shared evidence and policy pipeline, with deterministic fixtures covering topic separation and scan-date transitions. Do not implement validity checks as display-only keyword matching, Nano-only judgment, or executive-summary-only findings.

### Legal conclusion language

CertScore reports risk signals, not legal determinations. User-facing copy must not state or imply definitive legal violations unless explicitly supported by product policy and retained evidence.

Prefer evidence-scoped language such as "signal observed", "review recommended", "not evaluated", or "insufficient evidence".

Internal v2 docs and artifacts should follow the same posture: no legal-conclusion language, no raw evidence leakage, no production eligibility claims, and no customer-facing copy unless separately approved.

### Monorepo structure

```text
WC01/
├─ apps/
│  ├─ web/                  # Product-facing Next.js web app (certscore.ai)
│  ├─ validation-web/       # Validation ops admin UI (lightweight Next.js app)
│  ├─ validation-worker/    # Background validation worker (TypeScript/Node)
│  └─ runtime-harness/      # Runtime harness (minimal scaffolding)
├─ packages/
│  ├─ certscore-contracts/   # CertScore v2 typed scanner/review/report contracts
│  ├─ certscore-scan-core/   # CertScore v2 browser evidence capture core
│  ├─ certscore-review-engine/ # CertScore v2 evidence interpretation engine
│  ├─ certscore-report-adapter/ # CertScore v2 internal projection, shadow, and dry-run adapters
│  ├─ certscore-vendor-resolver/ # CertScore v2 canonical vendor/product resolver
│  ├─ certscore-sdk/         # CertScore Pulse TypeScript SDK
│  ├─ certscore-mcp/         # CertScore Pulse MCP server
│  ├─ shared/               # Shared constants, types, validators, scoring config, scheduling helpers
│  ├─ db/                   # PostgreSQL query helpers, migrations, seed SQL, env helpers
│  ├─ ui/                   # Reusable UI primitives (React, Tailwind)
│  ├─ validation-shared/    # Validation-specific types, constants, and finding-promotion helpers
│  └─ web-bot-auth/         # Server-only Web Bot Auth signing and key-directory helpers (Cloudflare Verified Bot)
├─ scripts/                 # Operational, migration, and audit scripts (TS via tsx)
├─ infra/aws/               # AWS infrastructure definitions (web-ecs, validation)
├─ docs/                    # Architecture docs, runbooks, and checklists
├─ .github/workflows/       # CI/CD pipelines
├─ package.json             # Root scripts and devDependencies
├─ pnpm-workspace.yaml      # Workspace declaration
├─ turbo.json               # Turbo pipeline (build, dev, typecheck, clean)
└─ tsconfig.base.json       # Shared TypeScript config with path mappings
```

### Workspace packages

| Package | Path | Purpose |
|---|---|---|
| `@website-signal-risk-scanner/web` | `apps/web` | Next.js 15 + React 19 product app. Public marketing pages, authenticated dashboard, API routes, scan reporting. |
| `@website-signal-risk-scanner/validation-worker` | `apps/validation-worker` | Long-running TypeScript worker. Processes validation jobs, nano-document retrieval, LLM-driven finding validation, and scheduler sweeps. |
| `@website-signal-risk-scanner/validation-web` | `apps/validation-web` | Next.js admin UI for validation ops. |
| `@website-signal-risk-scanner/shared` | `packages/shared` | Cross-cutting types, constants, validators, scoring rules, taxonomy, and scheduling utilities. |
| `@website-signal-risk-scanner/db` | `packages/db` | PostgreSQL client helpers, S3 helpers, migrations (`packages/db/migrations/`), and seed data. |
| `@website-signal-risk-scanner/ui` | `packages/ui` | Reusable UI primitives (Button, Card, Badge, etc.) built with React and Tailwind CSS. |
| `@website-signal-risk-scanner/validation-shared` | `packages/validation-shared` | Validation-specific types, financial-claims drafts, privacy-runtime findings, and promotion coverage reports. |
| `@website-signal-risk-scanner/web-bot-auth` | `packages/web-bot-auth` | Server-only HTTP Message Signatures signing and key-directory helpers for crawler authentication. |
| `@certscore/contracts` | `packages/certscore-contracts` | CertScore v2 scanner, review, and projection contracts. |
| `@certscore/scan-core` | `packages/certscore-scan-core` | CertScore v2 browser evidence capture core. |
| `@certscore/review-engine` | `packages/certscore-review-engine` | CertScore v2 evidence review engine. |
| `@certscore/report-adapter` | `packages/certscore-report-adapter` | CertScore v2 internal report projection, WC01 shadow, dry-run, reviewer-packet, and evidence-preview adapters. |
| `@certscore/vendor-resolver` | `packages/certscore-vendor-resolver` | High-confidence CertScore v2 vendor and product resolver. |
| `@certscore/sdk` | `packages/certscore-sdk` | TypeScript SDK for the CertScore Pulse API. |
| `@certscore/mcp` | `packages/certscore-mcp` | MCP server for CertScore Pulse. |

### Technology stack

- **Runtime:** Node.js 22–24
- **Package manager:** pnpm 10.6.3 with `node-linker=hoisted`
- **Build orchestration:** Turbo 2.5
- **Web framework:** Next.js 15 (App Router, `output: "standalone"`)
- **UI library:** React 19, Tailwind CSS 3.4, clsx, tailwind-merge
- **Language:** TypeScript 5.8 (strict mode, `noUncheckedIndexedAccess: true`)
- **Auth:** Better Auth (email/password + Google OAuth), Nodemailer for Gmail SMTP
- **Database:** PostgreSQL (raw SQL via `pg` package; no ORM)
- **Storage:** AWS S3-compatible (AWS SDK v3 + presigned URLs)
- **Browser automation:** Playwright (Chromium) — used by validation worker
- **LLM integration:** OpenAI API with role-based routing (`gpt-5.4-nano` extraction, `gpt-5.4-mini` review, optional escalation)
- **Validation / Schema:** Zod
- **Testing:** Node.js built-in test runner (`node --test`) executed through `tsx`
- **CI/CD:** GitHub Actions
- **Deployment target:** AWS ECS/Fargate (Docker multi-stage builds)

---

## Build and test commands

### Root-level scripts

```bash
# Install dependencies
pnpm install

# Build everything (Turbo)
pnpm build

# Typecheck everything (Turbo)
pnpm typecheck

# Clean build artifacts (Turbo)
pnpm clean

# Fast change-aware preflight gate
pnpm preflight:fast

# Fast deploy-all gate for web, validation/DB, and all v2 Lambda scanner regions
pnpm preflight:all

# Full local preflight confidence gate
pnpm preflight:full

# Dev mode — web only (parallel via Turbo)
pnpm dev

# Dev mode — validation worker only
pnpm dev:validation

# Dev mode — web + validation worker together
pnpm dev:all

# Dev mode — storage (local MinIO)
pnpm dev:storage:local
```

### Web app (`apps/web`)

```bash
# Local dev (port 3000)
pnpm --filter @website-signal-risk-scanner/web dev

# Typecheck (includes next typegen)
pnpm --filter @website-signal-risk-scanner/web typecheck

# Build
pnpm --filter @website-signal-risk-scanner/web build

# Env / runtime checks (requires apps/web/.env.local)
pnpm check-env
pnpm --filter @website-signal-risk-scanner/web check-runtime
```

For local browser review, always use `http://localhost:3000`. If port 3000 is already occupied, inspect the existing listener before starting another server; do not switch to an alternate port for WC01 review unless the user explicitly asks.

### Validation worker (`apps/validation-worker`)

```bash
# Local dev (watched)
pnpm --filter @website-signal-risk-scanner/validation-worker dev

# Typecheck
pnpm --filter @website-signal-risk-scanner/validation-worker typecheck

# Build (tsc)
pnpm --filter @website-signal-risk-scanner/validation-worker build

# Run deterministic scan pipeline tests
pnpm test:scan-pipeline

# Run scheduler once
pnpm dev:validation:scheduler

# Env / runtime checks
pnpm check-env:validation
pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime
```

### Workspace package builds

Shared packages must be built before the apps that depend on them:

```bash
pnpm --filter @website-signal-risk-scanner/shared build
pnpm --filter @website-signal-risk-scanner/ui build
pnpm --filter @website-signal-risk-scanner/db build
pnpm --filter @website-signal-risk-scanner/validation-shared build
pnpm --filter @website-signal-risk-scanner/web-bot-auth build
```

### CertScore v2 commands

V2 commands are internal diagnostic commands unless a task explicitly says otherwise. See `docs/certscore-v2/README.md` for full command sequences and artifact expectations.

Common root scripts:

```bash
pnpm v2:scan
pnpm v2:review
pnpm v2:calibrate
pnpm v2:shadow-project
pnpm v2:wc01-shadow
pnpm v2:wc01-allowlist-dry-run
pnpm v2:wc01-concern-input-dry-run
pnpm v2:wc01-concern-policy-simulate
pnpm v2:wc01-normalized-concern-adapter
pnpm v2:wc01-concern-policy-compare
pnpm v2:wc01-reviewer-packet
pnpm v2:wc01-evidence-preview
pnpm v2:wc01-policy-copy-review
pnpm v2:wc01-production-readiness-gate
pnpm v2:wc01-product-surface-proposal
pnpm v2:wc01-artifact-chain-smoke
```

V2 commands that perform live browser scans typically require `apps/web/.env.local` and, for Nano-assisted paths, `OPENAI_API_KEY`.

---

## Code style guidelines

### TypeScript configuration

- Base config: `tsconfig.base.json` at repo root.
- Strict mode is enabled.
- `noUncheckedIndexedAccess: true` — always handle `undefined` when indexing arrays/records.
- `isolatedModules: true` — each file must be independently compilable.
- Path mappings are defined in `tsconfig.base.json` for all workspace packages.

### Naming and organization

- Use **kebab-case** for filenames (`create-preview-scan.ts`, `unified-findings.ts`).
- Co-locate related logic: a domain folder under `server/` or `lib/` contains the module, repository, and tests together.
- Tests are co-located as `*.test.ts` or `*.test.tsx` next to the source file.
- Server-only modules must import `"server-only"` to prevent accidental client bundling.

### Environment handling

- **Do not** use a root `.env.local` for app runtime configuration.
- **Local development:** use `apps/web/.env.local` as the single runtime env file.
- Copy `apps/web/.env.example` to `apps/web/.env.local` to get started.
- `.env.example` at the root is only a reference template.
- Environment variables are validated with Zod schemas scoped to each runtime (web vs. worker).

### Finding pipeline convention (critical)

New `WC01` finding surfacing or gating logic **must** follow this order:

1. **Normalize inputs into a concern**
2. **Apply concern policy**
3. **Promote eligible concerns into unified findings**

Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.

Key pipeline files:
- `apps/web/lib/scans/normalized-concerns.ts`
- `apps/web/lib/scans/concern-policy.ts`
- `apps/web/lib/scans/unified-findings.ts`
- `apps/web/lib/scans/finding-evidence-gates.ts`

V2 dry-run adapters may produce internal candidate artifacts for comparison and reviewer workflow, but they must not call production concern policy, persist normalized concerns, or create unified findings unless a production integration proposal is explicitly approved.

---

## Testing instructions

### Test framework

This repo uses **Node.js built-in test runner** (`node:test` and `node:assert/strict`), not Jest or Vitest. Tests are executed via `tsx` so TypeScript files run directly.

### Running tests

```bash
# Validation pipeline tests (deterministic, runs without external secrets)
pnpm test:scan-pipeline

# Web-bot-auth package tests
pnpm test:web-bot-auth

# Individual test files (example)
node --import tsx --test apps/web/server/preview-scan/create-preview-scan.test.ts
node --import tsx --test packages/shared/src/regulatory-review/regulatory-review.test.ts
```

### CertScore v2 package tests

Run focused v2 tests for v2 package changes:

```bash
pnpm --filter @certscore/contracts test
pnpm --filter @certscore/vendor-resolver test
pnpm --filter @certscore/scan-core test
pnpm --filter @certscore/review-engine test
pnpm --filter @certscore/report-adapter test
```

Run focused v2 typechecks for v2 package changes:

```bash
pnpm --filter @certscore/contracts typecheck
pnpm --filter @certscore/vendor-resolver typecheck
pnpm --filter @certscore/scan-core typecheck
pnpm --filter @certscore/review-engine typecheck
pnpm --filter @certscore/report-adapter typecheck
```

### CI pipelines

- **`.github/workflows/accessibility-validation.yml`** — runs on PRs and `main` pushes:
  - `web-validation-contract` job: typechecks web, builds shared deps, runs cutover-contract and preview-scan tests.
  - `worker-scan-pipeline-tests` job: installs Playwright Chromium, typechecks validation-worker, runs `pnpm test:scan-pipeline`.
  - `live-validation-smoke` job: runs only when runtime secrets are configured; executes `smoke:validation` against the live database.
- **`.github/workflows/web-aws-ecs-deploy.yml`** — deploys `apps/web` to AWS ECS/Fargate on `main`.
- **`.github/workflows/validation-aws-deploy.yml`** — deploys validation web + worker + scheduler to AWS ECS/Fargate on `main`.

### Pre-ship verification

For deployment-bound changes, prefer the fast local gate before commit/push:

```bash
pnpm preflight:fast
```

`preflight:fast` is change-aware and runs only the deploy-targeted checks implied by the diff against `origin/main`, plus staged and unstaged local changes. Use `PREDEPLOY_BASE_REF=<ref>` or `-- --base <ref>` when comparing against a different deployed SHA.

When the user says **deploy all**, use the fast deploy-all gate before committing or pushing:

```bash
pnpm preflight:all
```

In this repo, **deploy all** means the public web app, validation worker, migrations applied from the target web image before ECS promotion, and the v2 DAG Lambda scanner images in all three approved scanner regions: `eu-central-1`, `eu-west-1`, and `us-west-1`. It does not run a separate production DB deployment lane. Treat those as the canonical Lambda scanner regions unless the user explicitly approves a region change.

Use the full local gate when the change touches shared build infrastructure, broad dependency surfaces, release-critical scan behavior, or when you need maximum local confidence before pushing:

```bash
pnpm preflight:full
```

For manual verification outside the preflight scripts, run:

```bash
pnpm turbo run typecheck
pnpm turbo run build
```

For validation changes, also run:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker typecheck
pnpm test:scan-pipeline
```

---

## Security considerations

### Auth and session

- Auth is handled by **Better Auth** with the `nextCookies()` plugin.
- Middleware (`apps/web/middleware.ts`) protects `/app/:path*` routes using `getSession` with `disableCookieCache: true` and `returnHeaders: true`.
- Unauthenticated users are redirected to `/login?next=...`.
- Google OAuth redirect URIs must be explicitly allow-listed in the provider console.
- Local auth credentials and secrets must never point at production.

### Database access

- The web app and validation worker share the same PostgreSQL database.
- DB access is through raw SQL via the `@website-signal-risk-scanner/db` package.
- Migrations live in `packages/db/migrations/` and must be applied in order.
- There is no ORM; queries are handwritten parameterized SQL.

### Production DB inspection

For production DB inspection, use the ECS psql one-off task instead of local DB connections or direct secret access:

- task definition: `certscore-prod-psql-oneoff:1`
- `PGSSLMODE=require`
- same network as `certscore-validation-worker`
- SQL passed via `QUERY_B64`
- output read from CloudWatch logs

Do not use local production DB tunnels, ECS Exec, or copied secrets for routine inspection. Prefer `SELECT`-only queries with tight predicates and `LIMIT`. Avoid broad scans, writes, repairs, or migrations unless the user explicitly approves them.

### Storage

- Report artifacts and PDFs are stored in an S3-compatible bucket.
- Presigned URLs are used for secure client-side access.
- Local development uses MinIO (`pnpm dev:storage:local`).

### Web Bot Auth

- Optional Cloudflare Verified Bot workflow.
- Requires a private key PEM and signature agent URL.
- Commands: `pnpm web-bot-auth:generate`, `pnpm web-bot-auth:print`, `pnpm web-bot-auth:test-request`.

### Environment isolation

- Keep local and production environments strictly isolated.
- Local `NEXT_PUBLIC_APP_URL` should be `http://localhost:3000`.
- Production secrets must exist only in the active AWS/web or worker deployment settings.
- Do not commit `.env.local` files.

---

## Git and deployment workflow

- Make changes in the repo, then stage the relevant files with `git add`.
- Create a commit with a clear message.
- Push the branch to GitHub instead of deploying an uncommitted working tree directly to any production host.
- Prefer Git-based deploy promotion through the connected AWS ECS deployment workflows, but verify which runtime is actually serving `certscore.ai` before claiming production is updated.
- Web deploys are forward-only: the target revision must contain the Git SHA currently reported by the production `/api/version` endpoint. Merge the live revision into the target branch before deploying; use the explicit non-descendant override only for an intentional emergency rollback.

### Canonical deployment selection

Before deploying, require a clean committed worktree, discover the revision currently served by the production `/api/version` endpoint, and use that live revision as the comparison base when previewing the canonical deployment plan.

Use targeted deployment modes whenever scope is known:

- `pnpm deploy:web -- --base <live-sha> --plan` for public web changes.
- `pnpm deploy:validation -- --base <live-sha> --plan` for validation worker or scheduler changes.
- `pnpm deploy:scanners -- --base <live-sha> --plan` for v2 DAG Lambda scanner changes.
- `pnpm deploy:db -- --base <live-sha> --plan` only for an explicitly approved standalone migration.
- `pnpm deploy:all -- --base <live-sha> --plan` only for intentionally coupled cross-system changes.

Do not use deploy-all merely because deployment scope is uncertain. Run the change-aware readiness check and inspect runtime consumers first.

Files under `apps/web/server/scans/` are conservatively classified as validation-related because some scan modules are shared with validation workflows. Do not deploy validation solely because of that classification; determine whether the validation worker actually consumes the changed behavior.

A preflight result applies only to the exact source state that was tested. Rerun the relevant gate after any material change. The canonical deploy command may skip a duplicate local preflight only when the exact clean commit already passed it and the deployment workflow's required tests, typechecks, and guards remain enabled.

Routine scanner deployments must reuse the existing runtime base, build the scanner image once in the canonical build region, skip registry cache export, replicate the image to all approved regions, and verify digest parity and Lambda health. Use `--push-runtime-base` only when Chromium, Playwright, OS packages, workspace dependencies, or the Lambda runtime-base Docker stage genuinely changed.

Routine public web deployments use three ECR-managed artifacts in addition to the immutable Git-SHA image: `${WEB_IMAGE}:buildcache`, `${WEB_IMAGE}:runtime-base`, and `${WEB_IMAGE}:runtime-base-cache`. The web workflow publishes the BuildKit cache with `mode=max` and builds the runner from the reusable ARM64 runtime base. The first deployment after this contract is introduced may bootstrap the runtime base; subsequent application-only deployments should reuse it. Rebuild the web runtime base when the Node image, OS/runtime packages, runtime dependency versions, or the web runtime-base Docker stage changes. Do not delete or retag the mutable cache/base tags during cleanup, and treat cache export, runtime-base export, and image push as valid build progress when monitoring a deployment.

Deploy-all applies database migrations through the target web image before ECS promotion. It does not run a separate production DB lane. Use the standalone DB deployment only when an independently approved migration must run outside a web release.

After deployment, verify the workflow result, live revision, expected runtime target, and affected production behavior. Keep verification read-only by default. Do not create production scans, records, users, or other persistent state unless the user explicitly authorized that verification.

### Production deploy monitoring

Before starting or monitoring an AWS ECS production deployment, read and follow
`docs/aws-ecs-deployment-runbook.md`. This is required even when the workflow
was started by another agent or operator.

A GitHub Actions step remaining active is not evidence that it is stuck. The
routine web image path uses a native ARM64 GitHub-hosted runner; the manual x64
fallback may take 45–60 minutes after a cold invalidation. Do not
cancel while logs show compilation, static generation, build-trace collection,
image export, registry-cache export, or image push progress. Before canceling,
inspect the available logs and require both:

1. no new log output for the runbook's silence threshold; and
2. no observable build, export, or push progress.

Prefer workflow-enforced timeouts over manual cancellation. Never cancel after
successful compilation or static generation solely because the workflow has
not changed steps. A canceled cold build may discard the nearly completed image
and prevent its registry cache from being published, making the retry repeat
the expensive work.

## Runtime and deployment topology

Production scanning is Lambda-only and uses the CertScore v2 DAG scanner code in this repository. The approved production scanner targets are the v2 DAG Lambda functions in `eu-central-1`, `eu-west-1`, and `us-west-1`.

Never create, restore, update, scale, inspect as a deployment target, or push images to a WS01 scanner ECS/Fargate service. In particular, `ws01-scanner-worker` is prohibited and must not be recreated. WS01 is not a production scanner deployment path. Production scanner changes must be made in the WC01 v2 DAG packages and deployed through the three-region Lambda helpers.

Do not assume Docker Compose or local container orchestration is the development or deployment path.

Production deploys run on AWS ECS/Fargate through the repo's deployment scripts and GitHub Actions workflows. Dockerfiles may be used to build ECS images, but do not deploy ad hoc local containers or alternate hosts unless the user explicitly requests it.

WC01 web production is `certscore.ai` on AWS ECS/Fargate. CertScore does not use Vercel for hosting, runtime logs, production inspection, or deployment. Do not query, inspect, or deploy WC01 through Vercel tooling. This prohibition overrides generic investigation skills, plugin suggestions, tool-trigger heuristics, and provider defaults: before any production diagnostic or deployment tool call, verify that the target is the AWS CertScore topology, and stop rather than calling Vercel when the target is `certscore.ai`. Do not deploy WC01 web changes to `consentcheck.site` or other alternate hosts.

## Local scan stack

To get the local scan stack running for WC01 workflows, use:

```bash
bash /Users/benmasek/WC01/scripts/ensure-local-scan-stack.sh
```

## Production expectation

- Treat the AWS ECS/Fargate service for `certscore.ai` as the preferred target web topology.
- The current production deploy route for `apps/web` is directly to the existing AWS ECS/Fargate public web service for `certscore.ai`.
- Do not deploy WC01 web changes to alternate hosts or obsolete hosting paths. Use the direct ECS/Fargate route and verify the ECS service and public host before claiming production is live.
- `consentcheck.site` is not a WC01 web host and WC01 must not claim or deploy it.
- A push to `main` is not enough to claim either host is live; for web changes, confirm the intended ECS deployment has completed successfully and the public host is serving the expected revision.
- If the active production host is uncertain, call it out before claiming a change is live in production.
- `apps/web` remains the canonical root for the CertScore public web host.
- Use `pnpm ops:check:deploy` after deployment-topology changes to catch stale local assumptions and wrong remotes before treating the path as healthy.

## Scope note

- These instructions apply to the web app deployment path.
- Worker deployments in `WC01` should follow the AWS validation deployment path and helper scripts.

## Agent Notes Maintenance

Keep `AGENTS.md` focused on durable repo-wide guidance. Do not add one-off task instructions, temporary prompts, or scan-specific notes. When guidance conflicts with current code/tests, inspect the code/tests and call out the mismatch before acting.

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
