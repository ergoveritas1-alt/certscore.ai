# CertScore.ai opt-out source presence and TrustArc state reading

Local implementation following the owner's “go” on November 5, 2026.

## Implemented

New conditional decisions use `conditional_opt_out_dispatch.v3`. A visible,
canonically classified, interactive first-layer opt-out control in the verified
consent source counts as observed before the separate execution-route checks.
The observation must retain a document identity; any native binding must agree
with that original document and loader. Hidden, explicitly unverified,
non-interactive, mislabeled or conflicting controls do not count. A positive
v3 fact retains its original observation ID and source hash. Missing/unverified
sources and held targets do not acquire presence facts.

The existing 32-observation/128-control traversal remains bounded. Exact-target,
local-surface, reviewed recipe/locator, worker revalidation, held-target and
remaining-time gates are unchanged. Presence on a redirected document grants no
navigation or click authority. Accept and Reject are unchanged.

The verified manifest → artifact verification → persisted choice summary → daily
audit path accepts both versions. The daily audit shows v3 source presence
separately from supported action routes. Historical v2 values appear under
“Legacy opt-out control at an eligible action target”; they are not relabeled as
complete source-presence observations. Timing provenance uses the actual decision
version. No historical source or report is rewritten.

## TrustArc confirmation work

Added `trustarc-consent-read.ts`, a local, unregistered state-reader building
block. It makes at most one same-document, current-host `getGDPRConsentDecision`
call, within the existing 50 ms decision-read ceiling. It adds no listener,
retry, polling, panel opening, choice mutation or vendor-domain query. Future
integration must consume an existing decision-read slot, not add another slot.
The caller's absolute capture cancellation is still necessary for a hung SDK;
a synchronous call cannot be preempted inside the page, and late results are
discarded.

The decoder retains only asserted/implied source and at most 16 unique bounded
category indices. It rejects inherited/accessor fields, malformed values,
duplicates, mixed no-preference sentinels and scalar highest-category responses.
It does not infer sale/sharing status, optional-category purpose, registration,
GPC honoring or downstream collection behavior.

TrustArc documents a granular category-list API separately from a highest-category
API and distinguishes asserted from implied state. Category numbering can vary
with configuration. These facts support retaining category state, but not a
universal sale/sharing confirmation adapter. Sources: [TrustArc API guide](https://trustarchelp.zendesk.com/hc/en-us/articles/1500002659141-CCM-Advanced-API-Integration)
and [TrustArc technical specifications](https://trustarchelp.zendesk.com/hc/en-us/articles/53492086194963-Cookie-Consent-Manager-Technical-Specifications-Guide).

The reader is deliberately not connected to production lanes or the recipe
registry. No TrustArc action recipe is enabled. The retained IBM and Red Hat
buttons still need exact reusable action binding, documented property-specific
scope, an authorized route, same-loader before/after/terminal state and successful
bounded action evidence. Battlelog's shared selector remains a preferences
entrance candidate. Neither provider recognition nor the new reader resolves
those requirements. A same-URL reload also requires the worker's loader checks;
the reader's URL check alone is not sufficient provenance.

## Verification

`outputs/opt-out-presence-trustarc-2026-11-05/retained-replay.json` rechecks all
12 original artifact hashes. All three TrustArc originals now produce observed
presence and unsupported routes. Five retained OneTrust bundles keep their
previous route eligibility. Historical artifacts remain byte-identical; no
submission, state transition or successful TrustArc action is invented.

198 coordinator, local browser, contract, audit and TrustArc reader tests pass.
The verified handoff test additionally covers current v3 dispatch and skipped
redirected-presence records, historical v2, wrong-scan and missing-lane rejection.
All three application typechecks pass. The first sandboxed coordinator run could
not create localhost listeners; the same suite passed with local browser/listener
permission. Two bounded local read-only public diagnostics followed successful
central contact-history export and canonical selection, with the owner cooldown
waiver and all holds preserved.
The decoder's deterministic cases cover malformed and custom categories. The
live diagnostic retained a source-bound `implied` / `[0]` response on Red Hat
(no preference set) and `api_unavailable` on IBM Video Streaming at the sole
checkpoint. Red Hat's read completed within 2,758 ms and cleanup within 2,766 ms;
IBM's capture/cleanup finished at 2,757/2,763 ms. Neither involved clicks or
submissions. The read at about 2,753 ms establishes availability at that instant,
not availability before the action worker's earlier readiness cutoff or enough
time for a complete action and follow-up. No API absence is inferred beyond the
IBM checkpoint. Local geographic egress was not independently verified.

No deployment, flags, scoring, capture/time/memory budgets or retention settings
changed. The extra observation reference is estimated below $0.01/month at
100,000 scans and 30-day retention. The inactive reader adds $0 recurring spend;
there were no paid API/model calls. Central ledger export/persistence is estimated
below $0.05 one-time, using an idempotent contact key and preserving holds.
