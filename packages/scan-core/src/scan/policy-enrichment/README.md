# Policy Enrichment

`policy_enrichment` adds an auditable semantic-extraction pass for legal-policy pages without storing full raw policy bodies.

## What it stores

- `policy_enrichment`
  - normalized policy hash
  - structured policy topics, rights mechanisms, transfer mechanisms, retention periods
  - short summary
  - aggregate confidence and ambiguity
  - model / prompt provenance
  - actionable flags and review triggers
- `policy_evidence`
  - short supporting snippets only
  - deduplicated by hash
- `policy_review_queue`
  - low-confidence and high-impact review candidates

Full policy text is never persisted.

## Pipeline

1. Rule-first preprocessing
   - normalize text
   - detect obvious GDPR / DSAR / do-not-sell / children / transfer / retention signals
   - compute `needLlm`
2. Optional chunked LLM extraction
   - defaults to the low-cost extraction configuration
   - selects a small high-signal chunk subset for long policies
   - can be forced for live scans when higher semantic coverage is required
3. Deterministic merge
   - high-confidence winner for enum fields
   - majority + median confidence fallback
   - union + confidence filtering for lists
4. Evidence persistence
   - short snippets only, keyed by hash
   - page-level chunk diagnostics emitted to `scan_events` as `legal.policy_llm_chunk_diagnostic`
5. Review queueing
   - low confidence
   - policy/behavior conflict candidates
   - missing DSAR on higher-exposure scans

## Configuration knobs

- `POLICY_ENRICHMENT_MOCK_LLM=1`
  - enables the built-in mock client for local development and tests
- `forceLlm`
  - worker-level switch to force chunk extraction even when heuristics are clear
- `LLM_ENRICHMENT_MAX_ATTEMPTS`
  - overrides per-chunk retry count for provider errors and timeouts
- `LLM_ENRICHMENT_MAX_CHUNKS`
  - caps selected LLM chunks per page type
- `LLM_ENRICHMENT_TOTAL_BUDGET_MS`
  - caps total LLM extraction time across all policy pages in a single scan so long policies fall back conservatively instead of timing out the whole enrichment phase
- `LLM_ENRICHMENT_TIMEOUT_MS`
  - caps individual LLM requests; the live default is intentionally short so enrichment fails open instead of holding the scan open
- `LLM_ENRICHMENT_FORCE_LAST_CHUNK`
  - when set to `0`, disables mandatory tail-chunk selection for non-terms pages

Long privacy policies now prefer high-signal interior chunks over the trailing boilerplate chunk once enough DSAR/retention/contact-style sections are present. The default runtime posture is intentionally conservative for live scans: at most one selected page per supported policy type, a single attempt per chunk, a five-second per-request timeout, and a twelve-second total scan budget for policy LLM work. That reduces timeout-driven partial coverage on large policies without turning semantic enrichment into a full-scan bottleneck.
Current thresholds in code:

- high confidence: `0.80`
- moderate confidence: `0.60`

## Cost control recommendations

- Reuse prior enrichment whenever `normalized_policy_hash` and model/prompt versions match.
- Prefer rule-only fallback when semantic confidence is already high or no provider is configured.
- Keep chunk size and overlap conservative; they are deterministic and easy to tune later.
- Prefer selected high-signal chunks over sending every chunk of long policies.
- Review `policy_actionable_flags` volume before enabling forced LLM broadly.

## Human review runbook

Queue reasons currently include:

- `policy_behavior_conflict_candidate`
- `missing_dsar_high_exposure`
- `low_confidence_critical_fields`

Suggested review flow:

1. Open the scan and inspect the linked `policy_enrichment` row.
2. Check evidence snippets and runtime tracker signals.
3. Set `review_status`, `review_verdict`, and `reviewer_notes`.
4. If the verdict confirms a true conflict, keep the candidate flag and note the rationale.
5. If the policy page was incomplete or blocked, dismiss with notes and rerun on a fuller scan.

## Assumptions

- Node / TypeScript worker with Postgres persistence.
- A pluggable LLM client can be added later; the repo currently ships a mock extraction client for deterministic local testing.
- Small evidence snippets and hashes are acceptable to persist; raw policy bodies are not.
