# California Privacy Runtime Contract

> Deferred: this contract is retained for internal research and historical artifact interpretation only. CCPA/CPRA California privacy review is out of scope for the current production scanner and must not feed production report cards, executive findings, regulatory lenses, or public scan options without a separate approved integration.

This is the WC01 contract for Phase 2 California CCPA/CPRA review inputs from WS01.

WC01 remains the normalization, policy, unified-finding, checklist, and display owner. WS01 remains the observed runtime capture owner. The canonical flow stays:

```text
WS01 observed evidence
-> WC01 normalized concern
-> concern policy
-> unified finding / checklist projection
-> executive/regulatory display
```

## Top-Level Runtime Artifact Keys

WS01 should retain California review evidence under these runtime artifact keys:

- `californiaPrivacyEvidence`
- `cpraCbaOptOutEvidence`
- `gpcVerification`

WC01 accepts existing camelCase keys first. Backward-compatible snake_case readers exist in the WC01 adapter where older artifacts may already use them.

Executable contract fixtures live in:

- `packages/shared/src/regulatory-review/california-privacy-runtime-fixtures.ts`

## Evidence Families

Each decisive row posture must be reconstructable from retained evidence. In practice, an independent reviewer or LLM should be able to inspect the row's `criticalEvidence.retainedEvidence`, `evidenceRefs`, and `missingOrIncompleteSourceSignals` and agree with the CertScore posture:

- `observed` needs the observed control, surface, signal, URL, snippet, or comparison result.
- `potential_gap` needs both applicability evidence and missing/failed control evidence.
- `review_signal` needs concrete runtime, policy, interaction, or accessibility facts that justify human review.
- `not_testable`, `not_observed`, and `not_applicable` need limitation or applicability facts, not a synthesized finding.

Avoid status-only packets. A boolean without the supporting URLs, vendors, snippets, deltas, selectors, or search scope is not enough for a durable California review.

### `notice_surface`

Used for privacy policy / California notice availability.

Important fields:

- `californiaPrivacyEvidence.privacyNoticeObserved`
- `californiaPrivacyEvidence.privacyNoticeUrls`
- `californiaPrivacyEvidence.californiaNoticeCueObserved`
- `californiaPrivacyEvidence.californiaNoticeCueText`

### `collection_notice`

Used for notice-at-collection review. WC01 only treats a missing cue as a potential gap when a collection context was actually observed.

Important fields:

- `californiaPrivacyEvidence.collectionContextObserved`
- `californiaPrivacyEvidence.collectionContextUrls`
- `californiaPrivacyEvidence.collectionContextTypes`
- `californiaPrivacyEvidence.collectionNoticeCueObserved`
- `californiaPrivacyEvidence.collectionNoticeCueText`

### `sale_share_control`

Used for Do Not Sell or Share / privacy-choice controls. Missing control findings require both applicability evidence and inspected control evidence.

Important fields:

- `californiaPrivacyEvidence.targetedAdvertisingSignalsObserved`
- `californiaPrivacyEvidence.doNotSellSharePathObserved`
- `californiaPrivacyEvidence.doNotSellSharePathUrl`
- `californiaPrivacyEvidence.doNotSellSharePathLabel`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence`
- `cpraCbaOptOutEvidence.choiceControlsInspected`
- `cpraCbaOptOutEvidence.optOutUiResult`
- `cpraCbaOptOutEvidence.optOutControlFound`
- `cpraCbaOptOutEvidence.privacyChoiceSearchUrls`

### `gpc_handling`

Used for Global Privacy Control handling. WC01 treats tracker/cookie deltas as review evidence, not a legal conclusion. Explicit non-recognition evidence may project a conservative `potential_gap` checklist status.

Important fields:

- `californiaPrivacyEvidence.gpcTestRan`
- `californiaPrivacyEvidence.gpcSignalSent`
- `californiaPrivacyEvidence.gpcRecognitionObserved`
- `gpcVerification.status`
- `gpcVerification.trackerCountDelta`
- `gpcVerification.thirdPartyCookieCountDelta`
- `gpcVerification.policyMentions`

### `opt_out_friction`

Used for privacy-choice path and dark-pattern review. This row should not infer successful opt-out from the existence of a privacy-choice URL. If WS01 cannot complete the preference-center probe, retain the attempted URL, the final URL when available, the probe reason, visible snippets, and the limitation.

Important fields:

- `californiaPrivacyEvidence.doNotSellSharePathObserved`
- `californiaPrivacyEvidence.doNotSellSharePathUrl`
- `californiaPrivacyEvidence.doNotSellSharePathLabel`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterProbeUrl`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterProbeFinalUrl`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterProbeAttempts`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterProbeErrorCategory`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterProbeReason`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceCenterVisibleTextSnippets`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceActionCandidateCount`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceActionCandidateLabels`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceSaveCandidateCount`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceSaveCandidateLabels`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceToggleCandidateCount`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.preferenceToggleCandidateLabels`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.visibleTextSnippets`
- `californiaPrivacyEvidence.optOutFrictionSignals`
- `californiaPrivacyEvidence.optOutInteractionSteps`

### `post_opt_out_tracking`

Deferred from the current production core scanner. Historical or research artifacts may retain before/after behavior after an observed opt-out or reject action, but WC01 should not promote this row into production findings or checklist gaps. In current production posture, leave this row `not_testable` / internal-review unless a separate product-approved post-choice integration is explicitly enabled.

Important fields:

- `californiaPrivacyEvidence.optOutInteractionConfirmed`
- `californiaPrivacyEvidence.postOptOutTrackingReductionObserved`
- `californiaPrivacyEvidence.postOptOutTrackingPersisted`
- `californiaPrivacyEvidence.postOptOutPersistedVendors`
- `californiaPrivacyEvidence.postOptOutRequestUrls`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.removedTrackerVendors`
- `californiaPrivacyEvidence.privacyChoiceInteractionEvidence.persistedTrackerVendors`

### `adtech_sharing_runtime`

Used for runtime sale/share or cross-context advertising signals.

Important fields:

- `californiaPrivacyEvidence.targetedAdvertisingSignalsObserved`
- `californiaPrivacyEvidence.saleShareRuntimeSignalsObserved`
- `californiaPrivacyEvidence.advertisingSharingVendors`
- `californiaPrivacyEvidence.saleShareRequestUrls`
- `californiaPrivacyEvidence.saleShareCookieNames`

### `sensitive_pi`

Used for sensitive surfaces, Limit Use, and sensitive-surface tracking review.

Important fields:

- `californiaPrivacyEvidence.sensitivePiContextObserved`
- `californiaPrivacyEvidence.sensitivePiCategories`
- `californiaPrivacyEvidence.sensitivePiContextUrls`
- `californiaPrivacyEvidence.sensitiveThirdPartyTrackingObserved`
- `californiaPrivacyEvidence.sensitiveThirdPartyTrackingVendors`
- `californiaPrivacyEvidence.sensitiveThirdPartyTrackingRequestUrls`
- `californiaPrivacyEvidence.limitUseSensitivePiPathObserved`
- `californiaPrivacyEvidence.limitUseSensitivePiPathUrl`

### `rights_methods`

Used for consumer rights request methods. WC01 currently creates positive rights-path evidence only; absence is a checklist coverage state, not a finding.

Important fields:

- `californiaPrivacyEvidence.consumerRightsRequestMethodObserved`
- `californiaPrivacyEvidence.consumerRightsRequestMethodUrls`
- `californiaPrivacyEvidence.consumerRightsRequestMethodTypes`
- `californiaPrivacyEvidence.consumerRightsRequestMethodSnippets`

## Non-Goals

- Missing California packets must not create unified findings.
- Missing evidence must not be treated as noncompliance.
- WC01 must not synthesize evidence from inferred legal applicability.
- Display rows should be backed by unified findings or explicit coverage-limitation evidence.

## Current Fixture Coverage

`evidenceRichReviewSignal` covers:

- observed privacy notice
- observed collection notice cue
- CPRA opt-out potential gap with inspected choice-control evidence
- GPC potential-gap signal with explicit non-recognition evidence
- sensitive surface with third-party tracking
- observed consumer rights request methods

`observedControlsOnly` covers:

- observed privacy notice
- observed privacy-choice path
- observed consumer rights request methods
- honored GPC evidence
- no absence-driven CPRA opt-out finding

`observedPostOptOutReduction` covers:

- confirmed privacy-choice interaction evidence
- post-opt-out tracker reduction
- retained removed tracker vendors
- opt-out friction review details from preference-center probing

`privacyChoiceProbeLimited` covers:

- observed privacy-choice path
- retained preference-center probe URL, reason, and visible text snippets
- conservative `not_testable` post-opt-out posture when no opt-out action was confirmed

`sensitiveInputRuntimeSignal` covers:

- notice-at-collection potential gap with retained collection context
- sensitive surface with third-party tracking review signal
- Limit Use potential gap with sensitive PI applicability and missing-control evidence

## Real-Scan Validation Notes

A local WS01/WC01 replay pass was run against 16 domains:

- `caltech.edu`
- `sony.com`
- `nbcnews.com`
- `kbdlab.io`
- `nvidia.com`
- `viking.com`
- `nike.com`
- `kalshi.com`
- `purdue.edu`
- `draftkings.com`
- `mit.edu`
- `grammarly.com`
- `fandango.com`
- `walmart.com`
- `uber.com`
- `amazon.com`

Replay summary:

```json
{
  "domainCount": 16,
  "byStatus": {
    "observed": 60,
    "potential_gap": 21,
    "review_signal": 30,
    "not_testable": 44,
    "not_applicable": 16,
    "not_observed": 21
  },
  "weakCount": 0,
  "rowsWithNormalizedConcern": 87,
  "potentialGapWithoutNormalizedConcern": 0
}
```

After adding preference-center probe diagnostics, the 16-domain local WS01 export was rerun from:

- `/Users/benmasek/WS01/tmp/california-phase2-validation-preference-diagnostics-rerun`

WC01 replay output:

- `/Users/benmasek/WC01/apps/web/tmp/california-phase2-validation-preference-diagnostics-rerun-replay/wc01-california-phase2-replay.audit.json`

Rerun summary:

```json
{
  "domainCount": 16,
  "byStatus": {
    "observed": 57,
    "review_signal": 31,
    "potential_gap": 21,
    "not_testable": 45,
    "not_observed": 22,
    "not_applicable": 16
  },
  "weakCount": 0,
  "rowsWithNormalizedConcern": 85,
  "potentialGapWithoutNormalizedConcern": 0,
  "probeDiagnosticDomainCount": 14,
  "probeDiagnosticRowCount": 42
}
```

Interpretation:

- The richer preference-center fields improved evidence depth, not status aggressiveness.
- `weakCount` remained `0`, so every row posture still has enough retained evidence for review.
- `potential_gap` stayed properly gated; no potential gap was emitted without normalized concern backing.
- Post-opt-out tracking rows are outside the current production core scanner. They should stay `not_testable` / internal-review unless a separate product-approved post-choice integration is explicitly enabled.

Current capture gaps to harden upstream in WS01:

- Preference-center probing can still end as `probe_error` on complex or vendor-hosted flows. Retain the attempted URL, final URL, probe reason, visible snippets, and limitation so WC01 can keep opt-out friction as a review signal and post-opt-out tracking as `not_testable` when no action was confirmed.
- Notice-at-collection proximity should become more structured around actual collection controls, nearby link/snippet references, and surface type. WC01 should only emit a `potential_gap` when collection context and missing cue evidence are both retained.
- Rights-method extraction should keep method type, URL, source snippet, and policy/source URL. Absence remains `not_observed` or `not_testable`, not a finding.
- Limit Use evidence should retain both sensitive PI applicability and the observed/missing Limit Use path signal. WC01 must not infer sensitive PI applicability from generic page category alone.
- GPC review is strongest when WS01 retains explicit recognition or honoring evidence. Tracker/cookie deltas are useful review signals but should not become definitive legal conclusions.
