# Model-assisted review routing

CertScore uses model assistance to interpret retained evidence, not to observe browser facts or create production findings.

## Canonical flow

```text
retained scanner evidence
→ deterministic normalization and registries
→ Nano extraction / routine triage
→ Mini interpretation where required
→ optional bounded escalation
→ typed persisted review artifact
→ deterministic production eligibility
→ normalized concern
→ concern policy
→ checklist projection
```

Production findings continue to follow the canonical WC01 concern pipeline.
The July 25, 2026 approval permits a precision-first Mini supplement for GDPR
Transparency checklist rows only. It does not permit model output to create
scores, absence findings, unified findings, executive findings, or legal
conclusions.

## Roles

| Role | Default | Appropriate work |
|---|---|---|
| Extraction | `gpt-5.4-nano` | Passage location, candidate topics, name normalization, evidence compression, routine taxonomy validation |
| Review | `gpt-5.4-mini` | Policy semantics, contradictory evidence, legal-basis language, retention, transfers, rights, vendor disclosure, policy/runtime consistency |
| Escalation | unset | Selective high-impact cases that remain inconclusive or low-confidence after Mini |

Deterministic code remains authoritative for:

- observed runtime facts and first-seen times;
- canonical CMP, vendor, tracker, domain, and legal-framework registries;
- date-sensitive legal-framework validity;
- thresholds, severity, finding eligibility, scoring, and display projection.

## Configuration

```text
CERTSCORE_EXTRACTION_MODEL=gpt-5.4-nano
CERTSCORE_REVIEW_MODEL=gpt-5.4-mini
CERTSCORE_ESCALATION_MODEL=
CERTSCORE_MINI_REVIEW_ENABLED=1
CERTSCORE_ESCALATION_ENABLED=0
CERTSCORE_MODEL_REVIEW_MODE=enforced
```

Production validation infrastructure enables Mini in `enforced` mode.
Development examples remain conservative unless the developer explicitly
enables the same mode. Escalation remains disabled and also requires a
configured escalation model.

For a bounded local trial against an already-retained canonical v2 bundle:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker shadow:policy-review -- \
  --scan-id <completed-local-scan-uuid> --repeat 2
```

The first iteration performs the Mini review and the second verifies
content-hash cache reuse. This command remains shadow-only.

An enforced artifact becomes projectable only when all eight rows passed
`policy_review_invariants_applied_v1`. WC01 then projects only `observed` policy
topics with confidence of at least 0.85 and retained evidence excerpts.
Ambiguous, conflicting, insufficient, failed, and absence statuses remain
non-production. Eligible rows enter WC01 through normalized concern and concern
policy and remain checklist-only.

## Policy review contract

Mini receives a bounded packet containing:

- retained policy documents;
- document ownership, target relationship, and confidence;
- per-document capture completeness, section quality, and truncation limitations;
- deterministic and Nano extraction candidates;
- compact runtime context;
- runtime and policy-surface coverage outcomes;
- scan region and target URL;
- scan date;
- deterministic legal-framework matches.

Every policy topic must return exactly one status:

- `observed`
- `not_observed_with_sufficient_coverage`
- `ambiguous`
- `conflicting`
- `insufficient_retained_evidence`

Direct topic relevance is required. In particular:

- retention wording is not processing-purposes evidence;
- a transfer mechanism or certification is not processing-purposes evidence;
- named cookie identifiers support cookie-inventory coverage;
- incomplete capture cannot support a confident absence finding.

Canonical display names are evidence-aligned while stable internal keys remain unchanged:

- `processing_purposes` → Processing-purpose disclosure
- `legal_basis` → Processing legal-basis language
- `data_retention` → Retention period or substantive criteria
- `international_transfers` → International-transfer disclosure
- `vendor_disclosures` → Named vendors or recipient categories
- `data_subject_rights` → Substantive privacy-rights signals
- `cookie_inventory` → Observed cookie/storage names
- `policy_runtime_consistency` → Policy/runtime comparison

`not_observed_with_sufficient_coverage` is enforced after Mini. It requires a
usable governing source attributable to the target or a confirmed first-party
brand, complete relevant capture without packet or section truncation, complete
policy-surface inspection, and usable runtime coverage for runtime-dependent
topics. Failure of any precondition becomes `insufficient_retained_evidence`.

Policy/runtime comparison carries a dedicated typed outcome:

- `no_material_mismatch_retained`
- `material_contradiction_retained`
- `insufficient_comparison_evidence`
- `ambiguous_comparison`

Mutual silence does not establish alignment. A comparison requires a specific
retained policy promise and a directly comparable runtime fact in the same
jurisdiction and consent state.

International-transfer disclosure and framework validity are separate. The
canonical legal-framework registry emits an `Outdated transfer framework
referenced` deterministic review signal for invalidated or superseded
mechanisms. That signal does not make the disclosure-presence row conflicting
by itself.

Canonical v2 policy packets include the bounded opening excerpt plus retained, topic-specific policy sections. Legal-framework matches are prioritized before the packet limit so an obsolete mechanism outside the opening excerpt is not silently dropped. Duplicate policy-surface aliases with the same canonical URL are collapsed before review.

Observed cookie/storage names has an additional deterministic invariant after Mini:

- at least one specific, non-placeholder cookie or storage identifier retained from runtime or policy evidence is sufficient for `observed`;
- no minimum inventory size or dedicated cookie-policy capture is required;
- category-only cookie wording without an identifiable name is not enough;
- this topic measures retained identifier presence and does not grade policy inventory completeness.
- confidence reflects observation integrity, not the number of names retained.

Retention and data-subject-rights rows also have deterministic semantic floors:

- retention requires a stated period or substantive deletion/retention criteria; a generic statement that data is retained is downgraded to `ambiguous`;
- preference controls such as email unsubscribe or advertising opt-out do not establish general data-subject rights;
- rights coverage requires direct evidence of rights such as access, correction, deletion, objection, restriction, portability, or regulator complaint.

All responses use a strict structured-output schema and are validated again in application code. Missing, malformed, or failed responses produce an explicit failed/inconclusive artifact and cannot promote a finding.

## Cost and reliability controls

- Policy review is one bounded call per policy packet.
- Finding validation is batched by model role.
- Policy artifacts are cached by content hash, contract version, prompt version, schema version, and model.
- The same scan evidence is included once per batch rather than once per finding.
- Escalation is limited to high-impact or conflicting findings that remain inconclusive or below the confidence threshold.
- Stored metrics include cache use, latency, token counts, model provenance, status distribution, and failure state.

## Evaluation

Regression fixtures cover:

- Privacy Shield text not satisfying processing purposes;
- retention text not satisfying processing purposes;
- generic retention wording not receiving substantive retention credit;
- preference opt-outs not receiving general data-subject-rights credit;
- substantive purposes wording;
- observed cookie/storage names from retained runtime or policy evidence;
- session-replay vendor/time context;
- obsolete and current transfer-framework references;
- obsolete-framework separation from international-transfer disclosure;
- service-provider policy rejection for target-policy review;
- coverage-gated absence labels;
- typed policy/runtime comparison outcomes;
- incomplete retained coverage;
- multilingual policy language;
- malformed model output and model-call failure.

Artifacts must continue to be evaluated for precision, false-positive rate,
false-negative rate, disagreement with deterministic/Nano outputs, escalation
frequency, cache-hit rate, latency, and estimated cost. Production projection
is deliberately precision-first: low recall may omit supplemental credit, but
uncertain output cannot create a negative result.

The local policy-review cohort is defined in
`apps/validation-worker/fixtures/policy-review-gold-corpus.v1.json`. It contains
25 retained-scan candidates and 200 human-adjudicated topic decisions.
`human_adjudicated` records that the product owner reviewed retained evidence
and the three-model comparison. `independently_reviewed` remains available for
evidence-only review; both are honest qualifying human-review provenance.

Prepare evidence-only reviewer packets for every case that is not yet
independently reviewed:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker prepare:policy-review
```

The generated local bundle contains, per case:

- a bounded JSON evidence packet;
- a human-readable Markdown review packet;
- a response template for the reviewer to complete.

Regenerating the bundle refreshes evidence packets and Markdown, but it does not
overwrite an existing response file. If retained evidence changed, ingestion
rejects the stale response through the evidence-hash check.

The packet deliberately omits Mini/Nano outputs, provisional labels,
model-derived candidate classifications, and other reviewers' decisions. A
response must identify a human reviewer, attest that no model output or
provisional label was consulted, provide a rationale and retained-evidence
reference for all eight topics, and match the packet evidence hash.

After completed response files have been returned, validate and merge them into
a separate corpus candidate:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker ingest:policy-review
```

Ingestion fails closed on malformed responses, duplicate cases, model-assisted
review identities, unknown evidence references, or evidence-hash drift. It
never overwrites the canonical corpus directly. Review the generated
`policy-review-gold-corpus.v1.review-candidate.json` before promoting it.

Evaluate persisted shadow artifacts without making new model calls:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker evaluate:policy-review
```

Run the fail-closed rollout gate:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker gate:policy-review
```

The default full-model gate requires:

- at least 25 human-reviewed cases across at least 20 domains;
- complete artifacts and at least 20 labels per topic;
- at least five observed and five non-observed gold labels per topic;
- overall exact agreement of at least 85%;
- overall observed precision of at least 95% and recall of at least 90%;
- per-topic exact agreement of at least 80%, precision of at least 90%, and recall of at least 80%;
- zero failed human-reviewed artifacts.

The full-model gate remains stricter than the approved precision-first
supplement. It evaluates whether Mini could safely classify every row,
including absence and uncertain results. Failing that gate does not disable
the separately approved evidence-gated observed-only supplement.

The July 25 corpus has complete named-human adjudication for all 200 rows.
Accordingly, the precision-first assessment reports `productionEligible:
true` when observed precision, artifact coverage, invariants, and failure
thresholds pass. `fullStatusRolloutReady` remains a separate result and may
remain false until recall and exact agreement improve.
