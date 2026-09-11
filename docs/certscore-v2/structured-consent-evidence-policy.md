# Structured consent evidence policy

Approved by the product owner on September 5, 2026. Assessment contract: 2.1.
Evidence policy: `structured_control_evidence.v1`.

## Authority and safety

Retained DOM/accessibility inventory and geometry are factual control evidence.
Their existing document identity, visibility, actionability, coverage,
inaccessible-frame, and no-go checks remain authoritative. Screenshot display
safety is independent. A missing/withheld image does not erase verified A/R/O;
an available image cannot supply missing structured observations or prove absence.

The scanner still captures same-session visual evidence and uses the existing
fail-closed safety gate. No unsafe image is exposed, no discarded image is
reconstructed, and no image is rebound to another document or control snapshot.
Geometry evidence references its retained JSON, not a withheld image as its sole
proof. A stable partial inventory may bind to completed same-document geometry
for 2.1 assessment; scanner-side legacy screenshot binding remains unchanged.

The canonical flow remains retained evidence → assessment → persisted typed
projection → normalized concerns → concern policy → checklist/unified findings
→ report and score. There is no display fallback or new scoring rule.
Control recognition is not successful consent registration: Accept/Reject lanes
still require separate authorization, a verified actionable control, a completed
action and the existing semantic registration/post-action evidence invariants.

## Version and persistence

New assessments emit `artifactVersion` and provenance `contractVersion` 2.1,
explicit `evidencePolicy`, and bounded `visualEvidence` (status, artifact refs,
reason codes). Visual metadata and the policy participate in source hashing.
Structured coverage excludes screenshot availability. The 2.1 schema rejects
missing policy/visual metadata, mixed versions, and complete assessments with
unknown A/R/O or invalid document/coverage status.

The reader also accepts 2.0 without rewriting its states. No bulk backfill or
scan is performed. Normal canonical rematerialization uses the new version and
cache identity, preserving original retained inputs. JSON persistence preserves
version, evidence refs, source hash and separate visual status.

## Verification and resource impact

Regression coverage includes withheld/missing images, unchanged structured
results across visual statuses, screenshot-only input, Accept-only complete
inventory, partial inventories, document mismatches, legacy reads, schema
invariants, and persistence → policy → checklist → score parity.
Existing visual-safety and action-lane regressions remain required.

Local verification passed 369 focused regression tests, the contracts build,
and the web TypeScript check. An in-memory replay of retained scan
`95c6a49e-e27c-4691-ab1c-7c689461db0c` produced complete structured coverage:
Accept observed; Reject and Options not observed; representative visual withheld
with its original safety-deadline reason. This is passive control inventory,
not verified Accept-path success. No scan, report republish, backfill, or deployment
was performed.

No new browser/model/service calls, timeout increases, provisioned capacity, or
deployment changes. Added bounded visual/policy metadata is typically under
1 KiB per assessment; estimated incremental storage is below $1/month for
100,000 retained assessments without a capacity-tier change. No paid calls were
made for verification; tests and retained replay are local.
The replay's additional policy/visual metadata measured 232 bytes.

## Loading-document negative-evidence guard

The DOM inventory retains `documentReadyState` in the same browser evaluation
as its controls. An empty inventory while `loading` remains partial, including
after same-session geometry recovery; it cannot establish absence. Visible
controls remain eligible through the existing structured proof without waiting
for document completion. Inspection/geometry timestamps are not banner-appearance
timestamps when the canonical surface is unknown or not observed.

This is additive retained evidence, not a screenshot dependency or a new wait.
The bounded field adds approximately 35 bytes per observation (well below
$1/month at 100,000 scans). Legacy packets remain readable.

## September 10 A/R/O capture corrections (local; not deployed)

The owner requested implementation after the three-day production review,
excluding every ErgoVeritas canary, and explicitly withheld deployment. New
materializations retain contract 2.1 and `structured_control_evidence.v1`, use
projector 2.1.1, capture policy `consent-control-capture.v2`, and classifier
`consent-control-label-registry.v2`. The projection cache identity advances to
`wc01.normalized-concern-policy.v4` and the in-process materialization cache
to `local-v2-report-materialization-v17`. Existing stored 2.0/2.1 conclusions stay
unchanged on read; this work performs no backfill or report publication.

### Evidence rules

- A visible, enabled, first-layer decision button with local consent context
  and unresolved semantics blocks negative A/R/O conclusions. It remains typed
  uncertainty through final geometry reconciliation and assessment. Proven
  positive controls survive; dismissals and ordinary policy links do not become
  unresolved decision buttons. Bounded candidate overflow cannot prove absence.
- DOM and accessibility classification uses bounded local context. Root-page
  privacy text and navigation/footer context cannot supply generic Options.
  Generic Settings/Preferences phrases require exact labels. Existing canonical
  Borlabs `Individual preferences` remains recognized explicitly.
- Accessibility candidates retain the outcome of the existing box-model read.
  Positive finite in-viewport geometry is required for visible control evidence.
  Missing box proof and candidates beyond the existing forty-read cap are
  unverified, not visible by default. Verified typed controls from other channels
  remain independently usable. Legacy AX-only packets without this proof may
  recompute as limited; they are never silently upgraded or rewritten on read.
- Observation-only exact vocabulary covers the reviewed English and Portuguese
  misses. Cookiebot `Show details` additionally requires its canonical control
  selector and registered first-layer container selector. No site-specific rule
  or generic Show-details fallback is used. Action callers explicitly use the
  action classifier mode; these labels do not expand automatic clicking.
- A browser error document cannot inherit a prior successful HTTP status;
  nonstandard HTTP errors such as 498 remain access-limited.
- A consent-session access failure prevents complete absence even when the
  runtime lane succeeds. Conversely, a successful usable consent lane can bind
  its own document independently of runtime redirects only when its retained
  observation, pre-consent DOM, and geometry agree on URL and document token.
  No screenshot or raw label supplies missing structured facts.

### Work limits and rollout checks

No browser invocation, model call, retry, wait, screenshot stage, or timeout is
added. Existing recovery may select a different branch within its current
budgets. Newly unresolved or observation-only controls do not purchase extra
Accept/Reject tail time: absent an existing action-capable typed candidate, the
coordinator keeps the passive-barrier cutoff. An unstarted cancelled action is
coverage-limited rather than falsely `not_applicable`; returned independent
verified action evidence is preserved. Existing exact-target authorization,
one-action limits, semantic registration, ancestry, checksum verification, and
single publication remain unchanged.

Run `pnpm test:aro-capture` for the local regression gate. The fixture corpus is
synthetic and model-assisted, not independently reviewed ground truth. Retained
cohort replay is available through `pnpm v2:aro-capture-replay --cohort-root
artifacts/aro-prod-review-20260910`; it excludes ErgoVeritas and writes only local
artifacts. It does not reclassify historical raw labels. Stored-versus-recomputed
changes are diagnostic, not measured false-positive/false-negative improvements;
new-versus-old projector comparisons isolate code-induced conclusion changes.
Fresh capture fixtures separately verify the new upstream label behavior.

Resource estimate: zero additional paid diagnostic calls or capacity; bounded
local-context/classifier/visibility fields are estimated at roughly 16–24 KiB per
packet including geometry and twelve retained controls, or about 1.6–2.4 GB per
100,000 scans. At 30-day
retention, expected incremental AWS storage/transfer is below $1/month with no
capacity-tier change. No production latency claim is made from local projector
microbenchmarks. Deployment and a subsequent canonical calibration sample remain
separate actions. The owner subsequently authorized the local consent-proof
validation described below; no production scan records were created.

### Local verification outcome

The dedicated A/R/O gate passed 268 tests; the report-materializer consent and
geometry selection passed 24 tests, and nine selected browser integration
fixtures passed. Contracts/shared builds and scan-core, Lambda, and web
TypeScript checks passed. Eleven additional CMP action tests passed, including corrected assertions that
opaque receipts cannot confirm semantic registration. Other action regressions
also passed; environment-
gated replay cases are not represented as live production verification.

The local retained replay loaded 739 terminal source records, excluded 74
ErgoVeritas records, and assessed 662 completed scans; the three missing bundles
correspond to failed scans and are excluded from the completed-scan denominator.
Comparing the same retained inputs through HEAD and the working projector
isolates 130 field changes: 101 unresolved-inventory, 17 AX-proof, and 12 access
changes. The original three unexplained Outlook absence promotions were removed
by the browser-error-document guard. All deltas remain model-assisted diagnostic
review entries. Nine previous positive fields become unknown because retained
AX proof is inadequate; fresh capture must establish that proof. Historical
capture errors already encoded as typed classifications are not repaired from
raw labels during replay. These numbers are not post-release error rates.

Detailed local artifacts: `artifacts/aro-prod-review-20260910/aro-capture-replay.json`
and `aro-capture-before-after-replay.json`. Neither is published or persisted to
production.


### Follow-up coordinator hardening and local public validation

The owner explicitly authorized a local rescan of the three-day error cohort
and waived cooldown on September 10. The canonical registry/contact holds were
checked, the central ledger was exported, and the override was isolated to the
local selection artifact. No global cooldown policy was changed. Twenty-five
unique targets received a local consent-proof pass; 23 without security
challenges received a verification pass after the DOM-context correction, and
AdRoll received one final check after its informational-label correction: 49
attempts total. Toast and Wiley challenges were not retried. Attempts are
recorded through the canonical central contact ledger, with local ledger
candidates retained. No production scan, report, deployment or backfill occurred.
Local export/contact logging is estimated below $1 total; no paid model calls
were used. Captured screenshots were withheld and removed rather than exposed
without safety review; structured assessment remains independent under 2.1.

Fresh capture found two remaining upstream issues and added regressions:
DOM first-layer reads accepted a 200-pixel offscreen margin, and control labels
or navigation links could supply their own consent context. Main, rapid, direct
CMP and same-origin-frame inventory now require independent bounded context;
first-layer reads require viewport intersection. Informational “Learn more”
wording cannot establish Options solely from cookie context. Its genuinely
ambiguous first-layer geometry limits negative conclusions. Existing registered
Cookiebot “Show details” remains separately evidenced. These changes add bounded
local DOM computation, but no browser call, timer, retry or wait budget.
Production latency equivalence still requires post-deployment observation.

The dedicated regression gate includes actual coordinator tests for both Accept
and Reject: undispatched cancellation, unfinished invocation cutoff at the
passive barrier, preservation of returned verified evidence, and rejection of
late completion after publication. Fake Lambda/S3 clients exercise real
orchestration without cloud/browser calls. The broader existing handler suite
also passed during follow-up.

Local outcomes are diagnostic, not post-release FP/FN rates: ten of eleven
previously missed fields were observed; Toast's field remains unknown under a
security challenge. Of twelve suspected Options false-positive fields, six are
not observed after complete inspection, five remain unknown, and LG's Privacy
Center remains observed with fresh AX visibility/context proof but still needs
semantic adjudication. Eight plausible positive fields on DNS Made Easy,
Laguna Tools and iRobot survive with fresh proof; LG is the ninth, separately
ambiguous field. FunPay's localized Configure control, generic acknowledgments,
and remaining coverage limits are review candidates rather than guessed facts.
The machine-readable case comparison and detailed limitations are retained in
`artifacts/aro-prod-review-20260910/local-validation/comparison.json` and
`report.md`. Local network/geography and dynamic banners differ from AWS;
these runs cannot establish representative production precision/recall.

Final follow-up gate: `pnpm test:aro-capture` passed 281 tests (273
contract/core/projection/replay tests plus eight actual coordinator cases).
Six selected browser integration fixtures passed after the independent-context
change. No deployment was performed.

### Bounded semantic follow-up and population sample

The September 10 owner-authorized follow-up adds observation-only Russian
`Настроить` in verified consent context and treats exact `close modal` as a
dismissal. Generic `Okay` remains unknown. Geometry now requires independent
nearby consent text rather than borrowing the candidate's label or unrelated
navigation links. These changes use the same unreleased capture/registry v2
policy and preserve action authorization.

Optional typed `linkDestination` evidence is shared by DOM, frame, AX and
geometry classification. Options-like links to another document or with an
unverified destination remain unknown and limit unsupported negatives. Exact
same-document fragment links remain eligible. Existing DOM/AX reads supply the
metadata; the retained field contains only a bounded classification, not the
URL. Historical records without this field are not silently rewritten. Verified
independent controls remain positive through canonical materialization.

A passive LG probe bound its visible Privacy Center AX node to the DOM anchor
`http://www.lg.com/privacy`; no destination contents or click behavior were
inferred. The fresh final LG session had no visible first-layer controls, so
the exact navigation pattern is verified by retained evidence and regression
fixtures rather than claiming that session reproduced it. Focused local runs
also verified FunPay Options, NSone dismissal handling and DuckDuckGo context
isolation; VirtualPro's acknowledgment remains limited.

A canonical 30-domain sample from the three-day retained population, excluding
ErgoVeritas and independent of prior error labels, yielded 15 complete and 15
limited assessments. Eleven were access/no-go limited; four retained unresolved
decisions. The sample ran before the final destination guard; the five focused
runs included it. The final missing-destination hardening was fixture-tested.
These are coverage results, not independently adjudicated FP/FN rates.

The final gate passed 289 tests, plus the focused missing-AX-URL regression;
core, web and Lambda typechecks passed. Thirty sample captures, five focused
captures and two passive probes are retained in the combined contact summary
for canonical contact logging. No production scan/report or deployment was
created. The additions introduce no browser calls, timers or model calls;
bounded CPU and metadata are estimated below $1/month at 100,000 scans/month
and 30-day retention. Local ledger operations are estimated below $1 total.
Detailed outcomes, staging limitations and remaining candidates are recorded in
`artifacts/aro-prod-review-20260910/narrow-review/report.md`.
