# Canonical consent-control flow audit

**Audit version:** 1.0
**Audit date:** 2026-07-27
**Scope:** read-only inspection of WS01 capture and WC01 materialization, persistence, policy, findings, scoring, and display
**Behavior change in this phase:** none

## Executive decision

The current consent-control flow should be replaced.

WS01 must remain the owner of observed, timestamped evidence. WC01 must own one
deterministic `ConsentControlAssessment` constructed after all retained scanner
artifacts have been verified. That assessment must be persisted and become the
only consent-control input to normalized concerns, concern policy, unified
findings, checklist rows, scoring, reports, snapshots, Overview, Admin Scans,
and API Activity.

Downstream consumers must not classify labels, merge observations, inspect raw
runtime aliases, or infer controls. The canonical label classifier remains an
evidence-ingestion dependency; it is not a display, policy, or scoring
dependency.

This division of ownership is required because:

1. WS01 knows what each browser channel observed, when it observed it, and on
   which document.
2. WC01 is the first point that has the checksum-verified evidence bundle,
   auxiliary geometry, scan/no-go state, document identity, persistence
   context, and projection lifecycle together.
3. A final assessment emitted by WS01 would either omit WC01-only inputs or be
   recalculated after arrival, creating two competing authorities.
4. A final assessment calculated independently by each WC01 consumer has
   already produced inconsistent values and score effects.

The replacement is not a new legal or compliance conclusion. It is a
deterministic, evidence-scoped statement of what controls were retained, what
was not observed under complete coverage, and what remains unknown.

## Audit evidence

The audit covered:

- the WS01 pre-interaction DOM/browser probe and its derived
  `firstLayerConsentChoices`;
- WC01 typed contracts for consent observations and consent-surface inspection;
- the retained `CanonicalEvidenceBundle.json` corpus and paired
  `ConsentControlGeometryEvidence.json` artifacts;
- local-v2 materialization and geometry reconciliation;
- normalized concerns, concern policy, coverage policy, unified findings,
  checklist projection, and score calculation;
- `scan_snapshots` projection and its Overview, Admin Scans, and API Activity
  consumers;
- the scan-detail report and Pulse projection;
- owned canaries, known Oxfam regressions, disagreement cases, incomplete
  scans, and no-go/document-mismatch states.

The machine-readable corpus result is recorded in
`canonical-consent-control-flow-audit.json`.

### Corpus summary

| Measure | Count |
|---|---:|
| Canonical evidence bundles | 798 |
| Bundles with a consent observation | 766 |
| Bundles with a likely consent surface | 381 |
| Bundles with a first-layer observation | 254 |
| Readable bundle/geometry pairs | 328 |
| Paired A/R/O disagreements | 32 |
| Later geometry observations that erased an earlier positive | 32 |
| Same-document erasures with a completed earlier inventory | 6 |
| Geometry observations that added a missing A/R/O positive | 0 |
| Completed control inventories | 67 |
| Bundles with incomplete pre-consent runtime | 310 |

The 32 disagreement patterns were:

| Earlier bundle A/R/O | Later geometry A/R/O | Count |
|---|---|---:|
| 1/1/1 | 0/0/0 | 12 |
| 1/1/1 | 0/0/1 | 7 |
| 1/1/0 | 0/0/0 | 4 |
| 1/1/1 | 1/1/0 | 3 |
| 1/0/1 | 0/0/0 | 2 |
| 0/0/1 | 0/0/0 | 2 |
| 1/0/1 | 0/0/1 | 1 |
| 1/0/0 | 0/0/0 | 1 |

No paired case showed geometry adding a control that the earlier bundle had
missed. This does not mean geometry cannot add evidence in the future. It does
show that treating the later geometry artifact as a replacement for the
earlier inventory is not supported by the retained corpus.

The six strongest erasure cases have the same document and a completed earlier
inventory. They include Oxfam scans
`5f6babc7-115c-4ea3-94ec-f10a4fabc5c5`,
`9c43ef92-8627-4ddf-b4cf-60962d20bd87`,
`a44e7619-*`, `aa8d754b-*`, and `16e81333-*`, plus Amazon.de
`4906c6fc-*`. In the Oxfam regression, the earlier observation retained
`Cookie Settings`, `Accept all cookies`, and `Accept only essential cookies`.
The later geometry capture saw a collapsed or changed surface and retained only
`Cookie Settings`. The later state was real, but it did not invalidate the
earlier same-document controls.

The 310 incomplete-runtime bundles demonstrate why `false` cannot double as
“not observed” and “not inspected.” Negative control claims require complete,
applicable coverage; otherwise the state must be `unknown`.

## Current architecture and representations

### Phase 0 retained replay result

The new projector was replayed read-only across all 819 bundles in the local
v2-dag corpus. The generated summary is recorded in
consent-control-assessment-replay-20260727.json; the full row-level report
remains in the ignored artifacts/ directory.

| Replay result | Count |
|---|---:|
| Bundles discovered | 819 |
| Projected successfully | 819 |
| Invalid or failed projections | 0 |
| Legacy rows changed | 581 |
| Legacy false/false/false rows changed to unknown | 510 |
| Positive-retention cases | 22 |
| Complete assessments | 535 |
| Limited assessments | 284 |
| Unknown A/R/O fields | 1,742 |

This is not yet a release-quality accuracy result because the corpus does not
contain the Luna-approved adjudication labels for every row. It is a
materialization-safety result: the projector is deterministic, does not fail
on the corpus, preserves earlier positive evidence, and removes the old
missing-geometry-as-false behavior.

The replay is blocked from score/checklist cutover until the 22
positive-retention cases and the 510 false-to-unknown conversions are reviewed
against adjudicated evidence. The representative positive-retention set
includes Oxfam, Amazon.de, Carrefour, IKEA, and Audi; the full list is in the
row-level replay report.

### Current flow

```text
WS01 page probes
  ├─ scanner-local label regexes
  ├─ consent summary
  ├─ firstLayerConsentChoices
  ├─ consentUiObservations
  └─ consentSurfaceInspection
          │
          ▼
WC01 local-v2 materialization
  ├─ summarizeFirstLayerConsentChoices
  ├─ geometry replacement/merge
  ├─ reconcileConsentSurfaceInspectionWithGeometry
  └─ repeated aliases in runtimeArtifacts
          │
          ├──────────────┬────────────────┬─────────────────┐
          ▼              ▼                ▼                 ▼
coverage policy     unified findings   snapshot projector  Pulse projector
  local regexes       local classifier   alias fallbacks     raw aliases
  local inference     local inference    A/R/O booleans      local subset
          │              │                │
          ▼              ▼                ▼
checklist rows      report/top findings Overview/Admin/API
          │
          ▼
canonical score
```

### Representation inventory

| Stage | Representation | Conversion or interpretation | Current consumers |
|---|---|---|---|
| WS01 page snapshot | `consentSummary` and page-local `firstLayerConsentChoices` | Scanner-local English regexes classify accept/reject/manage and select visible controls | hybrid runtime evidence |
| WS01 typed evidence | `consentUiObservations[]` | Structured controls, classifier metadata, capture status, channels, timestamps | evidence bundle and inspection derivation |
| WS01 surface result | `consentSurfaceInspection` | Derives actionable/non-actionable/no-surface/indeterminate and coverage | WC01 materializer and report logic |
| WC01 auxiliary artifact | `ConsentControlGeometryEvidence` | Separate control/geometry snapshot with its own completion and limitation state | local-v2 materializer |
| WC01 materialized compatibility object | `firstLayerConsentChoices` | Selects one observation, merges or replaces with geometry, then writes several aliases | policy, findings, report, Pulse, projection |
| WC01 coverage policy | private first-layer evidence object | Re-extracts controls and applies local accept/reject/options regexes and fallbacks | GDPR/ePrivacy checklist |
| WC01 normalized concerns | no complete A/R/O assessment | Consent control facts are not consistently represented as canonical concerns | concern policy and findings |
| WC01 unified findings | runtime alias selection plus label classification | Independently infers settings and reject availability | report and top findings |
| WC01 checklist | `coverageOutcomes` | Accepts direct policy outcomes derived from raw runtime artifacts | score and regulatory display |
| WC01 score | checklist rows plus findings | Consent effects can enter through direct coverage outcomes | customer score |
| `scan_snapshots` | three nullable booleans, plus compatibility evidence in pending work | Projection reads several runtime aliases | Overview, Admin Scans, API Activity |
| Overview | organization scan list projection | Displays snapshot/report-derived values | customer |
| Admin Scans | `scan_snapshots` A/R/O | Displays nullable booleans | administrator |
| API Activity | request row joined to `scan_snapshots` | Reuses the scan values for linked requests | administrator |
| Scan report | materialized runtime artifacts | Reads the compatibility representation and projected rows | customer |

### Source anchors

These anchors identify the current conversion and consumer points reviewed by
the audit. Line numbers describe the audited revision and are expected to move
after the direct replacement.

| Responsibility | Current source anchor |
|---|---|
| WS01 scanner-local consent/action terms | `../WS01/packages/scan-core/src/scan/snapshot/hybrid-runtime-evidence.ts:1011` |
| WS01 page-local action classification | `../WS01/packages/scan-core/src/scan/snapshot/hybrid-runtime-evidence.ts:1157` |
| WS01 first-layer compatibility projection | `../WS01/packages/scan-core/src/scan/snapshot/hybrid-runtime-evidence.ts:1527` and `:3206` |
| WS01 consent path interpretation | `../WS01/packages/scan-core/src/scan/snapshot/hybrid-runtime-evidence.ts:3071` |
| Typed consent observation schema | `packages/certscore-contracts/src/index.ts:436` |
| Typed surface inspection schema/projector | `packages/certscore-contracts/src/index.ts:1849` and `:1970` |
| WC01 bundle/geometry A/R/O reconciliation | `apps/web/server/scans/local-v2-dag-report.ts:3344` |
| WC01 surface/geometry reconciliation | `apps/web/server/scans/local-v2-dag-report.ts:3462` |
| WC01 repeated report materialization | `apps/web/server/scans/local-v2-dag-report.ts:3943` |
| Coverage-policy A/R/O re-extraction | `apps/web/lib/scans/gdpr-eprivacy-coverage-policy.ts:906` |
| Coverage-policy reject-path decision | `apps/web/lib/scans/gdpr-eprivacy-coverage-policy.ts:3521` |
| Coverage-policy duplicate label patterns | `apps/web/lib/scans/gdpr-eprivacy-coverage-policy.ts:832` and `:4390` |
| Unified-finding alias selection | `apps/web/lib/scans/scan-report-unified-findings.ts:1604` |
| Unified-finding label reclassification | `apps/web/lib/scans/scan-report-unified-findings.ts:1290` |
| Concern-policy label reclassification | `apps/web/lib/scans/concern-policy.ts:1308` |
| Finding evidence label reclassification | `apps/web/lib/scans/finding-evidence-contracts.ts:886` |
| Promotion evidence label reclassification | `apps/web/lib/scans/promotion-evidence-contracts.ts:216` |
| Top-finding label reclassification | `apps/web/lib/scans/top-finding-eligibility.ts:172` |
| Direct runtime-to-coverage/checklist bypass | `apps/web/server/scans/scan-detail-checklist.ts:26` |
| Checklist direct coverage-outcome consumption | `apps/web/lib/scans/gdpr-eprivacy-coverage-checklist.ts:3326` |
| Snapshot A/R/O projection | `apps/web/server/scans/scan-report-projection.ts:274` and `:330` |
| Admin Scans A/R/O consumer | `apps/web/server/admin/list-admin-scans.ts:540` |
| API Activity A/R/O consumer | `apps/web/server/admin/list-pulse-requests.ts:368` |
| Pulse raw-alias projection | `apps/web/lib/pulse/projection.ts:1562` |
| Overview grouping/display | `apps/web/app/app/page.tsx:57` and `apps/web/components/dashboard/overview-scan-history-card.tsx:54` |
| Existing calibration gate | `docs/certscore-v2/scan-quality-calibration-program.md:32` |

### Corpus method

The corpus pass recursively enumerated retained
`CanonicalEvidenceBundle.json` files, located a sibling
`ConsentControlGeometryEvidence.json` where available, and compared the
first-layer Accept/Reject/Options state after filtering to visible controls.
It separately counted:

- likely-present and first-layer observations;
- completed control inventories;
- incomplete pre-consent runtime;
- same-document pairs;
- bundle-to-geometry additions and erasures;
- erasures where the earlier inventory was explicitly complete.

Counts are descriptive of the retained local corpus, not accuracy labels.
Release agreement must be calculated only against Luna-approved adjudication.
Unreadable or unpaired geometry artifacts were excluded from pairwise
comparison but retained in the overall bundle counts.

## Defect inventory

### D1 — Consent controls bypass the canonical concern pipeline

**Severity:** critical

`deriveSharedScanDetailGdprEprivacyCoverageChecklist` builds normalized
concerns, but then calls `deriveGdprEprivacyCoveragePolicyOutcomes` with raw
runtime artifacts. The checklist consumes those direct outcomes. The consent
rows therefore do not consistently follow:

```text
observed evidence
→ normalized concern
→ concern policy
→ unified finding/checklist projection
```

Because the canonical score consumes the checklist, raw runtime interpretation
can affect score inputs without a canonical consent concern and policy
decision.

### D2 — Later snapshots can erase valid earlier controls

**Severity:** critical

WC01 reconciliation has treated geometry as a replacement in some completed
cases. The retained corpus contains 32 later-snapshot erasures and no additions.
Six are completed, same-document inventories. This violates temporal evidence
semantics: a later collapsed surface describes the later state; it does not
prove that an earlier control was absent.

### D3 — Label classification is duplicated across repositories and layers

**Severity:** high

WS01 contains scanner-local accept/reject/manage regexes. WC01 coverage policy
contains separate simple accept, simple reject, manage-choice, and reject
patterns. WC01 concern policy, finding evidence, promotion evidence, unified
findings, and top-finding eligibility also invoke the canonical classifier
independently.

The canonical classifier is therefore not the single classification point.
Adding a locale or CMP label can change one path but leave another path stale.

### D4 — `firstLayerConsentChoices` is a compatibility object, not a contract

**Severity:** high

The value is reconstructed from several aliases, copied into multiple runtime
locations, and consumed in camel-case and snake-case forms. It mixes:

- observation;
- interpretation;
- geometry reconciliation;
- coverage;
- compatibility aliases;
- report-ready booleans.

It lacks one mandatory assessment version, source hash, document identity,
explicit tri-state controls, and a single completeness rule.

### D5 — Boolean absence is ambiguous

**Severity:** high

Current booleans cannot distinguish:

- observed present;
- not observed under complete coverage;
- unknown because capture was incomplete;
- unknown because the scan was no-go;
- unknown because geometry and bundle documents differ;
- not applicable because no consent surface was observed under complete
  coverage.

The 310 incomplete-runtime bundles make this an active defect, not a theoretical
contract weakness.

### D6 — Geometry, DOM, accessibility, screenshot, and CMP precedence is implicit

**Severity:** high

The code has multiple partial precedence rules. CMP identity is correctly
separated from visible surface proof in one typed derivation, but downstream
fallbacks can still combine CMP, labels, and runtime aliases differently.
There is no single rule for temporal ordering, document mismatch, changed UI
state, complete negatives, or channel conflict.

### D7 — Privacy opt-out, reject, options, and deeper-layer controls can drift

**Severity:** high

The canonical classifier distinguishes these intents, but downstream regexes
and generic settings logic can blur them. In particular:

- `privacy_opt_out` is refusal-adjacent but is not first-layer cookie rejection;
- `options` proves a route to choices, not a reject control;
- a deeper-layer reject does not prove first-layer reject availability;
- necessary-only is valid reject-equivalent evidence only when it applies to
  the observed cookie consent surface.

### D8 — Persistence stores a lossy result without full provenance

**Severity:** medium

The three `scan_snapshots` booleans are useful for indexed reporting, but they
do not explain why a value is true, false, or null. Stale rows cannot be
reliably detected without projector version and source hash. A repair can
silently produce a different result from scan completion.

### D9 — Page equivalence is accidental

**Severity:** medium

Overview, Admin Scans, and API Activity converge on snapshot fields only after
separate materialization and fallback paths. The report and Pulse projection
can still read raw aliases. There is no enforced invariant that one `scan_id`
has the same assessment hash on every page.

### D10 — No-go and document mismatch can look like negative evidence

**Severity:** high

Some reconciliation paths clear controls when geometry is incomplete or the
document differs. Clearing values creates an apparent completed negative. A
no-go or document mismatch must make the affected assessment unknown and must
not create missing-control findings.

## Authoritative semantics

### Surface

`surface.status` has four values:

- `observed_actionable`: a pre-interaction consent surface and at least one
  actionable consent control were retained;
- `observed_non_actionable`: a consent surface was retained, but no actionable
  control was retained under otherwise adequate surface evidence;
- `not_observed`: no consent surface was observed and the required inspection
  coverage was complete;
- `unknown`: coverage, document identity, or scan usability was insufficient
  for a completed positive or negative.

CMP technology detection alone never establishes a visible surface.

### A/R/O controls

Each of Accept, Reject, and Options is tri-state:

- `observed`: at least one valid, visible, same-surface first-layer control was
  retained;
- `not_observed`: the relevant first-layer inventory was complete and no valid
  control of that intent was retained;
- `unknown`: the relevant inventory was incomplete, mismatched, no-go, or not
  applicable to a retained surface.

`not_observed` is not a synonym for `false` from a partial probe.

### Control intent

- Accept includes explicit acceptance of optional cookies/consent.
- Reject includes explicit rejection, refusal, or necessary/essential-only
  equivalents for the observed cookie-consent surface.
- Options includes a first-layer route to consent choices or preferences.
- Privacy opt-out remains a separate field and cannot satisfy Reject.
- Save-preferences remains evidence about a settings layer unless it is
  actually retained on the first layer.
- Dismiss/close remains separate and cannot satisfy Accept, Reject, or Options.

### Layer

Every control evidence item has a layer:

- `first_layer`;
- `deeper_layer`;
- `unknown`.

Only `first_layer` evidence contributes to A/R/O. Deeper-layer evidence may
support a separate path assessment, but it cannot be promoted into first-layer
A/R/O.

### Temporal observations

Observations are append-only evidence about a state at a time:

1. A valid earlier positive remains valid for the assessment when a later
   same-document observation sees a collapsed, hidden, or changed state.
2. A later observation may add controls.
3. A later observation may invalidate an earlier positive only with an
   explicit contradiction reason proving that the earlier control was
   misattributed, composite, non-actionable, from another document, or captured
   after a prohibited interaction.
4. A simple later absence is not a contradiction.
5. The assessment records both the first and last observation timestamps and
   the evidence selected for each control.

### Evidence channels

Channels are complementary, not a last-writer-wins hierarchy:

1. Typed actionable control inventory supplies control identity and intent.
2. Geometry supplies visibility, viewport, and hit-target proof at its
   timestamp.
3. Accessibility evidence supplies role/name/actionability proof.
4. DOM and page-script inventories supply bounded structural candidates.
5. Screenshots supply retained visual corroboration, not standalone label
   classification.
6. CMP evidence supplies provider/context evidence, not control or surface
   proof.

A high-confidence positive from any approved actionable channel may be retained
when its document and layer are valid. Completed negative claims require all
required channels for the relevant capability to be completed or explicitly
not applicable.

### Coverage and exceptional states

| State | Surface | A/R/O | Missing-control findings |
|---|---|---|---|
| Complete, actionable surface | observed | observed/not observed | permitted through concern policy |
| Complete, non-actionable surface | observed | not observed where inventory is complete | permitted through concern policy |
| Complete, no surface | not observed | unknown/not applicable | prohibited |
| Incomplete capture | unknown unless a positive was retained | positives retained; other fields unknown | prohibited for unknown controls |
| No-go / unusable document | unknown | unknown | prohibited |
| Document mismatch | unknown unless evidence can be partitioned to the canonical document | unknown for mismatched evidence | prohibited |
| Changed/collapsed later UI | observed if valid earlier surface exists | earlier positives retained | based on final assessment |

## Proposed versioned contract

The contract belongs in `@certscore/contracts`. WC01 owns invoking the
projector and persisting its output.

```ts
type TriState = "observed" | "not_observed" | "unknown";

type ConsentControlAssessmentV1 = {
  artifactType: "consent_control_assessment";
  artifactVersion: "1.0";
  assessmentStatus: "complete" | "limited" | "not_applicable";

  scan: {
    scanId: string;
    requestedUrl: string | null;
    finalUrl: string | null;
    scanStatus: string;
    noGo: boolean;
  };

  document: {
    identityStatus: "matched" | "mismatched" | "unknown";
    canonicalDocumentId: string | null;
    observedDocumentIds: string[];
    reasonCodes: string[];
  };

  surface: {
    status:
      | "observed_actionable"
      | "observed_non_actionable"
      | "not_observed"
      | "unknown";
    firstObservedAtMs: number | null;
    lastObservedAtMs: number | null;
    evidenceRefs: string[];
  };

  controls: {
    accept: ConsentControlResultV1;
    reject: ConsentControlResultV1;
    options: ConsentControlResultV1;
    privacyOptOut: ConsentControlResultV1;
  };

  coverage: {
    status: "complete" | "limited" | "none" | "not_applicable";
    requiredChannels: ConsentEvidenceChannel[];
    completedChannels: ConsentEvidenceChannel[];
    incompleteChannels: ConsentEvidenceChannel[];
    reasonCodes: string[];
  };

  evidence: ConsentControlEvidenceV1[];
  contradictions: ConsentControlContradictionV1[];
  limitations: {
    code: string;
    detail: string | null;
    affectedFields: Array<"surface" | "accept" | "reject" | "options" | "privacy_opt_out">;
  }[];

  provenance: {
    projectorId: "wc01.consent-control-assessment";
    projectorVersion: string;
    contractVersion: "1.0";
    sourceBundleVersion: string | null;
    sourceGeometryVersion: string | null;
    sourceHash: string;
    computedAt: string;
  };
};

type ConsentControlResultV1 = {
  state: TriState;
  layer: "first_layer" | "deeper_layer" | "unknown";
  reasonCodes: string[];
  evidenceRefs: string[];
  firstObservedAtMs: number | null;
  lastObservedAtMs: number | null;
};

type ConsentControlEvidenceV1 = {
  evidenceId: string;
  intent:
    | "accept"
    | "reject"
    | "options"
    | "privacy_opt_out"
    | "save_preferences"
    | "dismiss"
    | "other";
  label: string | null;
  locale: string | null;
  layer: "first_layer" | "deeper_layer" | "unknown";
  visible: boolean | null;
  actionable: boolean | null;
  observedAtMs: number;
  documentId: string | null;
  channels: ConsentEvidenceChannel[];
  artifactRefs: string[];
  classifier: {
    registryVersion: string;
    matchedTerm: string | null;
    matchStrength: string | null;
    reasonCodes: string[];
  } | null;
};
```

The schema must bound all arrays and strings. It must not retain raw DOM,
cookies, response bodies, or unbounded text. Evidence references point to
verified retained artifacts.

The persisted JSON is authoritative for traceability. Denormalized A/R/O and
surface columns are generated by or transactionally written from that same
object for query speed; they are not independently mutable facts.

## Single projector interface

```ts
deriveConsentControlAssessment({
  scanIdentity,
  noGoAssessment,
  runtimeCoverage,
  canonicalEvidenceBundle,
  consentControlGeometryEvidence
}): ConsentControlAssessmentV1
```

The projector must be pure, deterministic, versioned, and idempotent. It:

1. verifies artifact/document identity;
2. normalizes already-classified WS01 observations;
3. applies the temporal and channel precedence rules;
4. computes surface and tri-state controls;
5. records limitations and explicit contradictions;
6. produces a stable source hash from the bounded canonical inputs;
7. performs no legal, policy, finding, or score decision.

The projector must not accept a report display object or a previously
materialized `firstLayerConsentChoices` compatibility object as canonical
input.

## Required replacement flow

```text
WS01 observed evidence
  ├─ typed control observations
  ├─ timestamps and document identity
  ├─ geometry/accessibility/DOM channel status
  └─ CMP context
          │
          ▼
WC01 ConsentControlAssessment projector
          │
          ├─ persisted assessment + indexed projection
          │
          ▼
WC01 normalized consent concerns
          │
          ▼
WC01 concern policy
          │
          ▼
unified findings and checklist projection
          │
          ├─ canonical score
          ├─ report
          └─ scan_snapshots reporting projection
                   ├─ Overview
                   ├─ Admin Scans
                   └─ API Activity
```

### Consumer rules

- **Normalized concerns:** the only layer that converts assessment states into
  concern candidates. Unknown values cannot create absence concerns.
- **Concern policy:** the only layer that determines finding/checklist
  eligibility and severity.
- **Unified findings/checklist:** both must use policy-approved projections,
  not raw assessment labels.
- **Score:** consumes canonical checklist/finding projections only.
- **Report:** explains the retained assessment and projected findings. It does
  not infer controls.
- **Snapshots:** persist the assessment and denormalized query fields.
- **Overview/Admin/API Activity:** read the same snapshot projection for a
  `scan_id`. Reused API requests join to the linked scan assessment while
  retaining request-specific freshness and status.
- **Pulse projection:** receives a bounded assessment subset, not raw
  `firstLayerConsentChoices`.

## Direct-replacement migration

### Phase 0 — Contract and baseline

Owner: Sol, with Luna review.

1. Add the versioned contract and pure projector tests.
2. Freeze the audit corpus manifest and expected adjudicated outcomes.
3. Add fixtures for:
   - Oxfam temporal collapse;
   - same-document positive retention;
   - valid explicit contradiction;
   - document mismatch;
   - incomplete runtime;
   - no-go;
   - privacy opt-out distinct from reject;
   - options distinct from reject;
   - deeper-layer reject;
   - necessary-only reject equivalent;
   - composite parent-container rejection;
   - localized and shadow-DOM controls.
4. Luna signs off semantics, score-delta expectations, and the 95% gate
   calculation.

### Phase 1 — Additive persistence and backfill

Owner: Sol.

1. Add `consent_control_assessment jsonb` and:
   - `consent_assessment_version`;
   - `consent_assessment_source_hash`;
   - `consent_assessment_computed_at`;
   - `consent_assessment_status`.
2. Keep indexed A/R/O columns, but write them only from the assessment in the
   same transaction.
3. Add constraints that validate tri-state/boolean consistency.
4. Implement an idempotent backfill:
   - load verified retained artifacts;
   - run the same projector used at scan completion;
   - write only when version/hash is missing or stale;
   - record unknown for insufficient legacy evidence;
   - never fabricate a completed negative.
5. Emit counts for complete, limited, unknown, mismatched, no-go, stale, and
   failed materializations.

This phase populates data but does not establish a second canonical runtime
path. The old path remains live until cutover; the new projection is validated
offline.

### Phase 2 — Equivalence and score review

Owner: Sol; Luna approves score effects.

1. Compare the new assessment against retained adjudication, not against the
   old output as truth.
2. Produce page-equivalence checks for every sampled `scan_id`.
3. Produce score/checklist deltas with traceable assessment and concern IDs.
4. Repair stale or failed rows before cutover.
5. Block release if unknowns become false, if page values disagree, or if a
   score changes without an approved projected-row change.

### Phase 3 — Atomic cutover

Owner: Sol.

In one release:

1. switch scan completion to persist the assessment;
2. switch normalized concern construction to consume the assessment;
3. switch reports, snapshots, Overview, Admin Scans, API Activity, and Pulse to
   consume the assessment/projection;
4. disable all runtime alias and label-classification fallbacks;
5. remove direct raw-runtime consent outcomes from checklist construction;
6. remove downstream classifier calls for A/R/O;
7. fail closed to `unknown` if an assessment is missing or stale and enqueue
   the explicit repair job.

There is no indefinite dual canonical path and no request-time artifact
materialization.

### Phase 4 — Removal

Owner: Sol.

Remove:

- scanner-local label registries that compete with the canonical classifier;
- WC01 simple accept/reject/manage/reject regexes;
- `firstLayerConsentChoices` alias selection in policy, findings, Pulse, and
  report consumers;
- geometry replacement logic outside the projector;
- direct raw-runtime consent coverage outcomes;
- any database repair that writes A/R/O without producing a versioned
  assessment.

WS01 changes are assigned only where Phase 0 proves that timestamp, document
identity, channel completion, or typed control evidence is missing at capture.
SO owns any resulting scanner-runtime deployment or operational rollout.

## Stale-row repair

A row is stale when:

- the assessment is absent;
- its contract/projector version is unsupported;
- its source hash differs from the currently verified input hash;
- its indexed A/R/O fields differ from the persisted assessment;
- its canonical score references a checklist generated before the assessment
  version;
- the report and snapshot assessment hashes differ.

The repair job is idempotent, bounded, resumable, and auditable. It writes the
assessment first, then regenerates normalized concerns, policy projections,
checklist/finding projections, and score through the canonical pipeline. It
does not patch display fields or create findings directly.

## Observability

Required metrics:

- assessment materialization success/failure/latency;
- complete/limited/unknown/not-applicable rates;
- reason-code rates;
- document mismatch and no-go rates;
- stale source-hash count and repair queue age;
- page-to-page assessment-hash mismatch count;
- indexed-column/JSON mismatch count;
- score/checklist delta count by assessment version;
- positive-retention and explicit-contradiction counts;
- A/R/O exact and per-field agreement against the adjudicated corpus;
- false-positive control-claim rate.

Every customer-facing consent value must expose, internally, the assessment
version, source hash, and evidence IDs that produced it.

## Rollback

The migration is additive at the database layer. Rollback is:

1. stop the cutover deployment;
2. deploy the immediately preceding application image;
3. leave the assessment columns and backfilled data intact;
4. pause new assessment repair/materialization jobs;
5. retain logs and comparison artifacts for diagnosis.

Rollback must not delete assessment data or reverse a backfill. A corrected
projector version can recompute rows idempotently. The rollback window ends
only after the old fallback code is removed and the new baseline has passed the
release matrix for the agreed observation period.

## Test and release matrix

| Layer | Required coverage | Gate |
|---|---|---|
| Contract | schema bounds, tri-state invariants, document identity, provenance/hash | all pass |
| Projector unit fixtures | temporal merge, contradiction, no-go, mismatch, incomplete, all intents/layers/locales | all pass |
| Retained replay | all readable bundle/geometry pairs plus known regressions | ≥95% exact A/R/O and ≥95% per-field |
| False positives | adjudicated loaded pages | ≤1% |
| Owned canaries | basic, delayed, shadow DOM, localized, partial-control canaries | exact expected A/R/O; no material regression |
| Legacy backfill | idempotency, missing artifacts, stale version, repair resume | zero fabricated negatives; second run has zero semantic writes |
| Canonical pipeline | assessment → concern → policy → finding/checklist → score | every projected row traceable |
| Page equivalence | report, Overview, Admin Scans, API Activity for same `scan_id` | identical assessment hash and A/R/O |
| Reused requests | request linked to existing scan | scan values preserved; request freshness/status preserved |
| No-go/incomplete | unusable and partial scans | unknown; no missing-control finding |
| Performance | scan completion projection and page queries | no per-row artifact load or N+1; existing latency budgets pass |
| Rollback rehearsal | prior image against additive schema | successful before production cutover |

The existing 95% target remains a release gate, not an internet-wide accuracy
claim. The retained replay corpus, owned canaries, and rotating release sample
must all satisfy their existing calibration rules.

## Acceptance criteria mapping

| Acceptance criterion | Specification mechanism |
|---|---|
| One traceable customer-facing value | persisted assessment hash and evidence IDs |
| No downstream reclassification | consumer rules and Phase 3 fallback removal |
| Later state cannot erase valid earlier controls | temporal precedence rule |
| Incomplete evidence stays unknown | tri-state and coverage rules |
| Intent distinctions remain intact | separate reject/options/privacy-opt-out/layer semantics |
| Fixtures, replay, canaries, backfill, equivalence | release matrix |
| Luna/Sol/WS01 ownership | explicit phase ownership |

## Ownership and approval

- **Luna:** consent semantics, adjudicated calibration labels, 95% release gate,
  false-positive gate, and approval of score/checklist effects.
- **Sol:** contract implementation in WC01, projector, persistence, backfill,
  canonical concern/policy integration, consumer cutover, and fallback removal.
- **WS01 team:** only the capture/contract changes proved necessary by missing
  timestamps, document identity, channel completion, or typed observations.
- **SO:** scanner-runtime deployment, canary operations, production telemetry,
  and rollback operations if WS01 changes are required.

This audit authorizes no implementation or production integration by itself.
The direct replacement begins only after Luna approves the semantics and Sol
accepts the migration/release specification.
