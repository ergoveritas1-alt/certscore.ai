# Consent-control retained-review fixes (development only)

September 27, 2026. Implements the owner's request following the 140-case AI review. The cohort is model-reviewed, not independent human ground truth. Frozen predictions and original review labels are unchanged. No calibrated probability or measured production accuracy is claimed from these fixes.

## Fresh evidence behavior

`consent-control-label-registry.v8` adds narrowly scoped observation vocabulary:

- “Use necessary cookies” and “Accept essentials only” are necessary-only choices.
- Macedonian “Се согласувам”, “Не се согласувам”, and “Подесување” require cookie context and exact labels. This extends consent observation only, not policy-review languages or action authorization.
- Tab/navigation roles cannot be consent decisions.
- Notification choices cannot borrow a sibling cookie dialog's context.
- Inline “jetzt ablehnen” with paragraph-bound Utiq context is a vendor opt-out, not general Reject. A separate general Reject remains eligible.
- “OK” / “Got it” require local wording explicitly connecting that click to consent; a CMP selector or implied continued use is insufficient. Registered contextual-action recipes retain their separate verification requirements.

DOM, accessibility and geometry capture carry the local scope into the shared classifier. Classification reasons and registry version remain part of retained evidence. No display inference or new raw-signal finding path is introduced.

## Capture correctness

- Rapid inventory reports truncation as partial.
- Text-only prefilters cannot establish a completed control inventory.
- A later partial/timed-out inventory cannot obtain completeness from an earlier completed read. A later complete inventory can resolve an earlier failure.
- Geometry reconciliation preserves an unresolved partial/timed-out structured inspection.
- The existing 750 ms post-screenshot allowance is used for a direct rapid inventory. A timeout remains explicit; it does not reuse an old result as successful synchronized capture.
- Child-frame text contributes only through local retained control context; unrelated child error-page body text cannot masquerade as the main consent surface.

These are fresh-capture changes. Historical retained assessments, hashes and conclusions are not rewritten. The binary customer report projection and After-Accept/After-Reject gating remain governed by `observed-control-report-policy.md`.

## Scope and cost

Development/localhost only. No deployments, production backfills, new lanes, browser runs, model calls, retries or timeout increases. Deterministic classifier/context processing stays within existing capture limits. Estimated incremental compute is below $1/month at 100,000 scans; no additional paid-service usage is introduced.

## Verification

Focused synthetic fixtures reproduce the reviewed label, scope, frame, acknowledgment and completion failures without committing production captures. Regressions also cover preservation of legitimate general Reject, explicit-click OK consent, and action restrictions for observation-only vocabulary. Existing capture, geometry, action-proof, assessment and report tests verify the affected boundaries.

The fixtures demonstrate specific corrections, not a fresh holdout accuracy measurement. A separate untouched cohort is required for that measurement.
