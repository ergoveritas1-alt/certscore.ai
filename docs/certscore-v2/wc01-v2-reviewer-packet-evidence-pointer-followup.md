# WC01 v2 Reviewer Packet Evidence Pointer Follow-Up

## Executive Summary

The WC01 v2 comparison and manual reviewer packet contracts now carry safe evidence pointers forward for internal evidence review.

The refined path remains artifact-only and non-persistent:

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
-> Wc01V2ConcernPolicyComparisonDryRun
-> Wc01V2ManualReviewerPacket
```

No production concern policy is called. No normalized concerns are persisted. No unified findings, report rows, checklist rows, executive rows, top findings, scoring output, regulatory-lens output, customer-facing copy, or `gap_observed` mappings are created.

## What Changed

`Wc01V2ConcernPolicyComparisonDryRun` results now include a `reviewerEvidence` section with bounded, display-safe pointers and internal diagnostic metadata:

- source ref IDs
- display-safe excerpt IDs
- display-safe excerpt counts
- vendor names as internal diagnostic labels
- supporting purposes
- diagnostic purposes
- confidence
- directness
- sensitive-context category labels
- family-specific evidence context
- caveats
- missing requirements
- coverage limitations
- missing corroborators
- demotion reasons

`Wc01V2ManualReviewerPacket` queue items now display the same safe evidence pointers:

- evidence refs and excerpt refs/counts
- vendor names and purposes
- confidence/directness
- sensitive-context categories
- pre-consent / consent-state context
- cookie/storage party and storage type context
- session replay collection/equivalent runtime context
- caveats and coverage limitations

The packet still does not include raw cookies, raw cookie values, raw request/response bodies, sensitive query values, unbounded DOM text, unbounded policy text, raw Nano reasoning, production report statuses, customer-facing copy, or legal-conclusion language.

## Cohort Results

| Cohort | Input files | Succeeded | Failed | Queue items | Guardrail failures | Malformed artifacts |
|---|---:|---:|---:|---:|---:|---:|
| Expanded fresh-registry | 10 | 10 | 0 | 11 | 0 | 0 |
| Stress fresh-registry | 12 | 12 | 0 | 11 | 0 | 0 |
| Edge consent | 30 | 30 | 0 | 34 | 0 | 0 |
| Policy-stress consent | 20 | 20 | 0 | 25 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 0 | 0 |

## Queue Lanes

| Queue lane | Count |
|---|---:|
| `standard_internal_review_candidate` | 45 |
| `sensitive_context_review_required` | 36 |
| `evidence_quality_review` | 0 |
| `copy_policy_review_required` | 0 |
| `blocked_suppressed_diagnostic_only` | 0 |

## Candidate Families

| Candidate family | Count |
|---|---:|
| `pre_consent_tracking` | 39 |
| `pre_consent_cookie_storage` | 31 |
| `session_replay_behavioral_analytics` | 11 |

## Evidence Pointer Availability

| Pointer / metadata | Available queue items | Total queue items |
|---|---:|---:|
| Source ref IDs | 81 | 81 |
| Display-safe excerpt IDs or counts | 81 | 81 |
| Vendor metadata | 81 | 81 |
| Confidence/directness | 81 | 81 |
| Family evidence context | 81 | 81 |
| Sensitive-context category labels | 36 | 36 sensitive-context items |

By cohort:

| Cohort | Source refs | Excerpt refs/counts | Vendor metadata | Quality metadata | Family context | Sensitive category labels |
|---|---:|---:|---:|---:|---:|---:|
| Expanded fresh-registry | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 0/0 |
| Stress fresh-registry | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 2/2 |
| Edge consent | 34/34 | 34/34 | 34/34 | 34/34 | 34/34 | 11/11 |
| Policy-stress consent | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 23/23 |

## Vendor And Purpose Handling

Vendor names and purposes are carried forward as internal diagnostic labels only.

Supporting purposes remain limited to the approved tracker-supporting purpose set from the normalized candidate adapter. Diagnostic purposes, including `tag_management`, remain non-supporting. Tier C purposes are not promoted into supporting purposes; when present in malformed or suppressed test cases, they remain diagnostic/non-supporting and do not create production eligibility.

`consent_management` remains non-supporting. No consent-management-only, tag-management-only, Tier C-only, unresolved endpoint, inventory-only, or policy/runtime alignment rows are promoted into reviewer packet candidates.

## Family-Specific Context

The reviewer packet now carries the context needed to understand why each candidate entered review:

- `pre_consent_tracking`: consent-state/pre-consent context and source ref IDs
- `pre_consent_cookie_storage`: third-party cookie/storage context, storage type, exclusion flag, and source ref IDs
- `session_replay_behavioral_analytics`: collection endpoint, event payload endpoint, or equivalent strong runtime signal context and source ref IDs

This closes the main gap identified in the manual reviewer trial: reviewers no longer have to infer family context from lane names alone.

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

Verification commands passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-concern-policy-compare --help
pnpm v2:wc01-reviewer-packet --help
```

The regenerated comparison and reviewer packet artifacts were also scanned for forbidden gap status tokens, raw blocked field names, and legal-conclusion language; no matches were found.

## Evidence Adjudication Readiness

The refined packets are now sufficient for a stronger internal evidence-adjudication workflow than the first reviewer-packet trial:

- reviewers can see which source refs and display-safe excerpt refs support the candidate
- reviewers can see vendor labels and purpose basis
- reviewers can see confidence/directness
- reviewers can see sensitive-context categories
- reviewers can see family-specific context

Remaining limitation: the packets carry safe pointers and counts, not the full bounded excerpt text. A reviewer can adjudicate shape, traceability, and context from the packet, but full evidence review still requires opening the referenced upstream artifact or a future contract refinement that carries bounded display-safe excerpt text forward.

Recommended next step: run a second internal manual reviewer trial using the refined packets. If reviewers need to complete adjudication without opening upstream artifacts, add bounded display-safe excerpt text to the artifact-only packet contract in a separate refinement.

## Explicit Non-Goals Preserved

- No production concern policy call.
- No persisted normalized concerns.
- No unified findings.
- No checklist, report, executive, top-finding, scoring, or regulatory-lens output.
- No customer-facing copy.
- No production report integration.
- No `gap_observed` mapping.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
