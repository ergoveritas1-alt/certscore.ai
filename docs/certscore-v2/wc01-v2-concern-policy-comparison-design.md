# WC01 v2 Concern Policy Comparison Design

Design document only. Do not implement from this document without a separate approved implementation pass.

## Executive Summary

This document designs a future dry-run-only comparison stage:

```text
V2NormalizedConcernCandidateDraft
-> non-persisted WC01 concern-policy comparison dry run
```

The comparison would evaluate whether the current v2 normalized-concern candidate draft shape appears compatible with WC01 concern-policy expectations. It would compare candidate evidence, family, guardrails, and required review metadata against an internal policy simulation, then emit diagnostics about whether a candidate would likely be accepted, require more evidence, remain internal-only, or be suppressed.

The comparison would not:

- call production concern policy in a state-changing path
- persist normalized concerns
- create unified findings
- create checklist, report, executive, top-finding, scoring, or regulatory-lens output
- create customer-facing copy
- map anything to `gap_observed`

The stage must be non-persisted because the v2 candidate families are still policy-review artifacts, not approved production concerns. Production behavior must remain unchanged until policy/product/privacy and engineering owners separately approve a production integration proposal.

## Proposed Comparison Boundary

Input:

```text
V2NormalizedConcernCandidateDraft
```

Output:

```text
Wc01V2ConcernPolicyComparisonDryRun
```

The output is internal diagnostic only. It should be generated from saved adapter artifacts and should not mutate application state, report artifacts, persisted concerns, unified findings, checklist rows, executive rows, scoring, or regulatory-lens projections.

## Comparison Goals

The goal is to compare v2 candidate draft shape against WC01 concern-policy expectations without creating production concerns.

The comparison should answer:

- Is the candidate family recognized by the approved v2 policy scope?
- Are required source refs and display-safe excerpts present?
- Is confidence/directness sufficient for the proposed family?
- Are vendor purposes allowed or diagnostic-only?
- Does sensitive context require extra review metadata?
- Would the candidate likely remain internal-only?
- What missing requirements would block a later production policy proposal?

The comparison should not answer whether a customer-facing report finding exists.

## Possible Output Type

Proposed internal type:

```ts
type Wc01V2ConcernPolicyComparisonDryRun = {
  comparisonVersion: "wc01.v2_concern_policy_comparison_dry_run.1";
  source: {
    adapterVersion: string;
    sourceUrl?: string;
    scanId?: string;
    reviewId?: string;
    sourceArtifactPath?: string;
  };
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "comparison_review_only";
  candidateCount: number;
  comparisonResults: Array<{
    candidateId: string;
    sourceFamily: string;
    proposedNormalizedConcernKey: string;
    simulatedPolicyOutcome:
      | "would_accept_for_internal_review"
      | "would_require_more_evidence"
      | "would_remain_internal_only"
      | "would_be_suppressed";
    wouldPolicyAcceptCandidate: boolean;
    wouldPolicyRequireMoreEvidence: boolean;
    wouldRemainInternalOnly: boolean;
    wouldBeSuppressed: boolean;
    productionEligible: false;
    topFindingEligible: false;
    gapEligible: false;
    reasons: string[];
    missingRequirements: string[];
    guardrails: {
      noGapObserved: true;
      noLegalConclusionLanguage: true;
      noRawBlockedFields: true;
      noProductionEligibility: true;
      noTopFindingEligibility: true;
      noGapEligibility: true;
    };
  }>;
  blockedCandidates: Array<{
    candidateId?: string;
    proposedNormalizedConcernKey?: string;
    blockReasons: string[];
  }>;
  guardrails: {
    noProductionConcernPolicyCall: true;
    noPersistence: true;
    noUnifiedFindings: true;
    noReportMutation: true;
    noChecklistExecutiveScoringImports: true;
    noCustomerFacingCopy: true;
    noGapObserved: true;
    noLegalConclusionLanguage: true;
    noRawBlockedFields: true;
  };
};
```

## Avoiding Production Side Effects

The comparison stage should avoid production side effects through:

- read-only mock/simulation policy evaluation only in the first implementation
- no database writes
- no persisted normalized concerns
- no unified finding creation
- no report object mutation
- no checklist imports
- no executive imports
- no top-finding imports
- no scoring imports
- no regulatory-lens imports
- import-boundary tests
- local/internal environment gate
- feature flag default off
- artifact-only dry-run input and output

If a later phase compares against real WC01 policy functions, that must be separately approved and implemented as a read-only wrapper with explicit no-write tests.

## Comparison Strategies

| Strategy | Description | Pros | Cons | Risk level |
| --- | --- | --- | --- | --- |
| A. Pure mock policy evaluator inside report-adapter | Encode expected policy behavior from approved v2 design and compare candidates to that model. | Safest; no production imports; easy import-boundary tests; no DB or report risk; good for aggregate calibration. | May diverge from real WC01 policy semantics; needs careful naming so nobody mistakes it for production policy. | Low |
| B. Read-only wrapper around selected WC01 policy functions | Import a narrow set of WC01 policy functions in read-only mode and compare candidates without persistence. | Closer to production policy behavior; may reveal semantic mismatches earlier. | Higher coupling to `apps/web`; harder to prove no side effects; import-boundary risk; could blur the dry-run boundary. | Medium to high |
| C. Snapshot comparison against expected WC01 concern shapes | Convert candidates into expected concern-shaped snapshots and compare to approved fixtures. | Stable, deterministic, good for contract review; no production imports. | Less dynamic than policy evaluation; may miss policy edge cases; requires fixture maintenance. | Low to medium |

Recommended first implementation: Strategy A, a pure mock policy evaluator inside `@certscore/report-adapter`.

This keeps the next stage safely internal and avoids importing production WC01 policy code before policy/engineering owners approve that boundary.

## Family-Specific Expected Policy Behavior

### `pre_consent_tracking`

Expected behavior:

- complete evidence likely passes the mock comparison as `would_accept_for_internal_review`
- sensitive context requires extra review
- missing refs, excerpts, confidence, directness, consent-state context, or allowed purpose requires more evidence
- diagnostic-only purposes suppress or block the comparison candidate
- no customer-facing status is produced
- no `gap_observed` output

### `pre_consent_cookie_storage`

Expected behavior:

- complete third-party pre-consent cookie/storage evidence likely passes the mock comparison as `would_accept_for_internal_review`
- sensitive context requires extra review
- first-party-only storage remains suppressed
- CMP/security/necessary storage remains suppressed
- missing party context, consent-state context, refs, or excerpts requires more evidence
- no customer-facing status is produced
- no `gap_observed` output

### `session_replay_behavioral_analytics`

Expected behavior:

- collection endpoint or equivalent strong runtime evidence likely passes the mock comparison as `would_accept_for_internal_review`
- sensitive context requires extra review
- library-only evidence requires more evidence or suppression
- RUM/live-chat/support-only evidence remains suppressed
- no customer-facing status is produced
- no `gap_observed` output

## Guardrails

Required guardrails:

- no production eligibility
- no top-finding eligibility
- no gap eligibility
- no `gap_observed`
- no legal-conclusion language
- no raw blocked fields
- no report imports
- no checklist imports
- no executive imports
- no top-finding imports
- no scoring imports
- no regulatory-lens imports
- fail closed on malformed candidate
- fail closed on unsupported adapter version
- fail closed on sensitive context missing extra-review metadata
- fail closed on missing refs or display-safe excerpts
- fail closed on diagnostic-only or Tier C-only purpose support

## Policy Comparison Test Matrix

| Test case | Expected comparison result | Expected missing/block reason | Production/top/gap eligibility |
| --- | --- | --- | --- |
| Valid `pre_consent_tracking` | `would_accept_for_internal_review` | None | Always false |
| Valid `pre_consent_tracking` sensitive context | `would_accept_for_internal_review` with extra review | None if metadata present | Always false |
| Missing refs/excerpts | `would_require_more_evidence` | `missing_source_refs` or `missing_display_safe_excerpt_refs` | Always false |
| Weak confidence | `would_require_more_evidence` | `missing_or_weak_confidence` | Always false |
| Tag-management-only | `would_be_suppressed` | `tag_management_only_non_supporting` | Always false |
| Tier C mixed | `would_be_suppressed` | `tier_c_supporting_purpose` | Always false |
| Valid `pre_consent_cookie_storage` | `would_accept_for_internal_review` | None | Always false |
| First-party-only storage | `would_be_suppressed` | `first_party_only_storage` | Always false |
| CMP/security/necessary storage | `would_be_suppressed` | `necessary_security_or_cmp_storage_excluded` | Always false |
| Valid session replay collection | `would_accept_for_internal_review` | None | Always false |
| Library-only session replay | `would_require_more_evidence` or `would_be_suppressed` | `library_only_without_collection` | Always false |
| Sensitive-context session replay | `would_accept_for_internal_review` with extra review | None if metadata present | Always false |
| Unsupported version | Artifact rejected | `unsupported_adapter_version` | Always false |
| Malformed artifact | Artifact rejected | `malformed_adapter_artifact` | Always false |
| Forbidden gap/legal/raw injection | Artifact rejected or candidate blocked | `forbidden_language_detected` or `raw_blocked_field_detected` | Always false |

## Recommended First Implementation

Recommended first implementation choice: pure mock policy evaluator inside `@certscore/report-adapter`.

The first implementation should:

- not import production WC01 policy
- not call production concern policy
- not persist concerns
- encode expected policy behavior from the approved v2 adapter design
- compare aggregate results against current simulation outcomes
- produce JSON and Markdown summaries
- keep all outputs internal and non-customer-facing
- return to policy/engineering review before any read-only production-policy wrapper

The first comparison output should be interpreted as policy-shape calibration only. It should not be treated as production policy output.

## Rollback And Kill Switch

The future comparison command should include:

- internal-only command name
- feature flag default off
- artifact-only mode
- no persistence
- no runtime dependency for production reports
- contract version allowlist
- environment gate for local/internal use
- ability to disable without changing existing WC01 behavior

Possible flag:

```text
CERTSCORE_V2_CONCERN_POLICY_COMPARISON_ENABLED=0
```

Production report behavior must be identical whether this flag is enabled or disabled until a separate production integration is approved.

## Open Questions

- When, if ever, should comparison use real WC01 concern policy code?
- Should analytics and advertising split before comparison?
- Does sensitive context require policy-surface coverage before any later production proposal?
- Should any of the three families remain internal-only indefinitely?
- Should customer-facing copy remain prohibited for all v2-derived candidates?
- Should the comparison produce only reason keys, or also internal reviewer prose?
- Should policy owners approve a manual reviewer workflow before any report output?
- Should policy/runtime corroboration remain out of scope for the first comparison?

## Recommended Next Implementation Prompt

Not yet approved.

If policy/product/privacy and engineering owners approve the next dry-run stage, use this prompt:

> Implement a dry-run-only WC01 v2 concern-policy comparison stage using a pure mock policy evaluator inside `@certscore/report-adapter`. It should read `V2NormalizedConcernCandidateDraft` artifacts, validate supported adapter version and guardrails, compare each candidate against the expected policy behavior in `docs/certscore-v2/wc01-v2-concern-policy-comparison-design.md`, and emit `Wc01V2ConcernPolicyComparisonDryRun` JSON and Markdown summaries. Do not import or call production WC01 concern policy, do not persist normalized concerns, do not create unified findings, do not wire into checklist/report/executive/top-finding/scoring/regulatory-lens output, do not create customer-facing copy, and do not map anything to `gap_observed`. Add fixtures and tests covering the policy comparison matrix, import boundaries, malformed artifacts, forbidden language, and raw-field guardrails.

## Explicit Non-Goals

- No code implementation in this design pass.
- No production integration.
- No production concern-policy calls.
- No persisted normalized concerns.
- No unified findings.
- No checklist output.
- No report output.
- No executive output.
- No top-finding output.
- No scoring output.
- No regulatory-lens output.
- No customer-facing copy.
- No customer-facing behavior changes.
- No `gap_observed` mapping.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
