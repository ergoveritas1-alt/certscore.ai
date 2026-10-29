# CertScore.ai Accept confirmation and diagnostic release candidate

## Problem and behavior

A completed Accept click does not establish that the site's consent management
platform (CMP) registered the choice. The existing serial Accept reader could
spend the available terminal interval waiting for an absent TCF callback before
checking an independently verifiable cookie or registered storage receipt.

This candidate runs the already-required alternatives independently and retains
the first qualifying witness. It does not weaken decision meaning, receipt
identity, configuration, complete-purpose, source, target, action-time or
absolute-deadline checks. A zero-duration terminal pass performs one read inside
the existing terminal wrapper. That wrapper rejects late, aborted or wrong-target
results and adds no tail wait. A later terminal witness remains separate from
initial registration and does not backdate acceptance or promote findings.

Accept packets gain optional confirmation diagnostics. New Accept and Reject
captures use `consent_confirmation_diagnostics.v2`; v1 remains readable under its
original vocabulary. Initial and terminal reason lists share the existing cap of
12 distinct reasons and include explicit truncation. Existing reads distinguish
missing/malformed/changed OneTrust configuration, incomplete or unconfigured
groups, receipt identity/readback problems, unsupported syntax, stale decisions
and aborts. These diagnostics are not consent evidence and cannot change scoring.
They are not an exhaustive explanation for every CMP/action adapter.

The October 27 follow-up adds diagnostic callbacks to the existing API read.
HubSpot/Osano unsupported category data, Osano readback mismatch and non-TCF
scope limitations stay distinct from an unavailable API. Accept's API branch
also explains opposite/mixed decisions, absent complete decisions, missing
action-bound saved events and unchanged state. Direct cookie/storage branches
report missing, unchanged or nonmatching receipts. No extra getter, listener,
browser read, purpose inference or confirmation gate is introduced. The API
snapshot returned to existing callers remains unchanged; diagnostic metadata is
removed before returning it.

Named HubSpot and Osano loopback fixtures exercise valid, opposite, mixed,
partial, unchanged, unavailable, in-window terminal and too-late outcomes.
Getter-count assertions verify that enabling diagnostics adds no API reads.
OneTrust fixtures retain the configuration/group and silent-TCF cases. These
local tests establish behavior, not a production confirmation improvement.

## Relevance to CMP coverage

The retained month has 363 unconfirmed OneTrust actions across 234 sites; this is
an export-based descriptive cohort, not a measured repair rate. Among retained
action packets, 32 OneTrust Reject cases share a broad configuration/group reason
and retain changed same-identity cookies. Their hashes cannot recover the cookie
meaning or the exact failing configuration gate. All 122 sampled unconfirmed
Accept packets lack granular diagnostics. The timing repair is demonstrated by
local fixtures; the diagnostics make subsequent ordinary failures actionable.
Neither establishes that all retained OneTrust cases will become confirmed.

The previously labelled "Unidentified CMP" row means **consent surface observed;
CMP identity unverified**: all 510 completed actions had a reported surface,
488 were initially unconfirmed across 321 exact hostnames, 21 confirmed and one
aborted. None establishes absence of a CMP. Initial registration, terminal
confirmation, named identity and capture coverage remain separate measures.

The retained-only follow-up found specific canonical marker leads for 25 of
those unconfirmed actions across 14 sites. CookieScript accounts for 18 actions
across ten sites; Axeptio, Ensighten Privacy, OneTrust and Google Funding Choices
cover the other four sites. These are recognition-review candidates, not
retroactively verified identities or successful actions. Generic data-testid
matches, generic consent-banner/cookieConsent names and shared euconsent-v2
cookies were excluded from that actionable count. Recognition work needs
upstream session/document/control binding; never patch report identity from
these diagnostic leads.

The current report's cmpDetected and cmpFrameworkSignalObserved flags are both
derived from a selected CMP name. A false value is not an independent complete
framework inspection. Future audit grouping should use separately retained
identity, protocol, surface and inspection facts; "no CMP signals observed"
must never be relabelled "verified no CMP".

## Release scope and order

This isolated candidate starts from the observed web revision and fetched main
`e171f8ed94729c1b5bfbba10e251eeca3bc1c776`. It excludes the original worktree's
publication, scoring, policy, dashboard, vendor-parser and experimental Magnite
changes. It includes the two new confirmation test files in both canonical fast
and full release gates.

Before any separately authorized rollout, refresh the live revision and check
forward ancestry. Deploy compatible consumers of the shared packet schemas
before scanner producers emit v2 diagnostics. Use only the canonical AWS release
plan and consumer barrier to determine and promote affected web/validation
consumers, then the scanner image in the approved three regions. No dependency,
Chromium/runtime-base, worker size, capture-window, action-scope, feature-flag,
model-call, retention-period or database-schema change is intended. Do not push
to an auto-deploy branch as part of local preparation.

The validation worker parses canonical bundles in both policy-review input and
full-site scheduling. The current path classifier does not select validation
for a contracts-only change. For this candidate, the eventual canonical coupled
release must explicitly use its existing `--force-validation` option; a skipped
validation consumer is not sufficient. Its typecheck and scan-pipeline tests are
additional required local checks. This does not require a runtime-base rebuild.

Existing cost estimates remain below $0.50/month for Accept diagnostics/read
scheduling plus below $0.10/month for granular diagnostic metadata at 100,000
scans. This preparation introduces no additional recurring cost or paid cloud
usage. Deployment and image publication remain unauthorized. The later live
verification authorization and results are recorded below.

Release preparation was paused before its full preflight finished. The focused
CMP follow-up does not convert that interrupted run into a release approval;
the eventual exact candidate must complete its required gate before promotion.

The subsequent owner-authorized CMP library follow-up adds CookieScript runtime
recognition, precise shared marker matching and passive Complianz/CookieHub
identities. It is documented in `cmp-library-coverage-2026-10-27.md`, including
its separate cost estimate, retained replay and remaining `ch2-*` limitation.
That follow-up changes canonical recognition only and adds no action recipe or
decision decoder. Its three new test files enter both fast and full gates.

The focused capture/OneTrust follow-up is documented in
`cmp-attribution-onetrust-2026-10-27.md`. It repairs composed-tree/global marker
capture and shares the changed OneTrust receipt gate with its candidate read,
while retaining the independent readback. It adds no action recipe or scoring
policy. Its two regression files and existing Reject terminal coverage now
enter the canonical gates; a complete release preflight is still required.

## Validation and ordinary-production acceptance

Run the isolated candidate's focused confirmation/terminal/semantic safeguards,
legacy contract compatibility, canonical retained-packet replay, relevant package
builds/types and the change-aware preflight against the recorded base. Record
exact source hashes, commit, logs and any unresolved gate in the local run
artifacts. A passing targeted suite cannot override a failing required gate.

After a separately authorized release, use ordinarily occurring Mac mini scans:
verify deployed revision, original packet/source binding, readable v1/v2 packets,
separate initial/terminal reasons and bounded metadata; rank OneTrust granular
reasons by distinct sites and matched report generations. Verify timing benefit
only when a valid original terminal witness survives within its existing window.
Do not use a changed cookie hash alone, lower unknown counts, deployment itself,
or a local replay as proof of successful registration or a production fix.
No new public verification scan is required by this plan.

If new diagnostics cause consumer incompatibility, preserve retained artifacts
and hold scanner promotion. Any rollback needs a separately authorized canonical
AWS plan; do not rewrite historical reports or remove diagnostic evidence.

## October 27 live verification and remaining OneTrust work

The owner subsequently authorized continued local OneTrust verification and
waived domain cooldown for this work. Existing contact holds, no-go exclusions,
exact-target/action checks, capture limits and the deployment hold remain.
The initial four checks used the approved $0.40 allowance; three subsequent
two-visit batches used a further conservative $0.60 allowance. Browser checks
used the local candidate, with no scanner Lambda invocation, deployment or paid
model call. Calibration contact persistence used the existing bounded ledger
workflow. This does not verify a deployed revision or a particular AWS region.

The candidate now also binds the intermediate OneTrust receipt to the original
cookie identity before independent readback, rejects named-control sweeps that
finish after their deadline, and records covered-control diagnostics. A sole
runtime-identified OneTrust recipe checks its registered control before broad
geometry work. Live control ancestry, label, uniqueness, hit target, enabled
state and authorization remain required. This ordering/guard follow-up is
estimated below $0.01/month at 100,000 scans, with unchanged worker and time caps.

All ten authorized visits were independently checked against their retained
packets and canonical execution projections. Eni Accept confirmed a granted
decision in 15,492 ms; Wickes Reject confirmed a denied decision in 15,165 ms.
Both retained all five configured groups, exact receipt identity, fresh state,
independent readback and an instrumented post-click write. Wickes exercised the
new named-control-first path with zero broad geometry reads; Eni exercised the
fallback. These establish working live paths, not a representative success rate
or a paired latency improvement. The eight other visits remain limited or
unconfirmed: six did not complete a click and two IKEA Reject visits completed
a click but did not complete the observation/confirmation path.

The retained IKEA diagnostic lists five configured groups but only C0001 and
C0002 in the post-click receipt. This does not establish that the other groups
were denied, inapplicable or permanently unavailable. The current completeness
check correctly leaves registration unknown until stronger evidence is obtained.

The remaining approach is ordered by expected shared benefit:

1. Separate loader detection, visible surface, actionable control, completed
   click, completed observation and semantic confirmation. Use the existing
   bounded discovery signals and named-control path to reduce repeated broad
   geometry work. Measure navigation, discovery, binding, baseline reads and
   after-action time separately. Preserve the absolute deadline and complete
   post-action evidence requirements; a late click must not become a successful
   path merely because the resolver found a button.
2. Investigate the IKEA group discrepancy using the already loaded, document-
   bound CMP configuration and bounded diagnostics. Determine whether a verified
   current configuration exposes an explicitly applicable group set, or whether
   the receipt is genuinely incomplete. Do not infer applicability from cookie
   omission, the active-groups list, default inactive status or locale alone.
   A supported alternative completeness rule needs versioned typed proof and
   independent readback; if its applicability cannot be established, preserve
   unknown. Also distinguish a positively observed absent baseline receipt from
   an unreadable baseline before considering any first-receipt support.
3. Evaluate passive OneTrust lifecycle events as timing hints within the same
   capture window. OneTrustGroupsUpdated also fires on initialization, so event
   occurrence alone cannot establish a user choice. A post-click event would
   trigger a bounded verification read, still requiring complete, fresh,
   same-document semantic proof. Do not invoke consent setters, open preference
   panels or make extra remote requests to manufacture a successful decision.
4. Validate each concrete repair on a small fixed matrix: existing Eni/Wickes
   positive controls, IKEA's incomplete-group case, a late-rendered control and
   a no-actionable-control case. Cover Accept and Reject, duplicate/covered
   controls, stale receipts, configuration drift and cancellation. Repeat in
   independent clean sessions only to test a stated hypothesis. Report control
   resolution and confirmation-after-click separately, with unknowns and
   incomplete captures visible. A broader reliability percentage requires a
   representative cohort, not these selected diagnostic visits.

Start with readiness/control timing, which accounts for six of the eight
unresolved visits in this selected session, then address group applicability.
Any new event capture or proof version above is proposed, not implemented by
this documentation update. Estimate its incremental cost before implementation;
preserve the existing cost approval threshold. Cooldown is waived for the
authorized OneTrust work and is not a reason to request another approval.

The Web CMP documentation describes GetDomainData as configuration data and
distinguishes initialization/group-update events from consent changes:
https://developer.onetrust.com/onetrust/docs/javascript-api and
https://developer.onetrust.com/onetrust/docs/javascript-events-guide.
These sources support the diagnostic approach; they do not establish which
groups applied to the retained IKEA session.

Current evidence, source hashes and check receipts are retained under
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T231859Z-manual-onetrust-reference-verification`.
The 393-test consent gate and replay of 1,466 retained packets pass. After the
original full preflight was interrupted, the remaining commands ran against
identical product sources. All 27 planned commands were attempted: 25 passed
and two failed. The candidate is not release-ready:

- The late-consent suite passed 32/33 tests; the staggered-control fixture failed
  to retain Settings. The unchanged fixture passed standalone. Its timing
  variation remains unexplained, and the standalone pass does not close the
  failed suite.
- The post-refusal release command passed 120/121 scan-core tests; the bounded
  selector-absent diagnostic test also received `binding_budget_exhausted`, which
  its exact expected list excludes. The new late-sweep guard explicitly emits
  that diagnostic. Review the test against the deadline contract while preserving
  no-click and bounded-evidence assertions. Later subcommands in that failed
  release command did not run.

Resolve both gates before release preparation is considered complete. The
run's preflight-completion.json retains every command result; the previously
passed consent gate was reused only at verified identical product source hashes.
The publication database check passed separately against disposable local
PostgreSQL. This documentation update changes no product or test source.

## Subsequent local preflight repair

The bounded selector-absent regression now permits an optional final
`binding_budget_exhausted` snapshot after a completed empty sweep. It continues
to require the ordered absence evidence, zero actionable candidates, no completed
click, no confirmed refusal and an unknown decision. The previously asserted
single diagnosis excluded a legitimate independently retained deadline limit.

The staged-control integration suite passed all 33 tests. Three further batches
of the staged case and its two neighboring late-loading fixtures passed all nine
tests; each staged case retained A/R/O at its 16-second checkpoint. The original
miss did not reproduce, so no runtime capture repair or cause is claimed. Failure
assertions now include the retained observation and module timings to preserve
diagnostic evidence if it recurs. The fixture's deadlines and required controls
are unchanged.

A subsequent Reject release run exposed an origin-storage diagnostic lifetime
validation failure. One hundred repetitions of the original query-redaction
fixture passed; the exact offending clock samples were not retained by the
original failure. Its cause is therefore unproven. A controlled backward-clock
case nevertheless demonstrates a finalization boundary race: independently
sampling the diagnostic freeze and packet completion can produce incompatible
times. Both action finalizers now pass one sampled completion timestamp when
freezing a still-open collector. Already-frozen observation-end diagnostics keep
their original boundary and receipts. No timestamps are clamped or backdated,
and receipts outside their actual envelope still fail validation.

The controlled regression fails with the prior collector and passes with the
repair. It also checks unchanged receipt times, idempotent freeze, no added clock
read and rejection of an out-of-envelope receipt. All six collector tests pass,
including real CDP events, and the file is included in the canonical consent
release gate. The Reject query-redaction fixture independently checks the
diagnostic lifetime bounds. This adds no browser work, wait, API call, retained
field, scoring change or recurring infrastructure cost.

Retained replay again preserves all 1,466 packet registration outcomes, 751
legacy diagnostic records and 450 decoder parity cases. Fresh release-check
results and source snapshots are recorded in
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T234358Z-manual-onetrust-preflight-repair`.
The run's `final-checks.json` records completion of affected checks. Neither this
repair nor passing local checks establishes broader OneTrust confirmation rates,
IKEA group applicability or a deployed production fix. No deployment or public
visit is part of this repair pass.

Affected checks completed successfully: the full Reject release command,
399 consent tests with zero skips, release regression review, scan-core and
workspace types, workspace/package builds and canonical projection parity.
The staged-control suite separately passed 33/33. Unaffected passing checks from
the prior full plan are retained with their original receipts; this is composed
coverage, not a claim that a fresh single `preflight:full` command completed.
The original failures remain in immutable prior-run evidence. The clock-boundary
hardening is demonstrated by controlled tests; the cause of the original
intermittent lifetime failure is still unproven.

## IKEA applicability and unavailable-configuration follow-up

Two valid bounded IKEA checks retained five declared categories (C0001–C0005)
and receipts containing C0001/C0002 only. C0003/C0004/C0005 had no retained
first-party cookie, host or general-vendor inventory and AlwaysShowCategory=false.
This suggests empty-category filtering, but does not itself prove that those
categories were excluded from the visitor's choice. Popup flags are not a
category-applicability contract. A reviewed public OneTrust SDK contains additional
filtering conditions, including subgroups, category types and vendor services;
that research copy is not bound to IKEA's served SDK revision and cannot justify
promoting its decisions.

Accept completed its click and observation path in 4,712 ms; Reject completed in
9,988 ms. Both project `succeeded` with consent unconfirmed and
`group_universe_incomplete`. These are two selected local checks, not a measured
production reliability or paired latency improvement. The capture limits remain
unchanged. No category-exclusion heuristic was added.

Local regressions revealed a separate general confirmation gap: when the
pre-click GetDomainData API was absent, the current action path could fall through
to legacy decoding of just the optional categories present in a receipt. New
OneTrust baselines now retain configuration_missing as invalid configuration,
so that route cannot establish a complete decision. The authorized click and
bounded observation may still complete, and an independently qualifying TCF
witness remains available. Historical cookie decoders and packet projections
are unchanged. Configuration appearing only after a click does not establish
the original pre-click universe.

Four Accept/Reject missing/late-API regressions fail against the prior code and
pass with the repair. Successful legacy test fixtures now declare their complete
category set and valid before/after group receipts; their confirmation assertions
remain intact. Unknown and malformed fixture cases remain unconfirmed. The change
adds no reads, waits, metadata, model calls or recurring infrastructure cost.

Three earlier diagnostic contacts from this follow-up are excluded from semantic
verification because the diagnostic harness passed a function expression without
invoking it and could transform it twice. Their original artifacts/contact history
remain preserved with an instrumentation-validity review. The corrected harness
was checked offline for one SDK invocation per existing read, unchanged id/status
inputs and idempotent transformation before the two valid live checks. The total
conservative allowance for all five contacts is $0.50; the browser checks were
local and central ledger operations used the approved ECS one-off workflow.

The six retained no-click visits showed loading/unavailable geometry and no
retained actionable control or label. They cannot establish that a CMP/control
was absent or authorize broader clicking. The next applicability work requires
positive, served-revision-bound proof of the effective category set. Preserve
unknown until that is available.

Evidence, verification limits and current check results are saved under
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T040623Z-manual-ikea-verified-configuration`.
No deployment or historical report rewrite is authorized or performed.

The adjacent generic cookie/write verifier is guarded as well: exact and
tenant-suffixed OptanonConsent receipts cannot establish completeness without
the dedicated pre-click configuration proof. Four generic-write cases reproduce
the prior gap. A separate control verifies that an unsupported OneTrust write
does not cancel an independent complete registered decision. These guards add
no configuration, cookie or storage reads. Historical decoding remains unchanged.

A final passive capture retained IKEA's actually served SDK at
`https://cdn.cookielaw.org/scripttemplates/202508.2.0/otBannerSdk.js`, SHA-256
`69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9`.
Its GetDomainData implementation returns pubDomainData. Initialization copies
that public data before domainDataMapper constructs the filtered category tree.
This directly establishes that the API's declared groups and effective groups
are different concepts in that served revision. Empty-category filtering is
therefore a supported explanation for the mismatch, not a basis to infer that
IKEA failed to save a choice. The same-visit configuration diagnostic could not
run within the remaining 14-second passive module budget; no tail wait or retry
was added. The source-filter conditions have not yet been bound to complete
same-session inputs, so no effective-universe adapter is activated.

The passive follow-up had zero actions, one retained existing SDK response body,
zero configuration getter calls and no additional body request. Its conservative
allowance was $0.10, bringing this investigation to $0.60 across six recorded
contacts (three diagnostic contacts excluded from semantic verification, two
valid action checks and one passive source check). It is retained under
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T042822Z-manual-ikea-passive-sdk-binding`.

Final validation passes: 408 consent tests with zero skips, the full Reject
release command, scan-core/workspace types and build, release regression review
and canonical projection parity. Eight new negative cases reproduce the prior
configuration/subset bypass; an independent complete-decision control remains
positive. The synthetic runtime-adapter fixture continues to resolve and click
its control, but now correctly remains unconfirmed because its changed-cookie
adapter did not capture OneTrust's category universe. Historical replay still
preserves 1,466 registration outcomes and 450 decoder parity cases.

## Versioned IKEA applicability follow-up

The owner subsequently authorized a source-pinned IKEA applicability adapter.
See `onetrust-ikea-applicability-policy-2026-10-27.md` for its exact SDK hash,
route, flat non-IAB input constraints, unchanged budgets and historical boundary.
The corrected live Accept and Reject checks both confirmed a complete effective
C0001/C0002 receipt against five retained declarations. This resolves the tested
IKEA applicability gap; it does not establish general OneTrust readiness or
resolve the separately retained loading/control gaps. The initial local reader
serialization failures remain in contact history. Nothing has been deployed.

## October 28 fixed comparison and HubSpot follow-up

The owner approved a counterbalanced 40-site baseline/candidate comparison,
then explicitly allowed further useful rescans and waived cooldown. The frozen
comparison used local browser execution, not production-region equivalents:
154 contacted action slots and six skips after access restrictions. All 154
packet hashes and recorded canonical execution projections were verified.
Baseline revision `e171f8ed94729c1b5bfbba10e251eeca3bc1c776` is the pre-repair
comparison source, not a claim about the currently deployed revision.

The frozen candidate confirmed 0/43 completed clicks versus baseline 0/41.
Both arms completed 40 observation paths. Five baseline-complete paths were
incomplete/not attempted in the candidate, offset by five gains. These paired
differences remain investigation leads; live variability and concurrent local
work prevent a precise latency or code-causality claim. The predeclared
20-percentage-point confirmation improvement target was not met. Do not promote
this comparison to a release pass or a population-wide confirmation estimate.

All 26 candidate OneTrust clicks across 16 sites reported
`group_universe_incomplete`. The next shared repair needs positively verified
effective-category semantics for reviewed SDK versions and complete same-session
configuration. An omitted receipt group alone cannot establish inapplicability.
Do not copy IKEA's subset onto other sites or add blanket waiting time.

The historical HubSpot stratum had seven format errors among eight clicks, but
current attribution differs: three errors had named HubSpot recipes, two were
CookieYes at Feefo, and two lacked a named resolver CMP. Preserve historical
strata separately from current observed provider identity. No Osano controls
were clicked in 21 contacted slots, so this sample cannot estimate Osano
confirmation reliability.

The reviewed HubSpot SDK returns `necessary: true` alongside three optional
category booleans. The parser now accepts that mandatory category while requiring
all optional booleans, a fresh action-bound event, and the existing provenance
checks. Older three-key responses remain supported; malformed mandatory state,
unknown fields, partial, mixed, opposite and stale decisions remain unconfirmed.
This adds no SDK calls, capture time, persisted fields or recurring cost.

Live follow-up cleared the HubSpot format error at Zype and Shopper Approved,
but did not produce new consent confirmations. Both diagnostic visits had an
already-granted pre-click state, no subsequent listener event, and a newly
observed `__hs_notify_banner_dismiss` cookie after the click. They support
notification acknowledgment in those visits, not newly registered consent.
The existing unchanged-event fixture preserves this boundary. Feefo's current
CookieYes decoder limitation is separate and remains unresolved.

Report notification acknowledgments, actual consent decisions, unresolved
applicability, failed clicks and incomplete captures separately. Such a new
production classification still needs typed source-bound evidence; this review
does not rewrite historical metrics or loosen confirmation gates. Representative
verification must also match intended region and current provider identity.

Final local validation: 492 consent tests, scanner typecheck and release-test
selection passed; retained replay preserved 1,466 registration outcomes and 450
decoder parity cases. An initial five-test fixture failure was corrected because
loopback lab packets must not become production-projectable actions. Three
follow-up visits used stale compiled output and are excluded from repair efficacy;
their contacts and original results remain retained. A forced isolated build and
five direct compiled-parser cases verified the actual runtime before further
visits. The final live diagnostics wrapped existing reads, with no additional
SDK calls or page reads.

Total: 162 local action visits (154 comparison, three invalid repair-build,
three verified-build follow-ups, two read-sequence diagnostics), zero production
scan invocations, conservative one-time allowance $16.20, recurring increment
$0. Central contacts and repository ledger metadata are recorded separately
from uncommitted product changes. No deployment or historical rewrite occurred.
The broader release remains on hold.

Evidence and complete summary:
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T164242Z-manual-cmp-fixed-benchmark`.


## October 28 effective categories and notification acknowledgments

The authorized implementation extends effective-category interpretation to four
exact source-reviewed OneTrust SDK revisions (five approved host/URL entries).
The same-session source hash, configuration, exact document and fresh complete
receipt remain mandatory. New v2 applicability/v4 group proof preserves the old
IKEA v1 and legacy reader contracts. See the applicability policy for exact pins,
unsupported configurations and the older revision's inventory-only predicate.

Latest targeted results: Doctoralia Accept and Reject, SIX Group Accept, and
AkzoNobel Reject all confirmed. Each retained five declared groups, four effective
groups and a fresh complete receipt. The initial SIX/AkzoNobel visits remained
unconfirmed because their served revisions were not yet reviewed; those two
attempts remain in the evidence and contact history. Across all eight visits in
this run, four were confirmed consent decisions, two notification acknowledgments,
and two earlier completed unconfirmed actions. Do not replace that all-attempts
denominator with the four latest successful cases.

Zype and Shopper Approved now retain positive, source-bound notification
acknowledgments separately. Neither sets consentConfirmed or gains a fresh
consent decision. Historical missing evidence remains unknown; reports and the
production dashboard were not rewritten by this work. This is a HubSpot-specific
positive receipt recipe, not a global dismissal heuristic.

Validation: 506 consent regression tests, 55 action-contract tests, 15 release-test
selection tests, scanner typecheck, 256 SDK predicate parity cases and all eight
live packet hashes/canonical projections passed. Historical replay preserved
1,466 registration outcomes and 450 decoder cases. A final subgroup guard was
added after the live visits: 53 focused tests (including the two new malformed/
nested subgroup cases), final scanner typecheck and four retained configuration
replays passed. Those replays combine served JSON with the separately retained
same-session SDK-derived IAB flag and synthetic reader-test cookies; they are
not additional live observations. No extra public visit was needed for that
strictly narrower guard.

These local browser checks demonstrate the targeted repair, not production-region
or population reliability. Unsupported SDKs, IAB/hierarchies, incomplete source
binding and remaining control/loading failures remain unresolved. The earlier
40-site benchmark has not been rerun and its release threshold is not marked
passed. No deployment, product commit, push, flag change or historical rewrite
occurred. Only required calibration contact metadata was committed; both batches
were persisted centrally with unique idempotent keys.

Estimated recurring increment for this extension is below $0.75/month at 100,000
scans under existing capture/retention limits, with no additional SDK calls,
requests, waits or action lanes. Eight local visits used a conservative $0.80
one-time allowance. Compatible typed consumers must precede any later producer
release through the canonical AWS barrier.

Evidence: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T175302Z-manual-effective-categories-notifications`.


## October 28 broader fixed-cohort rerun

The owner authorized a fresh counterbalanced comparison after the effective-category
and notification changes, waived cooldown, and prohibited deployment. Both arms
used the same 40 selected sites, identity, local egress and capture budgets. The
reference was the previous frozen candidate, not the deployed production revision.
RNLI and Persona remained excluded by the central/repository ledger: 152 visits
across 38 sites, eight planned skips, no replacements or no-go retries.

OneTrust improved from 0/29 to 6/26 confirmed clicks (23.1%). The same-provider,
both-clicked subset also improved from 0/26 to 6/26. Verified gains were Doctoralia
Accept/Reject, Paymentus Accept/Reject, SIX Group Accept and AkzoNobel Reject.
Overall confirmations rose from 0/46 to 6/42 (14.3%), below the predeclared +20 pp
target. Three HubSpot clicks were separately retained as notification acknowledgments
at Zype, Shopper Approved and KHN; none was counted as new consent. Other observed
providers had no confirmation gains. Osano's historical selection stratum produced
no completed clicks, so no Osano confirmation rate is established.

Completed observations fell from 46 to 40: AkzoNobel Accept, Findaya Accept/Reject,
Panorama Firm Accept, Telerik Accept and University of Silesia Reject were lost
in the updated arm. Retained reasons concern transparent control readiness,
resolver exhaustion or the result budget. Live variation prevents causal attribution
to this patch, but the no-observation-loss condition is not met. On the 40 pairs
that completed observation in both arms, median observer time increased 100.5 ms;
the nearest-rank p95 paired increase was 10,639 ms. This is not a clean release pass.

All 152 packet hashes and canonical projections verified; 4,370 source/runtime
hash comparisons confirmed unchanged frozen builds. The source exactly matched the
previously tested repair; both packages were freshly compiled before the visits.
Eighteen of 20 remaining OneTrust unconfirmed clicks served ten unreviewed SDK
revisions; two involved unsupported nested categories. Review those retained sources
in a batch and investigate the six coverage losses before any release decision.
This selected failure cohort does not replace ordinary production or representative
region-stratified rates. No product fix, deployment, flag change or historical
rewrite occurred during the benchmark. Contact metadata is persisted centrally and
recorded separately in the repository ledger. Conservative one-time contact allowance
used: $15.20 of $16; recurring increment $0; no production scan or model API calls.

Evidence: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T182305Z-manual-cmp-benchmark-rerun`.

## October 28 source expansion and remaining proof gaps

Ten additional retained SDK revisions now have exact source pins and reviewed
category predicates, bringing coverage to 15 URLs across 14 revisions. Predicate
families preserve version-specific inventory semantics and reject unobserved
private-flag dependencies. Historical interpretation, required categories and
fresh same-session decision proof remain unchanged; see the applicability policy.

Ten targeted Accept visits confirmed seven decisions at Adecco, Ferrero, dbt,
Vonage Business, KTM, Renishaw and Flixcar. All ten completed observation.
AACSB, Findaya and Sympatico remained unconfirmed; two further existing-reader
diagnostics at AACSB/Sympatico also remained unconfirmed. Keep all 12 attempts
and their seven confirmations visible. This selected verification is not a new
broader benchmark rate or a production reliability estimate.

The remaining gaps require specific evidence: AACSB falls back before richer
inputs despite verified SDK bytes; Sympatico has a hidden required category that
the current preservation guard rejects; Findaya has no effective optional choice
in the retained configuration. Do not relax those guards from cookie contents
alone. The prior six control/timing observation losses remain open. A later
completed Findaya observation does not establish their repair. Browser network
receipt and provider-event evidence is a proposed diagnostic extension, not an
implemented alternate confirmation path.

Passed: 521 consent tests, 81 focused tests including final source predicates
(overlapping suites), 55 action-contract tests, 15 release-selection tests,
scanner typecheck, 3,580 full-source predicate comparisons plus four unsupported
flag cases, 1,466 unchanged historical registrations, 450 decoder parity cases
and all 12 packet/projection/source checks. The isolated runtime matched the
tested product source throughout the visits.

Estimated recurring increment below $0.25/month at 100,000 scans; conservative
one-time allowance $1.20. No production scan or model API calls. Required contact
metadata was committed separately (0c3c8d67c, 9ae5845a4); product changes remain
uncommitted. No deployment, flag change, push or historical rewrite. Release
remains on hold pending broader coverage and observation-loss resolution.

Evidence: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T185456Z-manual-onetrust-source-coverage`.

## October 28 stage diagnostics and shared binding repairs

All four authorized workstreams are implemented locally: precise v3 rejection
reasons; versioned active category scope and identical SDK-element binding;
bounded diagnostic-only provider events/network receipts; and separate
provider/action/cohort stage metrics. The detailed boundaries and cost estimate
are in `cmp-verification-stages-policy-2026-10-28.md`.

Final targeted live results: AACSB Accept, Sympatico Accept and Adecco Accept
confirmed; Zype retained a notification acknowledgment; Findaya completed its
observation but had no effective optional category. AACSB Reject exhausted the
result budget before action. Sympatico Reject exhausted discovery and reported
Google Funding Choices coverage in that session, without a verified action
provider. Neither Reject check establishes a OneTrust decision failure or a
successful refusal. Seven final visits produced five completed observations,
three decisions and one notification acknowledgment. Including the two earlier
diagnostic visits, all nine visits and four decisions remain in the record.

The 554-test consent gate passed. Final focused checks, scanner typecheck, action
contracts, release-test selection, write-preservation and stage-report tests also
passed. Historical replay preserved 1,466 registrations and 450 decoder results.
All nine live packet projections, verified configuration fingerprints and 811
frozen runtime hashes checked. An intermediate optional-field TypeScript narrowing
error was corrected before the final live build. Later offline-only stage labels
and classification were separately tested; they do not change browser decisions.

The report keeps reference/candidate benchmark arms and targeted cohorts separate:
169 planned slots, 161 contacted visits and eight uncontacted slots in 30 groups.
It preserves unknowns, notification outcomes and control/capture failure reasons.
This is not a new representative benchmark or production verification. The earlier
six observation losses and remaining control-resolution gaps remain open.

Estimated recurring increment below $0.50/month at 100,000 scans; conservative
one-time allowance $0.90. Required contact metadata commits are e699067be and
91b72b6ab. Product changes remain uncommitted. No deployment, push, flag change,
production scan, model API call, daily audit state change or historical rewrite.
The broader release remains on hold.

Evidence and table: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T191403Z-manual-cmp-stages-and-binding/report/stage-report.html`.
