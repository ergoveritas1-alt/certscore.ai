# Nano-first policy-review rollout

Status: retained-extraction reuse is implemented behind an off-by-default shadow flag; no hybrid output is production-projectable.

## Objective

Preserve the complete retained-evidence packet and deterministic policy invariants while moving routine semantic triage to `gpt-5.4-nano`. Use `gpt-5.4-mini` only for topics whose ambiguity, confidence, status, or policy/runtime comparison requires escalation.

This rollout does not reduce Nano evidence inputs or output quality. Cost reduction comes from avoiding Mini review for demonstrated-safe topic decisions, not from truncating retained policy evidence.

## Current production boundary

Only canonical `policy_semantic` artifacts produced by the approved `gpt-5.4-mini` alias or `gpt-5.4-mini-2026-03-17` snapshot may satisfy the existing narrow production projection approval. Nano artifacts use the separate `policy_semantic_nano_shadow` kind and remain `shadow`, `productionEligible: false`, and `usedForProductionProjection: false`.

Changing `CERTSCORE_REVIEW_MODEL` to Nano is not a rollout mechanism. The projection gate rejects unapproved requested and resolved models even when all row invariants pass.

## Stage 1: shadow measurement

Keep canonical Mini review unchanged. Enable Nano shadow on a controlled deployment with:

```text
CERTSCORE_ROUTINE_REVIEW_MODEL=gpt-5.4-nano
CERTSCORE_ROUTINE_REVIEW_SHADOW_ENABLED=1
```

The temporary result is one additional cached Nano review per new canonical content hash. Each Nano artifact stores per-topic routing decisions, Mini-reference parity, escalation count, missed mismatch topics, token use, and cache status. It never enters normalized concerns, concern policy, unified findings, scoring, or display.

Initial Mini escalation triggers are deliberately conservative:

- confidence below the topic-specific threshold;
- `ambiguous`, `conflicting`, or `not_observed_with_sufficient_coverage`;
- `insufficient_retained_evidence` until deterministic safe-bypass criteria are separately calibrated;
- every policy/runtime comparison except insufficient comparison evidence;
- incomplete or failed Nano review.

The initial observed-row confidence floors were calibrated against the full human-adjudicated corpus. They do not allow Nano absence or uncertainty decisions to bypass Mini, and they remain subject to the zero-unsafe-bypass corpus gate.

## Stage 2: corpus gate

Populate Nano shadow artifacts for the canonical 25-case, 200-row human-adjudicated corpus, then run:

```text
pnpm --filter @website-signal-risk-scanner/validation-worker benchmark:nano-policy-review
pnpm --filter @website-signal-risk-scanner/validation-worker gate:nano-policy-review
```

The benchmark is resumable. A completed artifact is reused only when its evidence hash and requested model match, so an interrupted run does not repay for completed cases or silently reuse stale evidence.

The Nano routing candidate passes only when:

- all corpus artifacts are available;
- the existing precision-first observed projection gate passes;
- every Nano-versus-gold mismatch is routed to Mini;
- no mismatch appears in a topic the router would bypass.

The evaluation reports the measured topic-level Mini reduction rate. Treat that number as the planning estimate; do not assume a savings percentage before the corpus is populated.

### August 8, 2026 corpus result

The first complete Nano lane produced 25 completed artifacts and zero failed artifacts across 200 adjudicated topic rows. After observed-row threshold calibration:

- 42 topics bypassed Mini and 158 routed to Mini;
- measured topic-level Mini reduction was 21%;
- observed precision was 100% and no bypassed row disagreed with the human label;
- observed recall was 35% and full-status exact agreement was 45%, so all non-observed, uncertain, conflicting, and insufficient rows remain Mini escalations;
- every case retained at least one Mini escalation, so this result does not eliminate whole Mini requests by itself;
- the Nano lane consumed 204,202 input tokens and 31,488 output tokens.

The candidate routing safety gate passes for shadow use, but the lane remains non-projectable. Meaningful Mini cost reduction will require a subsequent bounded-input design that sends Mini only the escalated topics and the verified retained passages relevant to them; topic bypass alone mostly reduces Mini output rather than its repeated full-packet input.

### Bounded Mini escalation result

The bounded escalation benchmark completed all 25 cases without a failed artifact. It preserved the precision-first metrics after adding a Nano/Mini consensus rule that prevents bounded Mini from creating a new observed row unless Nano also observed it.

- Mini input fell from 203,910 to 125,640 tokens: a 38.4% reduction.
- Mini output fell from 31,000 to 24,272 tokens: a 21.7% reduction.
- Bounded Mini cost fell by about 30.4% at the current standard token rates.
- The additional full Nano semantic pass cost almost as much as the Mini savings, leaving only about 3.0% combined model-cost reduction.
- Hybrid observed precision remained 100%, observed recall remained 35%, and exact agreement remained 44%, matching the existing precision-first posture rather than weakening evidence quality.

Conclusion: keep this path shadow-only. The bounded Mini transport is useful, but a duplicate full Nano semantic review is not cost-effective. A production proposal should reuse already-produced Nano extraction and typed passage-location artifacts, or use deterministic safe bypasses, instead of paying for a second full-packet Nano review.

### Retained-extraction reuse shadow

The next shadow path removes the duplicate full Nano semantic call. It reuses only an `observed` typed passage when all of these conditions hold:

- the topic is processing purposes, legal basis, retention, vendor/recipient disclosure, or data-subject rights;
- the retained evidence is topic-specific, `strong`, and has no extraction limitation;
- the document is usable, fetched, attributable to the target controller or a first-party brand, and has ownership confidence of at least 0.8;
- the retained evidence URL matches that document;
- either the excerpt matches the retained document text or the packet came from the checksum- and size-verified canonical bundle handoff.

International transfers, cookie inventory, policy/runtime comparison, every absence or uncertainty decision, and all missing, weak, stale, or unverifiable extraction evidence continue to Mini. The hybrid artifact kind is `policy_semantic_extraction_reuse_shadow`; it is always non-projectable.

Enable the controlled comparison with:

```text
CERTSCORE_EXTRACTION_REUSE_SHADOW_ENABLED=1
```

The canonical full Mini review remains unchanged during measurement. The shadow result records reusable topics, bounded Mini topics and tokens, transport reduction, and exact status parity against canonical Mini.

The historical 25-case corpus cannot yet evaluate this route because its independent reviewer packets intentionally omit model-derived extraction candidates, and its historical scan IDs have no matching `scan_document_sources` records in the currently configured database. The route correctly reports zero reusable rows for that data rather than reconstructing or inferring evidence.

A descriptive audit of the 500 newest local canonical bundles found 500 contract-valid bundles and 285 usable policy packets. Of those packets, 99 had at least one strictly reusable topic. The router would reuse 329 of 2,280 total topic rows (14.4%): 94 vendor-disclosure, 77 processing-purpose, 73 rights, 47 legal-basis, and 38 retention rows. This suggests a low-teens Mini reduction without an extra Nano call, but it is not a quality gate because the sample is not independently labeled and was not selected through the calibration registry.

### Dual-Nano 95% experiment

The first dual-Nano consensus experiment treated 95% Mini-cost reduction as a measurement target. Its raw result was 77.9% estimated Mini-cost reduction: 152 of 200 topics bypassed Mini and 48 used bounded Mini escalation. That result is rejected for quality reasons.

The apparent gain came from 110 topics where both Nano passes returned `insufficient_retained_evidence`. Corpus evaluation showed that many of those rows contained evidence Mini correctly recovered, including observed and conflicting gold labels. Agreed insufficiency therefore does not bypass Mini. The safe code routes every insufficient-evidence consensus back to Mini. The 42 high-confidence observed consensus rows had no corpus mismatch, but this is the same safe observed scope already measured by the single-Nano lane; a second full Nano pass did not expand it.

Consequences:

- 95% remains aspirational, not a rollout gate or quota.
- no Mini escalation may be suppressed to hit a cost target;
- dual Nano remains off by default and non-projectable;
- the unsafe 77.9% benchmark must not be quoted as an approved or deployable saving;
- the evidence-safe bounded-Mini benchmark remains the current semantic-routing baseline at roughly 30.4% Mini-only reduction before extra Nano cost.

### Cross-scan static Mini reuse

The production parallel-review path already separates six static policy topics from the two scan-specific runtime topics, but its former cache identity included scan-specific document IDs and the exact scan day. That limited reuse primarily to early/terminal phases of the same scan.

The static identity now:

- excludes scan-specific document IDs and target URL identity;
- remains bound to canonical policy URLs, retained text, typed ownership, target relationship, coverage, and extracted candidates;
- keys date sensitivity to the canonical legal-framework registry boundary rather than every calendar day;
- includes a hash of the framework validity registry, so a registry change invalidates reuse;
- rebinds cached row and deterministic-signal references to the current scan's retained document IDs before projection;
- records cached prompt tokens separately for cost telemetry.

This change does not bypass semantic work on new or changed policy content. It avoids repeating prior Mini work only when the retained static evidence and governing framework epoch are identical. Runtime cookie and policy/runtime-comparison topics remain scan-specific.

### Mini-exception runtime routing

On August 8, 2026, the product owner requested a more aggressive transition away from Mini while preserving evidence. The approved guarded runtime route removes Mini from two decisions that are already deterministic or fail closed:

- named cookie/storage presence is projected directly from the typed retained policy/runtime identifiers and carries deterministic row-level provenance;
- policy/runtime comparison remains `insufficient_retained_evidence` when no specific retained policy promise is directly comparable with a retained runtime fact; mutual silence is never treated as alignment;
- Mini is invoked for `policy_runtime_consistency` only when a bounded explicit tracking, cookie, pre-consent, or third-party promise has a comparable retained runtime observation;
- an unusable runtime lane cannot produce an absence, alignment, or contradiction result;
- the six static policy topics continue to use the approved Mini review and content-hash cache, so new or changed semantic policy content is not silently delegated to Nano.

This route is controlled by `CERTSCORE_MINI_EXCEPTION_ROUTING_ENABLED`. Turning it off immediately restores the prior two-topic Mini runtime-delta review. The canonical persisted artifact remains `policy_semantic`; every row records `reviewSource` as `mini`, `nano`, or `deterministic`, and the existing normalized concern → concern policy → unified checklist path remains unchanged.

The bounded Nano/Mini hybrid is not productionized: the adjudicated corpus showed that its compact transport missed observed evidence recovered by full Mini. Mini remains authoritative wherever semantic escalation occurs.

### Non-blocking production projection

With `CERTSCORE_PARALLEL_POLICY_PROJECTION_ENABLED=1`, the verified policy-evidence
lane owns static Mini execution and content-hash cache population. After
`v2_lambda_result.received`, WC01 performs a zero-wait lookup for a verified
completed full or static artifact. It may combine a completed static Mini
artifact with deterministic cookie inventory and deterministic no-comparison
handling, but it must not initiate a fresh model request, poll for model work,
or wait for a terminal model fallback.

When no verified completed semantic artifact is ready, the semantic review is
persisted as deferred/failed and is not production-projectable. A directly
comparable policy/runtime claim without a completed semantic result remains
`insufficient_retained_evidence`; it never becomes alignment, contradiction,
or absence. Retained evidence and deterministic findings remain available
through the canonical pipeline. This mode intentionally favors bounded report
latency while failing closed on semantic coverage.

### Nano-primary precision mode

The August 18, 2026 operating goal is fewer than 3% of unique Nano-reviewed
policy hashes invoking Mini. `CERTSCORE_NANO_PRIMARY_POLICY_REVIEW_ENABLED`
selects the candidate mode; its production infrastructure default remains off
until calibration passes.

The candidate mode uses one full retained-evidence Nano review, one bounded
topic-specific Nano recovery for routine uncertainty, deterministic cookie
inventory, and deterministic no-comparison handling. Low confidence,
ambiguity, insufficient evidence, and unproven absence do not invoke Mini.
After recovery they remain `insufficient_retained_evidence` and cannot create
absence findings. Mini is eligible only when a Nano row retains both supporting
and materially conflicting excerpts, verified policy source references, and
the canonical evidence invariants.

Measure Mini usage by unique canonical policy hash, not topic rows or cache
hits. The artifact records the 3% target, actual Mini invocation, recovery
topics, unresolved topics, and a deterministic 1% audit-sample selection. Audit
selection is telemetry only until a durable asynchronous review queue is
approved; it must not add report-readiness latency.

This mode trades semantic coverage for latency and cost until bounded Nano
recovery is independently calibrated. It must remain disabled in production
until a human-adjudicated corpus and a fresh cooldown-selected cohort establish
zero unsafe observed projections, acceptable observed coverage, and the
scan-level Mini invocation target.

## Stage 3: approval and bounded cutover

Before production routing, add a typed hybrid artifact contract with row-level model provenance and obtain explicit approval for the exact Nano-safe projection scope. The cutover must preserve these rules:

- Mini remains authoritative for every escalated topic.
- Nano failures and missing rows fail closed and route to Mini.
- No arbitrary daily Mini cap may suppress an escalation.
- Cache keys retain content hash, contract, prompt, schema, and model versions.
- Rollback is a single configuration change that restores canonical full Mini review.
- Production projection remains persisted artifact → normalized concern → concern policy → unified checklist/finding projection.

Stage 3 is intentionally not activated by the shadow implementation. Until its contract and approval exist, canonical Mini output remains the production path.

## Operational sequence

1. Deploy migrations `0170_policy_semantic_nano_shadow.sql` and `0171_policy_semantic_extraction_reuse_shadow.sql` with both shadow routes disabled.
2. Keep the duplicate full Nano semantic shadow off; its corpus economics are already known.
3. Enable retained-extraction reuse only for the reduced sentinel cohort and compare it with canonical Mini.
4. Confirm every shadow artifact is complete and non-projectable, and inspect every mismatch on reusable topics.
5. Build a fresh, cooldown-aware labeled calibration sample whose retained packets include the verified typed extraction evidence.
6. Tune eligibility only from retained evidence and adjudicated results; never by converting unknown or insufficient evidence to absence.
7. Propose the typed hybrid production contract and exact projection scope for separate approval only after zero unsafe reusable-topic mismatches.
