# Retained A/R audit: canonical fixes and local verification

Status: implemented locally; not committed or deployed. Existing unrelated work
is preserved. This is observation recognition and evidence-capture verification,
not a production release or proof of successful Accept/Reject registration.

## Changes

The canonical label registry now uses `consent-control-label-registry.v11`.
It adds 15 exact, consent-context-bound multilingual observation aliases from
the retained audit, and corrects Portuguese negation handling for the category
phrase “cookies não essenciais.” Genuine negation still vetoes classification.

“Limit Cookies” requires explicit nearby wording naming that choice and its
necessary-only effect. “Strictly Necessary” and “Essential Cookies,” discovered
in the fresh cohort, likewise require their explicit label-bound effect wording.
Category headings alone do not qualify. Non-functional refusal remains a distinct
variant; it is not relabeled as necessary-only.

The passive DOM/geometry producers can bind “Click Here” only to an immediately
following readable text node spelling out refusal of all non-essential cookies.
They do not borrow another link or a hidden span. The bounded binding is retained
in typed controls and geometry. Short independent Czech cookie headings can now
provide local context to a submit input; hidden text and page chrome remain excluded.

Child-frame inventory now checks the child's viewport and hidden ancestors.
An offscreen control in a one-pixel frame is not visible first-layer evidence;
the passive child-frame recovery does not inspect full-document CMP markup as
visible controls. Visible-frame positive safeguards remain covered.

New aliases are observation-only. Action authorization, recipes, registration,
scoring, projection and historical records are unchanged. No lane, timeout,
retry, model call or extra wait is added. The canonical A/R regression gate now
includes both new audit test files.

## Retained replay and conflict investigation

- Replayed 1,443 retained candidates against the final classifier: 15 unknown
  labels now have the expected A/R intent; no already-known intent changed.
  This is label/context replay, not reprocessing historical assessments.
- Browser fixtures cover the short Czech heading, inline Motorola refusal,
  necessary-only instructions, hidden/sibling text negatives, and frame visibility.
- Feedback Company: screenshots at 2.903/4.069 seconds preceded the typed
  Allow/Deny inventory at 5.515 seconds in the same loader. The earlier image
  does not establish a false positive in the later inventory.
- PortAventura: the A/R screenshot at 8.504 seconds and final inventory/geometry
  at 13.202/14.142 seconds have different loader identities. Earlier pixels
  cannot supply final-document evidence. The later capture also had inaccessible
  frames; its limitation remains unresolved.
- Nomura: retained Accept evidence came from `blank.html`; later geometry records
  a 1-pixel frame with the control outside its viewport. The viewport bug was
  reproduced and fixed locally. This does not conclusively reconstruct whether
  the earlier historical frame was visible.

Original retained artifacts are unchanged. Downloaded bundle hashes are local
byte hashes; the source manifest did not provide an expected hash for those bundles.

## Fresh local cohort

Fifty additional domains, excluding the previous 326 visually selected scans,
were selected through the canonical eligibility tooling. The owner-authorized
cooldown waiver was recorded; blocked/do-not-calibrate rules remained active.
The sample was enriched for prior consent surfaces, so its rates are not population
estimates. Central bookkeeping confirms all 50 contacts were persisted.

One passive consent-proof visit per domain ran locally, October 9, 2026,
4:09:30–4:13:52 AM America/Los_Angeles (11:09:30–11:13:52 UTC), using ConsentCheckBot
HTTP identity and native Chromium navigator identity. Local California egress,
en-IE locale and Europe/Dublin timezone do not reproduce EU production egress.
No Accept/Reject clicks, form submissions, retries or model calls occurred.

- 50/50 scanner executions completed; this does not mean complete page coverage.
- 40 had observed consent-surface captures; 10 had no evidence.
- Inventory: 29 partial, 10 complete with controls, 8 complete empty, 3 geometry
  unavailable. Missing evidence is not converted into verified control absence.
- Original v10 output observed Accept on 38 visits and Reject on 27.
- Contact-sheet triage covered 50 selected frames; native inspection covered
  NSF, Tottenham, AdvancedMD, Campus France, Adecco, Sodexo, XHNetwork and Milanote.
  This is model-assisted diagnostic review, not independent human adjudication.
- Two confirmed recognition misses: Adecco's “Strictly Necessary” and Sodexo's
  “Essential Cookies.” That is 2/50 (4%) of this selected cohort, not the scanner's
  population error rate. Both corrections pass browser fixtures and offline replay
  against their retained banner text under v11. No additional live rescan was run.
- Vinted Ireland's latest retained screenshot predates its final inventory;
  screenshot-to-inventory agreement remains unresolved. No false positive is
  asserted from that mismatch. Covered acknowledgment and close-only banners are
  not promoted to explicit Accept/Reject.

The fresh batch captured v10 source; v11 contains the two subsequent instruction
rules and typed binding retention. Both source fingerprints are retained.
No zero-error or production-readiness claim is made from this cohort.

## Verification and cost

- Final contracts suite: 564 passed, zero failures.
- Final scanner/browser regression set: 129 passed, zero failures.
- Final canonical A/R gate: 367 passed plus 8 coordinator tests, zero failures.
- Scanner typecheck, calibration registry validation and `git diff --check` passed.
  Test groups overlap and must not be summed as distinct cases.

Estimated one-off artifact downloads: below $0.01. Contact bookkeeping: below
$0.10 once. Additional bounded binding metadata: below $0.10/month at 100,000
scans, disclosed before proceeding. No additional production compute allowance
or model usage was introduced.

Compact receipts and summaries:
`docs/certscore-v2/calibration-runs/2026-10-09-ar-controls-canonical-fixes/`.
Original local bundles, screenshots, replay inputs and test logs:
`artifacts/ar-controls-canonical-fixes-20261009/`.

Remaining release work: full release readiness, production-topology verification,
and separate resolution of timing/document-binding cases. No deployment occurred.
