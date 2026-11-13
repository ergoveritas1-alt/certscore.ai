# CertScore.ai scan completeness follow-up — November 13, 2026

Local implementation and verification only. Deployment remains on hold. Existing capture, action, acquisition, frame, request, memory and retention limits are unchanged. SITS and ergoveritas were excluded from public visits. Existing unrelated workspace changes and historical reports were preserved.

## Implemented changes and evidence

- **Reusable regression gate:** `pnpm test:scan-completeness` combines retained Accept/Reject reliability, Osano receipt/instance handling, OneTrust document/readback checks, form/image deadlines, short-policy applicability, first-layer inspection and final geometry projection. The existing predeploy policy/source-witness and action-semantics gates include the new policy and limitation tests.
- **Image competition:** `collection-surface-snapshots.test.ts` reproduces three form candidates with one indefinitely stalled image reviewer. Two sibling images finish; the stalled image remains unavailable; all structured form evidence and original field values survive, and late resolution cannot mutate the published result. This protects existing deadline behavior; it did not require a new runtime capture change.
- **Action limitation diagnosis:** `readChoicePathLimitation` validates canonical report projections and distinguishes unresolved controls, unverified binding, incomplete clicks, incomplete observations and completed-but-unconfirmed choices. Explicit worker/deadline outcomes are separate from missing verified results. Both action runtime projections retain the diagnosis; Reject checklist/UI and Accept after-click copy consume it. Unknowns do not become absence, successful consent registration, findings or scoring changes. The 34 retained unconfirmed paths plus explicit worker/deadline fixtures justify the descriptive change.
- **Short governing notices:** the former narrow disclosure pattern was replaced by bounded same-clause subject/data/operation evidence, with two distinct statements and deduplicated facts. The canonical caller supplies its document-owner entity. Ownership, exact policy candidate, complete text, visitor scope, standalone document and consent-shell guards remain required. Explicit examples/templates remain excluded. No hostname exceptions, extra fetches, model calls or legal-omission eligibility were added.

The short-policy fixtures include the original hash-bound BlogFreely/Vimm documents, held-out Alpine Linux and FreeCode notices, twelve retained shell/index/editorial/error negatives, and synthetic template/duplicate/subject-binding negatives. The 203-document retained corpus replay admits the four public notices and two local canary notices. It is a body-assessment replay with conservative zero defaults for missing historical counters, not a new full scanner run or proof that every language is supported. Persian/Estonian cases without sufficient supported declarations remain unresolved. Report-level tests confirm that short notice presence does not authorize missing-disclosure conclusions.

## Investigations with no justified eligibility relaxation

All 34 historical action paths (22 Accept, 12 Reject) remain unconfirmed in current-code replay. Preserve their completed clicks/observations. OneTrust cases lack sufficient reviewed source, same-document continuity or complete group/configuration proof. Iubenda retained purpose diagnostics do not establish the complete configured-purpose/TCF universe. The newer supported Osano receipt path does not retroactively repair older packets. No provider exception was added.

For hkbu.edu.hk, circle.so and flocktory.com, retained summaries show unresolved visible decisions but do not retain enough original geometry candidates and intent-specific inspection proof to reproduce a false opt-out conclusion. The current contract already permits complete same-document opt-out-specific inspection despite another intent's ambiguity. Tests preserve observed controls, genuinely ambiguous opt-out unknowns and first-layer requirements.

The eleven `inventory_outcome_unsupported` summaries do not prove that the existing final-geometry eligibility gate rejected usable same-document evidence. No eligibility change was made. Required missing proof: original inventory outcome, same-document identity, candidates, control-specific inspection and exact retained geometry read. Existing tests preserve the single refresh, frame cap and 1,100 ms read limit; tiktokio retained-frame-cap, highsnobiety live-frame-cap and barcelo timeout remain distinct.

## Localhost results

Four rotating targets were selected using current central contact history and the owner's cooldown waiver. Two additional registry targets were selected as focused diagnostics, not a population acceptance sample. All six attempts remain in the denominator.

| Target | Report | Accept / Reject | Forms and images |
|---|---|---|---|
| posthog.com | Ready | Both controls unresolved; no clicks | No forms retained |
| archonph.com | Ready | Accept result deadline; Reject unresolved | No forms retained |
| wordpress.org | Ready | Both result deadlines | No forms retained |
| schloss-stadt-huelchrath.de | Failed | Starting-page runtime content unavailable | No report; retained failure diagnostics |
| hotjar.com | Ready | Both controls unresolved; no clicks | No forms retained |
| hubspot.com | Ready | Both clicked, confirmed and observed | One post-Accept form retained; image explicitly unavailable (`no_visible_context`) |

HubSpot packet durations were 11,008 ms Accept and 12,832 ms Reject. Accept registered at 7,987 ms, structured form capture ended at 10,987 ms, and its image diagnostic completed in 107 ms. Its bounded form capture remains limited (`capture_limit`, `frame_unavailable`, 2 of 10 candidate frames inspected); no extra frame acquisition was added. The final report contains exactly the retained post-Accept form and snapshot metadata, verified against packet SHA-256 and byte size.

This live sample verifies successful Accept/Reject and structured-form retention on HubSpot, explicit limitations elsewhere, and fail-closed starting-page handling. It **does not verify delivery of an available live form image**. Available-image retention and the late ~16-second Accept case passed deterministic local browser/report fixtures. No guarantee of universal action completion is implied.

## Validation and operational records

- Composite gate: 177 retained-action tests, 61 post-Accept form tests, 149 provider/image/policy/control tests passed. The subsequently appended geometry/projector/limitation suites passed 74/74.
- Final policy/report tests and the 203-document replay passed; all twelve reviewed negative texts remained excluded in both retained-classifier and current-classifier replay.
- Reject coverage/presentation suite passed 292/292. Additional Accept/Reject copy tests passed after correcting a test-only fixture path.
- Core build and core/web TypeScript checks passed. The initial workspace had an unrelated trailing blank-line warning in `reject-named-stability.test.ts`; it was preserved.
- Evidence, commands, exact scan IDs, final report snapshots, packet hashes, contact receipts and replay scripts are in `artifacts/scan-completeness-20261113/`. `final-verification.json` is the per-scan record; `MANIFEST.json` binds the local review files.
- The manual ledger retains all 290 entries; only the six contacted targets were updated. The central contact record uses idempotent run key `completeness-20261113-six-local`. No bot queue rows or reconciliation behavior were changed.

No recurring browser/request/model cost was added. Bounded diagnostic strings are estimated below $0.10/month at 100,000 scans. Existing repository-controlled calibration ledger access adds only the previously disclosed small one-off operational cost, below $0.05. No deployment or production scanner execution occurred.
