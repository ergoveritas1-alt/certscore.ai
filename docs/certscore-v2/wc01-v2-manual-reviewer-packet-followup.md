# WC01 v2 Manual Reviewer Packet Follow-Up

## Executive Summary

Phase 1 artifact-only manual reviewer packets are implemented for WC01 v2 dry-run diagnostics.

The new stage reads saved `Wc01V2ConcernPolicyComparisonDryRun` artifacts, validates the same internal guardrails, assigns internal queue lanes, and emits per-site JSON/Markdown reviewer packets plus batch summaries.

This remains internal-only. It does not call production concern policy, persist normalized concerns, create unified findings, mutate reports, build checklist rows, produce executive/top-finding/scoring/regulatory-lens output, or create customer-facing copy.

## Pipeline Position

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
-> Wc01V2ConcernPolicyComparisonDryRun
-> Wc01V2ManualReviewerPacket
```

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-manual-reviewer-packet.ts`
- `packages/certscore-report-adapter/src/wc01-v2-manual-reviewer-packet-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-manual-reviewer-packet.ts`
- `packages/certscore-report-adapter/src/wc01-v2-manual-reviewer-packet.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

Command:

```bash
pnpm v2:wc01-reviewer-packet \
  --comparison-dir ./artifacts/v2-wc01-concern-policy-comparison-edge-consent \
  --out-dir ./artifacts/v2-wc01-reviewer-packets-edge-consent
```

Single-file mode:

```bash
pnpm v2:wc01-reviewer-packet \
  --comparison ./artifacts/v2-wc01-concern-policy-comparison-edge-consent/example.com/Wc01V2ConcernPolicyComparisonDryRun.json \
  --out ./artifacts/v2-wc01-reviewer-packets-edge-consent/example.com/Wc01V2ManualReviewerPacket.json
```

## Cohort Packet Results

| Cohort | Input files | Succeeded | Failed | Queue items | Sensitive-context items | Guardrail failures | Malformed artifacts |
|---|---:|---:|---:|---:|---:|---:|---:|
| Expanded fresh-registry | 10 | 10 | 0 | 11 | 0 | 0 | 0 |
| Stress fresh-registry | 12 | 12 | 0 | 11 | 2 | 0 | 0 |
| Edge consent | 30 | 30 | 0 | 34 | 11 | 0 | 0 |
| Policy-stress consent | 20 | 20 | 0 | 25 | 23 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 36 | 0 | 0 |

## Queue Lane Counts

| Queue lane | Count |
|---|---:|
| `standard_internal_review_candidate` | 45 |
| `sensitive_context_review_required` | 36 |
| `evidence_quality_review` | 0 |
| `copy_policy_review_required` | 0 |
| `blocked_suppressed_diagnostic_only` | 0 |

All 81 queue items also carry a `copy_policy_review_required` review flag because the comparison artifact does not represent approved customer-facing or reviewer-copy posture. This is a review flag, not a production lane promotion.

## Outcomes And Families

| Simulated outcome | Count |
|---|---:|
| `would_accept_for_internal_review` | 45 |
| `would_remain_internal_only` | 36 |
| `would_require_more_evidence` | 0 |
| `would_be_suppressed` | 0 |

| Candidate family | Count |
|---|---:|
| `pre_consent_tracking` | 39 |
| `pre_consent_cookie_storage` | 31 |
| `session_replay_behavioral_analytics` | 11 |

## Guardrail Results

| Guardrail | Result |
|---|---:|
| `productionEligible` true count | 0 |
| `topFindingEligible` true count | 0 |
| `gapEligible` true count | 0 |
| Forbidden `gap_observed` token matches | 0 |
| Raw blocked field matches | 0 |
| Legal-conclusion term matches | 0 |
| Production concern policy imports/calls | 0 |
| Persistence/unified finding/report wiring | none |
| Checklist/executive/top-finding/scoring/regulatory-lens wiring | none |

## Packet Shape

Each packet includes:

- packet version and source artifact metadata
- internal-only banner
- candidate and queue item counts
- queue items with candidate family, simulated outcome, queue lane, review flags, caveats, missing requirements, and guardrail status
- reviewer action options that always keep `productionEligible`, `topFindingEligible`, and `gapEligible` false
- batch and per-site Markdown summaries

The packet intentionally does not include raw cookies, raw request/response bodies, sensitive query values, unbounded DOM or policy text, legal-conclusion language, production report statuses, or customer-facing copy.

Because this stage reads only `Wc01V2ConcernPolicyComparisonDryRun`, fields such as vendor names, supporting purposes, diagnostic purposes, source ref IDs, display-safe excerpt IDs, confidence, and directness are marked unavailable at this layer. The comparison stage already proved those gates before producing candidates, but the packet does not reach backward into upstream artifacts to rehydrate details.

## Test Coverage Summary

Coverage added for:

- valid comparison artifact parsing
- unsupported version fail-closed behavior
- root and row-level production/top/gap eligibility fail-closed behavior
- forbidden gap token, legal term, and raw blocked field injection rejection
- queue routing for accepted, sensitive-context, missing-evidence, and suppressed outcomes
- reviewer action schema staying non-production, non-top-finding, and non-gap eligible
- comparison-safe output fields only
- batch continuation with malformed inputs reported as failures
- import-boundary checks preventing production policy/report/checklist/executive/top-finding/scoring/regulatory-lens/shared scan detail imports

Verification passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-reviewer-packet --help
```

## Recommendation

The artifact-only reviewer packets are ready for a narrow internal reviewer workflow trial focused on queue shape, lane labeling, and policy-review ergonomics.

They are not sufficient yet for full evidence adjudication because the approved input is comparison-only and does not retain detailed source refs, excerpt IDs, vendor names, or confidence/directness metadata. If reviewers need those details in the packet, the next step should be a separate contract refinement that carries safe evidence pointers forward into the comparison artifact, still without production integration or persistence.

Recommended next step: run a manual reviewer trial with these packet artifacts and collect policy-owner feedback on queue lanes, reviewer action options, and sensitive-context handling.

## Explicit Non-Goals

- No production concern policy call.
- No persisted normalized concerns.
- No unified findings.
- No checklist, report, executive, top-finding, scoring, or regulatory-lens output.
- No customer-facing copy.
- No production report integration.
- No `gap_observed` mapping.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
