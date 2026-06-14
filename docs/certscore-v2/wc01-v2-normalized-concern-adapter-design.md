# WC01 v2 Normalized Concern Adapter Design

Design document only. Do not implement production integration from this document without a separate approved implementation pass.

## Executive Summary

This document designs a future typed adapter that would convert approved WC01 v2 simulation outputs into internal normalized-concern candidate drafts. The adapter would sit between the dry-run simulation stage and WC01 concern policy.

The adapter would do:

- read `Wc01V2ConcernPolicySimulationDryRun` artifacts
- validate the simulation contract and guardrails
- map approved v2 simulation families into typed internal candidate drafts
- preserve source refs, display-safe excerpt refs, confidence, directness, consent-state context, vendor-purpose basis, sensitive-context metadata, and coverage limitations
- fail closed when evidence, contract, or policy gates are incomplete

The adapter would not do:

- call production concern policy
- persist normalized concerns
- create unified findings
- create checklist, report, executive, top-finding, scoring, or regulatory-lens output
- create customer-facing copy
- make legal conclusions
- map anything directly to `gap_observed`

The adapter must sit before WC01 concern policy because WC01 production surfacing is intentionally ordered:

```text
observed evidence
-> normalized concern
-> concern policy
-> unified finding / checklist projection
-> executive / regulatory display
```

Direct v2-to-report mapping is disallowed because it would bypass normalized concern construction and policy gates. V2 status values mean evidence was observed in the v2 diagnostic model; they are not WC01 report statuses, checklist statuses, executive findings, or legal determinations.

## Proposed Adapter Boundary

Input:

```text
Wc01V2ConcernPolicySimulationDryRun
```

Output:

```text
V2NormalizedConcernCandidateDraft
```

The output type name is provisional. The first implementation, if later approved, should remain draft/internal only:

- not persisted
- not a production normalized concern
- not a unified finding
- not customer-facing
- not eligible for report, checklist, executive, scoring, regulatory-lens, or top-finding output

The adapter should be treated as an evidence-shape and policy-gate bridge. It should not own final production eligibility.

## Candidate Type Shape

Proposed internal type:

```ts
type V2NormalizedConcernCandidateDraft = {
  adapterVersion: "wc01.v2_normalized_concern_candidate_draft.1";

  source: {
    scanId?: string;
    reviewId?: string;
    sourceUrl?: string;
    simulationArtifactId?: string;
    simulationOutcomeId: string;
    concernInputId: string;
    sourceRowId?: string;
    sourceFindingKey: string;
    sourceFamily:
      | "pre_consent_tracking"
      | "pre_consent_cookie_storage"
      | "session_replay_behavioral_analytics";
  };

  proposed: {
    normalizedConcernKey:
      | "v2.pre_consent_tracking.candidate"
      | "v2.pre_consent_cookie_storage.candidate"
      | "v2.session_replay_behavioral_analytics.candidate";
    concernFamily:
      | "pre_consent_tracking"
      | "pre_consent_cookie_storage"
      | "session_replay_behavioral_analytics";
    regulatoryLensCandidates: Array<{
      lens: string;
      reasonKey: string;
      reviewOnly: true;
    }>;
  };

  evidence: {
    evidenceFamily:
      | "runtime_pre_consent_collection"
      | "runtime_pre_consent_cookie_or_storage"
      | "runtime_session_replay_collection";
    sourceRefIds: string[];
    displaySafeExcerptIds: string[];
    displaySafeEvidenceCount: number;
    confidence: "high" | "medium";
    directness: "direct" | "strong_runtime_equivalent";
    consentStateContext?: {
      phase: "pre_consent" | "before_choice";
      actionObserved?: "none" | "banner_observed" | "choice_not_made";
      sourceRefIds: string[];
    };
    cookieStorageContext?: {
      party: "third_party";
      storageType: "cookie" | "local_storage" | "session_storage" | "other_storage";
      necessaryOrSecurityExcluded: true;
      sourceRefIds: string[];
    };
    sessionReplayContext?: {
      collectionEvidence:
        | "collection_endpoint"
        | "event_payload_endpoint"
        | "equivalent_strong_runtime_signal";
      libraryOnly: false;
      sourceRefIds: string[];
    };
    vendorPurposeBasis: Array<{
      purpose:
        | "advertising"
        | "analytics"
        | "session_replay"
        | "marketing_automation"
        | "advertising_measurement"
        | "identity_resolution"
        | "social_pixel"
        | "retargeting";
      vendorNames: string[];
      sourceRefIds: string[];
    }>;
    diagnosticPurposes: string[];
  };

  sensitiveContext?: {
    present: boolean;
    categories: Array<
      | "health"
      | "reproductive_health"
      | "finance"
      | "insurance"
      | "public_benefits"
      | "children_or_education"
      | "employment_or_hr"
      | "privacy_mature_saas"
      | "behavioral_analytics_reference"
    >;
    requiresExtraReview: true;
    requiredReviewReasons: string[];
  };

  limitations: {
    coverageLimitations: string[];
    policyCaveats: string[];
    missingCorroborators: string[];
    demotionReasons: string[];
  };

  guardrails: {
    productionEligible: false;
    topFindingEligible: false;
    gapEligible: false;
    reviewOnly: true;
    customerFacingCopyApproved: false;
    persistedConcernApproved: false;
  };
};
```

The type should avoid raw runtime payloads. It should reference source refs and display-safe excerpts by ID, preserving traceability without expanding raw artifacts.

## Family-Specific Mappings

### `pre_consent_tracking`

Source simulation family: `pre_consent_tracking`

Proposed normalized concern key: `v2.pre_consent_tracking.candidate`

Required gates:

- supported simulation contract version
- source simulation status is `policy_review_candidate` or `policy_review_candidate_sensitive_context`
- at least one source ref
- at least one display-safe excerpt ref
- high confidence or policy-approved medium confidence
- direct runtime evidence or strong runtime equivalent
- pre-consent or before-choice consent-state context
- at least one tracker-supporting purpose
- no Tier C-only purpose basis
- no tag-management-only or consent-management-only support
- no raw blocked fields or forbidden phrase matches

Blocked cases:

- missing consent-state context
- missing source refs or display-safe excerpt refs
- inventory-only vendor observation
- unresolved endpoint-only evidence
- policy/runtime alignment-only evidence
- consent-flow delta-only evidence
- tag-management-only support
- consent-management-only support
- Tier C-only or mixed Tier C support without evidence-subset gates
- partial or failed required runtime modules

Evidence contract:

- source ref IDs for runtime observation and consent-state attribution
- display-safe excerpt IDs showing bounded pre-consent evidence
- vendor-purpose basis limited to approved tracker-supporting purposes
- confidence and directness retained from the refined draft input

Copy posture:

- internal review-only language
- evidence-scoped wording such as "pre-consent runtime tracking signal observed"
- no customer-facing copy approved
- no legal determination language

Possible regulatory lens candidates:

- privacy runtime review
- consent timing review
- tracker-purpose review

Open policy questions:

- Should advertising and analytics split into separate normalized concern keys?
- Should policy-surface corroboration be required before any customer-facing use?
- What medium-confidence fallback, if any, is acceptable?

### `pre_consent_cookie_storage`

Source simulation family: `pre_consent_cookie_storage`

Proposed normalized concern key: `v2.pre_consent_cookie_storage.candidate`

Required gates:

- supported simulation contract version
- source simulation status is `policy_review_candidate` or `policy_review_candidate_sensitive_context`
- at least one source ref
- at least one display-safe excerpt ref
- high confidence direct cookie or storage evidence
- pre-consent or before-choice consent-state context
- third-party party context
- cookie/storage context excludes CMP, security, necessary, and functional-only storage
- at least one tracker-supporting purpose when vendor purpose is used
- no raw blocked fields or forbidden phrase matches

Blocked cases:

- first-party-only cookie or storage
- CMP, security, necessary, or functional-only cookie/storage
- missing cookie/storage party context
- missing consent-state context
- missing source refs or display-safe excerpt refs
- inferred vendor purpose without direct cookie/storage evidence
- Tier C-only or diagnostic-only support

Evidence contract:

- source ref IDs for cookie/storage observation and consent state
- display-safe excerpt IDs with cookie/storage name or key, host/domain context, consent phase, and redacted value context
- explicit party classification
- explicit necessary/security exclusion flag

Copy posture:

- internal review-only language
- evidence-scoped wording such as "third-party pre-consent storage signal observed"
- no claim about personal data, legal requirement, or intent
- no customer-facing copy approved

Possible regulatory lens candidates:

- cookie/storage review
- consent timing review
- third-party storage review

Open policy questions:

- Should this family require policy-surface corroboration?
- What proof is required for third-party context when cookie domain and request host differ?
- Should storage-only cases be separate from cookie cases?

### `session_replay_behavioral_analytics`

Source simulation family: `session_replay_behavioral_analytics`

Proposed normalized concern key: `v2.session_replay_behavioral_analytics.candidate`

Required gates:

- supported simulation contract version
- source simulation status is `policy_review_candidate` or `policy_review_candidate_sensitive_context`
- at least one source ref
- at least one display-safe excerpt ref
- high confidence direct evidence or policy-approved strong runtime equivalent
- collection endpoint or equivalent strong runtime collection signal
- library-only evidence is explicitly false
- allowed vendor purpose includes session replay or behavioral analytics with collection support
- no RUM-only, live-chat-only, support-only, or performance-only basis
- no raw blocked fields or forbidden phrase matches

Blocked cases:

- library-only evidence
- RUM-only evidence
- live-chat-only evidence
- customer-support-only evidence
- performance-monitoring-only evidence
- missing collection endpoint or equivalent strong runtime signal
- missing source refs or display-safe excerpt refs
- claim of sensitive-field capture without direct evidence

Evidence contract:

- source ref IDs for collection endpoint or equivalent runtime event
- display-safe excerpt IDs showing bounded host/path, behavior category, consent state if available, and redacted request context
- vendor-purpose basis that distinguishes session replay or behavioral analytics from RUM/live-chat/support

Copy posture:

- internal review-only language
- evidence-scoped wording such as "session replay or behavioral analytics collection signal observed"
- no statement that a recording occurred unless direct recording evidence exists and policy approves that wording
- no customer-facing copy approved

Possible regulatory lens candidates:

- behavioral analytics review
- session replay review
- sensitive-context review

Open policy questions:

- Should session replay and behavioral analytics remain one family?
- Should this family remain internal-only indefinitely?
- What evidence is required before sensitive-field capture can be evaluated?

## Required Production Gates

Any future adapter implementation should require:

| Gate | Requirement |
| --- | --- |
| Supported contract version | Only allowlisted simulation versions accepted. Unsupported versions fail closed. |
| Family allowlist | Only the three approved families can produce candidate drafts. |
| Source refs | At least one retained source ref for every candidate. |
| Display-safe evidence | At least one bounded display-safe excerpt ref for every candidate. |
| Confidence/directness | High confidence direct evidence by default; medium or equivalent only if policy-approved. |
| Vendor purpose allowlist | Advertising, analytics, session replay, marketing automation, advertising measurement, identity resolution, social pixel, retargeting only when evidence supports the family. |
| Diagnostic purpose exclusions | Security, performance, support, infrastructure, fraud/bot, RUM, live-chat, consent management, and tag management remain non-supporting by default. |
| Pre-consent context | Required for pre-consent tracking and cookie/storage families. |
| Cookie/storage party context | Third-party context required; first-party-only and necessary/security/CMP storage blocked. |
| Session replay collection evidence | Collection endpoint or equivalent strong runtime signal required; library-only blocked. |
| Sensitive-context extra review | Sensitive context requires extra review metadata and cannot promote eligibility. |
| Sanitizer guardrails | Raw blocked fields, unredacted sensitive query values, raw cookie values, and opaque display values remain blocked. |
| Legal-language guardrails | Forbidden legal-style phrases fail closed. |
| Coverage limitation behavior | Missing, failed, partial, skipped, or not-testable required modules fail closed. |

## Fail-Closed Behavior

| Condition | Adapter behavior |
| --- | --- |
| Unsupported version | Reject artifact and emit blocked reason `unsupported_contract_version`. |
| Malformed input | Reject artifact and emit blocked reason `malformed_simulation_artifact`. |
| Missing source refs | Block candidate with `missing_source_refs`. |
| Missing display-safe excerpts | Block candidate with `missing_display_safe_excerpt_refs`. |
| Partial or failed source modules | Block candidate with `required_source_module_incomplete`. |
| Missing consent-state context | Block pre-consent families with `missing_consent_state_context`. |
| Tier C purposes | Block with `diagnostic_purpose_only_or_mixed_without_subset_gate`. |
| Tag-management-only support | Block with `tag_management_only_non_supporting`. |
| Consent-management-only support | Block with `consent_management_only_non_supporting`. |
| Sensitive context without extra review metadata | Block with `missing_sensitive_context_review_metadata`. |
| Raw blocked fields | Reject artifact or block candidate with `raw_blocked_field_detected`. |
| Forbidden phrase matches | Reject artifact or block candidate with `forbidden_language_detected`. |

Failed candidates should never call concern policy later. Rejected artifacts should remain inspectable in aggregate dry-run summaries, but should not produce candidate drafts.

## Policy Test Matrix

| Test case | Expected adapter result | Expected block reason | Concern policy called later? | Adapter production/top/gap eligibility ever true? |
| --- | --- | --- | --- | --- |
| Valid `pre_consent_tracking` candidate | Candidate draft emitted | None | Only in future approved dry-run comparison | No |
| Analytics-only `pre_consent_tracking` candidate | Candidate draft emitted if analytics remains allowed | None, or `vendor_purpose_not_allowed` if policy later splits analytics | Only in future approved dry-run comparison | No |
| Advertising-only `pre_consent_tracking` candidate | Candidate draft emitted | None | Only in future approved dry-run comparison | No |
| Mixed analytics/advertising candidate | Candidate draft emitted | None | Only in future approved dry-run comparison | No |
| Missing consent-state context | Blocked | `missing_consent_state_context` | No | No |
| Missing refs/excerpts | Blocked | `missing_source_refs` or `missing_display_safe_excerpt_refs` | No | No |
| Tag-management-only | Blocked | `tag_management_only_non_supporting` | No | No |
| Consent-management-only | Blocked | `consent_management_only_non_supporting` | No | No |
| Tier C mixed candidate | Blocked until evidence-subset gate exists | `diagnostic_purpose_only_or_mixed_without_subset_gate` | No | No |
| Sensitive health candidate | Candidate draft emitted with extra review metadata | None if metadata present; otherwise `missing_sensitive_context_review_metadata` | Only in future approved dry-run comparison | No |
| Sensitive children/education candidate | Candidate draft emitted with extra review metadata | None if metadata present; otherwise `missing_sensitive_context_review_metadata` | Only in future approved dry-run comparison | No |
| Valid third-party cookie/storage candidate | Candidate draft emitted | None | Only in future approved dry-run comparison | No |
| First-party-only cookie/storage | Blocked | `first_party_only_storage` | No | No |
| CMP/security/necessary cookie | Blocked | `necessary_security_or_cmp_storage_excluded` | No | No |
| Session replay collection endpoint | Candidate draft emitted | None | Only in future approved dry-run comparison | No |
| Session replay library-only | Blocked | `library_only_without_collection` | No | No |
| RUM/live-chat-only | Blocked | `rum_or_live_chat_only_non_supporting` | No | No |
| Coverage limitation / partial module | Blocked | `required_source_module_incomplete` | No | No |
| Unsupported contract version | Artifact rejected | `unsupported_contract_version` | No | No |
| Malformed artifact | Artifact rejected | `malformed_simulation_artifact` | No | No |
| Forbidden phrase/raw field injection | Artifact rejected or candidate blocked | `forbidden_language_detected` or `raw_blocked_field_detected` | No | No |

## Proposed Dry-Run Implementation Phases

Design phases only:

1. Adapter draft type and tests
2. Fixture generation from expanded, stress, edge, and policy-stress cohorts
3. Dry-run CLI that reads simulation artifacts and emits candidate draft artifacts
4. Aggregate comparison across cohorts
5. Policy review of emitted candidates and blocked rows
6. Only then a scoped production proposal, if policy/product/privacy and engineering owners approve

The first implementation should not call production concern policy. A later approved comparison pass may call policy in a non-persisted dry-run mode only after the adapter shape is approved.

## Rollback And Kill Switch Design

The adapter should include multiple independent controls:

- feature flag, default off
- contract version allowlist
- cohort allowlist for dry-run batches
- environment gate limiting execution to internal environments
- artifact-only dry-run mode
- no runtime dependency from existing WC01 report rendering
- no migration or persistence dependency
- ability to disable the adapter without changing existing WC01 reports

Recommended flag shape:

```text
CERTSCORE_V2_NORMALIZED_CONCERN_ADAPTER_ENABLED=0
```

If disabled, adapter commands should refuse to run unless an explicit artifact-only dry-run override is provided for local/internal diagnostics. Production report behavior must be unchanged whether the flag is enabled or disabled until a separate production integration is approved.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Status semantic mismatch | Treat v2 statuses as diagnostic input only; require normalized concern policy before production status. |
| Overclaiming | Use evidence-scoped internal labels and block customer-facing copy until copy review approves it. |
| Sensitive-context overreach | Sensitive context increases review requirements only; it never promotes eligibility. |
| Raw evidence leakage | Preserve sanitizer checks and source-ref/excerpt-only projection. |
| Vendor purpose drift | Use canonical vendor purpose classifications and explicit purpose allowlists. |
| Direct report shortcut | Add import-boundary tests preventing report/checklist/executive/top-finding/scoring/regulatory-lens imports. |
| Top-finding accidental promotion | Hard-code adapter eligibility flags to false and test them. |
| Legal-copy drift | Keep forbidden-language scans in tests and batch summaries. |
| Policy/runtime corroboration ambiguity | Keep policy/runtime alignment out of the first adapter and decide separately whether corroboration is required. |

## Open Questions

- Should analytics and advertising split into separate normalized concern families?
- Should cookie/storage require policy-surface corroboration before any customer-facing use?
- Should session replay remain internal-only even with collection endpoint evidence?
- Are the current sensitive-context categories complete?
- Should any customer-facing copy be allowed later, or should all three families remain internal reviewer signals?
- Do policy owners want a manual reviewer workflow before any report output?
- Should policy-surface coverage be mandatory for sensitive contexts?
- What medium-confidence cases, if any, should be allowed?
- Should regulatory lens candidates remain advisory metadata until after concern policy?

## Recommended Next Implementation Prompt

Not yet approved.

If policy/product/privacy and engineering owners approve implementation of the next dry-run stage, use this prompt:

> Implement a dry-run-only typed WC01 v2 normalized-concern candidate adapter. It should read `Wc01V2ConcernPolicySimulationDryRun` artifacts, validate the supported contract version and guardrails, apply the family-specific gates from `docs/certscore-v2/wc01-v2-normalized-concern-adapter-design.md`, and emit `V2NormalizedConcernCandidateDraft` artifacts plus block summaries. Do not call production concern policy, do not persist normalized concerns, do not create unified findings, do not wire into checklist/report/executive/top-finding/scoring/regulatory-lens output, do not create customer-facing copy, and do not map anything directly to `gap_observed`. Add fixtures from the expanded, stress, edge, and policy-stress cohorts and tests for every row in the policy test matrix.
