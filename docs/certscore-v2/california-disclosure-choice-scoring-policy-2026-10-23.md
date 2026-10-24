# CertScore.ai California disclosure and required-link scoring

Owner-approved local implementation, October 23, 2026. No deployment, flag changes, live scans, historical rewrites, worker additions or budget increases.

The subsequently approved [runtime-evidence basis](california-runtime-link-scoring-policy-2026-10-23.md)
uses a new version for future captures. This document remains the unchanged v1
declaration-basis contract and historical scoring reference.

New captures retain `california.disclosure-choice.v1` in their policy inspection metadata. Both scan-core terminal bundles and the Lambda early policy packet carry the marker; the verified policy lane owns its merge. WC01 materializes a source/scan/document-bound `disclosureChoiceAssessment` only when that marker is present on a v10 California review. Older captures and persisted assessments retain their original policies. No read-time upgrade, backfill or report-cache invalidation is introduced.

The canonical registry defines `california-regulatory-posture.v18-disclosure-choice`:

- A sole proven non-discrimination disclosure omission receives 3 points. Other rights under review stay unresolved, not additional omissions or passes. A proven omission of know, delete or correct retains the existing 12-point family effect, once per scan; non-discrimination is not charged again.
- A required opt-out link absence receives 6 points once per scan only with the typed proof below. Bare absence and unresolved obligations or alternatives remain neutral for this effect.
- Analytics potential-risk scoring, qualified collection recipient schedules, recipient deduplication, GPP, Reject, WCAG and EU effects remain unchanged. The new overall California version is retained even when other California families also apply.

The new rules use the existing persisted assessment -> normalized concern -> concern policy -> reportable unified finding -> canonical score pipeline. A snapshot, raw policy excerpt, top-finding selector, vendor label or later CMP readback cannot create an effect. Internal scoring review renders the registry; customer finding copy and reports retain their existing presentation without deduction explanations.

## Narrow required-link proof

The first implementation supports one deterministic basis: `california_declaration_without_required_signal_disclosure.v1`.

It requires all of the following:

1. The original representative homepage has a current, complete, document-bound named-choice inspection with no candidates, controls or truncation. Historical and self-hidden-frame inspection semantics remain unchanged.
2. The existing verified governing-policy coverage and all material linked supplements are complete, owned, untranslated English text. Missing, partial, unsupported or mismatched text cannot supply a negative conclusion.
3. The canonical sale/sharing assessment contains a positively described sale/sharing claim. The exact retained affirmative clause explicitly identifies California law or the CCPA/CPRA and describes the business selling/sharing personal information. A foreign-law clause, analytics alone, ambiguous/conditional claim or California heading elsewhere is insufficient.
4. Inspection of every complete policy document finds no possible signal/exception concept. A single reference to GPC, global privacy controls, signals, browsers/extensions, automatic processing, universal choices or related privacy/opt-out settings blocks this basis. Such wording is unresolved context, never proof of a qualifying alternative or successful honoring.

The basis addresses the necessary policy disclosures for the frictionless exception in regulations 7013(d) and 7025(g). It does not test SDK readiness, prove GPC honoring or make a final determination of business applicability. Existing reports remain assessed assuming CCPA/CPRA applies. The implementation does not attempt to reject a described alternative or add a second basis based on runtime GPC findings. A broader basis needs separate evidence review and approval.

Proof retains the exact declaration offsets/hash/reference and the bounded full policy inspection inventory (at most eight documents of 160,000 characters each). Contract validation joins every source, document and clause to the original review; the verified projector also joins declaration bytes. No extra source read, browser visit, wait, action, model call or capture is introduced. The policy marker makes this new work distinguishable from historical interpretation.

## Reachability and cost

Positive eligibility is demonstrated by offline fixtures, not live scans. The retained replay verifies 341 historical bundles and reproduces 34 complete choice-absence candidates among 210 latest usable visits, including five sentinels. Only two of those candidates have any full policy text downloaded locally (six files); this work establishes no complete eligible required-link case in that cohort. Do not interpret that as a population incidence estimate or convert those historical cases to the new policy.

Six worker lanes, existing Lambda settings, absolute capture and action budgets, current flags and the shared $10 within $50 allowance remain unchanged. Local recurring cost is $0. Future bounded report processing and metadata are estimated below $0.10/month at 100,000 scans, within the existing allowance; this is a planning estimate, not measured AWS billing. No production activation is authorized by local completion.

Verification is recorded in `artifacts/california-disclosure-choice-scoring-2026-10-23/`: canonical persistence/scoring tests, legacy compatibility replay, negative exception/provenance cases, Lambda marker handoff/merge, six-lane orchestration, source integrity checks, browser bundling and affected package typechecks.
