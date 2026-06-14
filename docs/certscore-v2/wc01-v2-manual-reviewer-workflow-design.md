# WC01 v2 Manual Reviewer Workflow Design

Design document only. Do not implement from this document without a separate approved implementation pass.

## Executive Summary

A manual reviewer workflow is the right next step because the v2 pipeline has become narrow enough for internal policy-shape calibration, but production integration is still not approved. The latest comparison pass produced 81 comparison results, with 45 accepted for internal review and 36 remaining internal-only because of sensitive-context review handling. No weak or missing-evidence rows reached comparison in the generated cohorts.

The workflow solves a policy and product review problem: reviewers need a controlled way to inspect v2 candidate evidence, sensitive-context flags, and mock policy comparison outcomes before deciding whether any future stage should involve persistence, production concern policy, or customer-facing surfaces.

The workflow explicitly does not:

- persist normalized concerns
- create unified findings
- create checklist, report, executive, top-finding, scoring, or regulatory-lens output
- create customer-facing copy
- call production concern policy
- map anything to `gap_observed`

## Workflow Boundary

Input:

```text
Wc01V2ConcernPolicyComparisonDryRun
```

Possible future output, if separately approved:

```text
internal reviewer decision records
or draft reviewer notes
```

No production artifacts should be emitted.

The first version should be artifact-only or ephemeral. It should read comparison artifacts and generate reviewer packets without writing to a database. Persistence of reviewer decisions should require a separate approval.

## Reviewer Queue Concepts

Possible queue lanes:

| Queue lane | Purpose |
| --- | --- |
| Standard internal review candidate | Complete candidate shape with no sensitive-context escalation. |
| Sensitive-context review required | Complete candidate shape, but sensitive context requires stricter review before any later decision. |
| Evidence quality review | Candidate needs reviewer inspection of source refs, excerpts, confidence, directness, or missing requirements. |
| Copy/policy review required | Candidate shape is complete, but wording, policy posture, or family-specific treatment needs policy owner review. |
| Blocked/suppressed diagnostic only | Candidate is blocked, suppressed, malformed, or diagnostic-only; useful for calibration but not reviewer promotion. |

Queue lane assignment should be internal metadata only. It should not imply production eligibility.

## Reviewer Actions

Possible reviewer actions:

- confirm evidence shape
- request more evidence
- mark internal-only
- mark policy-copy review needed
- mark sensitive-context escalation
- reject as overbroad
- add reviewer note

No reviewer action should create production findings, persisted normalized concerns, unified findings, checklist rows, report rows, executive rows, scoring changes, regulatory-lens rows, or customer-facing output.

## Data Shown To Reviewer

Display only:

- source URL or domain
- candidate family
- simulated outcome
- sensitive-context flags
- source ref IDs
- display-safe excerpt IDs and counts
- supporting purposes
- diagnostic purposes
- confidence and directness
- caveats and missing requirements
- coverage limitations
- guardrail status

Do not display:

- raw cookies
- raw request bodies
- sensitive query values
- unbounded DOM text
- unbounded policy text
- legal-conclusion language
- production report statuses

The reviewer surface should use source IDs and display-safe excerpt IDs to preserve traceability without expanding raw artifacts.

## Sensitive-Context Handling

Sensitive context requires a stricter workflow for:

- health
- reproductive health
- children/education
- public benefits
- employment/HR
- finance
- behavioral analytics reference sites

Sensitive context should require extra review and should not be eligible for automated customer-facing projection. A sensitive-context candidate can be complete enough for internal review while still remaining internal-only.

Recommended sensitive-context behavior:

- route to the sensitive-context review lane
- require an explicit reviewer action before any later stage can consider it
- require policy/copy review before any future product-surface proposal
- preserve coverage limitations and missing requirements
- avoid any customer-facing wording in the first workflow

## Review Decision Schema

Proposed internal-only review decision type:

```ts
type Wc01V2ManualReviewDecision = {
  reviewId: string;
  candidateId: string;
  reviewer: string;
  timestamp: string;
  decision:
    | "evidence_shape_confirmed"
    | "needs_more_evidence"
    | "internal_only"
    | "policy_copy_review_required"
    | "sensitive_context_escalated"
    | "rejected_overbroad";
  notes?: string;
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
};
```

This type is a design proposal only. If implemented later, the first version should write artifact-only notes or no persisted decisions unless persistence is separately approved.

## Storage Options

| Option | Description | Pros | Cons | Risk |
| --- | --- | --- | --- | --- |
| A. Artifact-only Markdown/JSON notes | Generate reviewer packets and optional local notes beside dry-run artifacts. | Safest; no DB writes; easy to audit; no production coupling. | Manual workflow; not ideal for multi-reviewer coordination. | Low |
| B. Local/internal Supabase table | Store internal review decisions in a dedicated internal table. | Queryable and structured; easier multi-reviewer coordination. | Requires schema, access controls, migrations, and clear non-production boundary. | Medium |
| C. Issue tracker export | Export review items to Linear/GitHub issues. | Familiar workflow; assignment and comments available. | Risk of leaking internal evidence context; requires connector policy and redaction discipline. | Medium |
| D. No storage, only reviewer packet | Generate a packet for review meetings without retaining decisions. | Lowest implementation risk; no persistence. | Decisions can be lost unless documented elsewhere. | Low |

Recommended safest first version: **A. Artifact-only Markdown/JSON notes**, with the option to run as **D. no storage** for the first review packet.

## UI Options

| Option | Description | Pros | Cons | Risk |
| --- | --- | --- | --- | --- |
| A. Extend existing internal shadow preview to show comparison artifacts | Add comparison artifact inspection to the existing flag-gated preview surface. | Reuses internal preview concepts; familiar route. | Touches app UI; must avoid `shared-scan-detail-view.tsx`; needs strict import boundaries. | Medium |
| B. Build separate admin-only review page | Dedicated internal UI for comparison queues and reviewer actions. | Clear separation from production report UI. | More app surface area; auth/access-control work; still not ready for persistence. | Medium |
| C. CLI-generated review packet only | Generate Markdown/JSON review packets from comparison artifacts. | Safest first step; no app UI; artifact-only; easy to diff and review. | Less interactive; manual note-taking. | Low |
| D. Export to Linear/GitHub issues | Convert candidates into internal review tickets. | Assignment and workflow tooling. | Connector/export leakage risk; harder evidence redaction controls. | Medium |

Recommended safest first version: **C. CLI-generated review packet only**.

This avoids app UI changes while policy owners validate queue lanes, reviewer actions, and sensitive-context workflow.

## Guardrails

Required guardrails:

- internal flag
- admin-only access for any future UI
- artifact path allowlist
- no production report imports
- no checklist imports
- no executive imports
- no top-finding imports
- no scoring imports
- no regulatory-lens imports
- no persisted production concerns
- no customer-facing copy
- no `gap_observed`
- no legal conclusions
- fail closed on unsupported contract
- fail closed on guardrail breach
- fail closed on raw blocked fields or unbounded evidence fields

If a future UI is implemented, it must not import or modify production report display components. In particular, it must not modify `apps/web/components/scans/shared-scan-detail-view.tsx`.

## Test Plan

Future tests should cover:

- parser accepts valid comparison artifacts
- parser fails closed on production eligibility
- parser fails closed on top-finding eligibility
- parser fails closed on gap eligibility
- parser fails closed on `gap_observed`, legal-conclusion terms, and raw blocked fields
- sensitive-context queueing routes candidates to sensitive-context review
- standard candidates route to standard internal review
- missing-evidence candidates route to evidence quality review
- suppressed candidates route to blocked/suppressed diagnostic only
- reviewer actions cannot produce production artifacts
- reviewer actions keep production/top/gap eligibility false
- import-boundary tests prevent production policy, report, checklist, executive, top-finding, scoring, regulatory-lens, and shared scan detail imports

## Rollout Plan

Design-only phases:

1. Artifact-only reviewer packet.
2. Internal admin preview extension, only if packet review proves the workflow shape.
3. Optional ephemeral reviewer notes.
4. Optional internal persistence only after separate approval.
5. No production integration until a separate production proposal is approved.

Phase 1 should be the next implementation candidate because it keeps the workflow artifact-only and avoids production app changes.

## Open Questions

- Should review decisions be persisted?
- Who is allowed to review sensitive-context candidates?
- Should any decision ever feed production?
- Should reviewer notes be exportable?
- Should copy review be separate from evidence review?
- Should sensitive-context review require two reviewers?
- Should policy-surface coverage be mandatory for sensitive contexts?
- Should reviewer packets group by site, family, sensitive category, or simulated outcome?
- Should Linear/GitHub export be allowed later, or should review stay inside CertScore-controlled artifacts?

## Recommended Next Implementation Prompt

Not yet approved.

If policy/product/privacy and engineering owners approve the next internal-only stage, use this prompt:

> Implement an artifact-only WC01 v2 manual reviewer packet generator inside `@certscore/report-adapter`. It should read `Wc01V2ConcernPolicyComparisonDryRun` artifacts, validate guardrails, assign internal queue lanes, and emit Markdown/JSON reviewer packets for internal review. Do not persist normalized concerns, do not create unified findings, do not call production concern policy, do not wire into checklist/report/executive/top-finding/scoring/regulatory-lens output, do not create customer-facing copy, and do not map anything to `gap_observed`. Add tests for parser fail-closed behavior, sensitive-context queueing, reviewer action schema validation, raw/forbidden language guardrails, and import boundaries. Do not modify `apps/web/components/scans/shared-scan-detail-view.tsx`.

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
