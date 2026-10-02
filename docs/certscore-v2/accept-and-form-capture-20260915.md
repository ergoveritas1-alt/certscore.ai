# Accept and form capture reliability — September 15, 2026

## Retained failures

Local full-site scan `5b5374b1-f2ec-4c18-9f97-8db7ef2b8fcf` completed ten pages,
but its Accept lane spent 14,001ms looking for a registered control and did not
click. Passive evidence retained the visible German Accept span. The canonical
DSGVO All in One / tarteaucitron registry had no Accept recipe, and generic
action discovery intentionally excludes plain spans.

The `/aktuelles/` form snapshot failed its before/after bounds check. That check
must remain fail-closed. The prior animation pause covered only the form and its
descendants, leaving ancestor and sibling motion able to move its crop.

## Changes

The versioned registry recipe binds the first-layer `tarteaucitronPersonalize`
control to the exact published `respondAll(true)` handler. The same id's reload
and preferences variants are excluded. Canonical live label, unique hit target,
scope, authorization and last-mile proof checks remain required. No generic span
fallback is added. One completed click plus bounded capture can establish path
success; hiding the banner cannot establish consent registration.

Form capture pauses at most 1,000 existing document animations at their current
frame and resumes only those it paused. This covers motion outside the form.
Capture still uses one screenshot, no settling wait, no retry, and the existing
2.5-second shared capture/masking/review deadline. Script-driven layout changes,
document changes and in-crop movement still discard the image before review.
Input masks, image limits and mandatory display-safety review are unchanged.

No lane, browser, timeout increase or additional model call is introduced.
Animation bookkeeping is estimated below $0.10/month at 100,000 scans assuming
under 20ms additional 3GB compute per scan. The recipe replaces unsuccessful
search work with the already-authorized bounded action path; no net compute
increase is expected for the affected target. These estimates are not hard caps.

## Verification

Deterministic browser tests cover one accepted action and successful typed path
projection, neutral unconfirmed registration, reload/preferences/duplicate/
out-of-banner rejection, moving ancestors and siblings, restoration of prior
animation state, one screenshot/review, and pixel masking. Existing tests retain
unsafe-review, document/binding, changing geometry and shared-budget failures.

Fresh localhost full-site scan `25ffc692-a502-4aca-9884-036cbb88def8` completed
ten pages in 77,441ms (previous run: 77,837ms). Accept resolution fell from
14,001ms to 6,022ms and its complete lane from 16,357ms to 10,710ms. The retained
single click and 3,005ms after-click capture produced **Succeeded** in the report;
semantic registration correctly remained unconfirmed. The `/aktuelles/` snapshot
was available, masked, safety-reviewed and opened successfully in the localhost
report. This is one target verification, not a general latency benchmark. Sitemap
discovery remained limited; all ten scheduled pages completed. No production
deployment was performed.


### Form privacy disclosure excerpts (local, October 2)

The existing passive consolidated runtime capture can retain optional v1
`privacyDisclosure` evidence on each collection form. It collects visible public
notice blocks within the form, explicit form descriptions, and immediate notice
siblings in an unambiguous single-form container. Canonical locale privacy hints
select candidate text. Footer/navigation/CMP notices, other forms, editable text
and entered values are excluded. Query strings and fragments are removed from
retained HTTP(S) policy links. This is bounded excerpt evidence, not a semantic
purpose assessment or consent/compliance finding; scores and concerns are unchanged.

Limits: two excerpts per form, 600 characters per excerpt, two links per excerpt,
1 KiB combined disclosure JSON per page, 40 inside-form candidates, 80 text nodes
per candidate, and a five-millisecond page deadline inside the existing capture.
Missing or exhausted capture stays Not retained rather than claiming absence.
The UI reveals wording and source links under a closed Privacy disclosure within
form details. Historical inventories remain readable without the optional field.

Estimated incremental storage/transfer below $0.50/month at 100,000 scans,
10 pages/scan, eight retained copies, and 30-day retention (about 8.2 GB storage
and 1 GB transfer at the maximum byte cap). No additional browser run, network
request, model call, configured timeout, or provisioned capacity. Bounded capture
compute is estimated below $0.20/month at that volume; total below $0.70/month.
Local implementation only; deployment is separate.


### Slow-document form capture correction (October 2)

The explicitly authorized one-off passive SITS contact-page diagnostic returned
HTTP 200 but reached the 15-second readiness boundary without usable body text.
Its first subresource requests began around 15.1 seconds from scan start and the
inventory at 17.3 seconds still observed a loading document. The module correctly
reported partial coverage, but the form inventory incorrectly reported complete
coverage with zero forms. The retained run does not identify which remote request
or parser dependency caused the delay; it is not evidence that the site has no form.

Baseline runtime captures now use the existing 750/1,250 ms sparse-page confirmation
allowance before their single inventory snapshot after a committed navigation
readiness timeout. The later phase does not repeat that wait. No new navigation,
retry, browser invocation, model call, timeout or provisioned capacity is added.
GPC ordering and its independent paired-impact freeze remain unchanged. A still-loading
form capture records limited coverage and `document_still_loading`, propagated
through the canonical collection assessment. Retained early observations survive.

Browser regressions cover a body/form/disclosure arriving during that existing
allowance, continued loading, parsed documents, failed atomic captures, and GPC's
original ordering. The assessment regression prevents an unfinished empty DOM
from becoming `not_observed`. The live target has not been rescanned; its diagnostic
contact hold remains unchanged. Expected recurring cost impact: neutral (reordered
existing bounded work).


### Follow-up transport and recovery diagnosis (October 2)

The owner subsequently requested a rescan and investigation. The failed rescan
recorded `ERR_NETWORK_CHANGED` on the existing HTTPS www recovery candidate,
then `Page.stopLoading: Not attached to an active page`. A later instrumented
passive runtime capture completed in 4,353 ms with 63 requests and 63 responses,
6,514 characters of retained visible text, and no navigation recovery required.
Direct HTTP and DNS checks also succeeded quickly. The original failures do not
establish persistent site slowness; their precise external network trigger is
not retained. Evidence remains under `tmp/sits-network-diagnosis/` locally.

The completed page contains HubSpot placeholders for Contact and Newsletter and
an explicit unblock control. No form or disclosure was available in that passive
main-document view. No consent/unblock click or form submission was performed.

Recovery now detaches an inactive CDP session and reattaches after the already
required main error-document commit, before the existing single stop retry and
about:blank reset. The original deadline, cancellation checks and navigation
allowance are unchanged. A failed/late reattachment still blocks the next
navigation, and every created session is detached. Diagnostics separately name
`network_changed`. Nine focused tests cover stale attachments, cancellation,
deadlines, main-frame binding and failure states; the successful live capture
preceded this recovery hardening and did not exercise that error branch.
Expected recurring cost impact: neutral; no added network request, browser run,
retry allowance, timeout or provisioned capacity. Nothing deployed.


### Fresh verification and disclosure budget accounting (October 2)

The next owner-requested passive SITS run completed in 11,034 ms with 64 requests
and responses, no errors and no recovery. It again retained the HubSpot unblock
placeholder, not a contact form; its disclosure cannot be verified before consent.
The run is preserved separately in `tmp/sits-form-verification/result.json`.

Verification also exposed an intermittent local disclosure-test failure: the
five-millisecond deadline began before ordinary field/layout inspection. That
unrelated work could exhaust the disclosure budget before a later form. The
budget now measures only time spent in disclosure capture, cumulatively across
forms; caching and all candidate/byte limits remain. Text normalization is computed
once per candidate rather than per locale hint. Regression fixtures include a
12 ms simulated field-layout delay and verify both form-owned and adjacent notice
capture, policy links, and exclusion of entered values and footer text. The maximum
disclosure-work allowance remains five milliseconds; the previous incremental
cost estimate is unchanged. Not deployed.

### Opportunistic After Accept form evidence (October 2)

The owner approved bounded form capture in the existing Accept lane. Following a
verified completed click, one DOM sample starts after at most 250 ms (half the
existing window for shorter windows). It overlaps confirmation and observation;
there is no awaited form task at the readiness barrier. The original dispatch
window is the capture deadline even if semantic confirmation runs longer. Early
exit freezes the available sample immediately. Disabled, unattempted and failed
clicks do not start capture. No additional interaction, invocation, browser,
model call, screenshot, retry, timeout or report refresh is introduced.

The optional `post_accept_form_capture.v1` packet retains at most three frames,
two forms and twelve fields per frame, with a 10 ms cooperative DOM-work budget
per frame and an 8 KiB total serialized cap. Public form-local notices and policy
links reuse the existing value-free form schema and locale hints. Entered values,
editable text, URL queries and fragments are excluded. Capture is a bounded sample
at an instant, not proof that all forms have loaded. Frames that cannot be read,
loading documents, size/work bounds, cancellation and changed documents remain
explicitly limited. A navigation during the click, including same-URL reload,
invalidates the form capture. Pending browser evaluations cannot mutate a frozen
packet or keep finalization waiting.

The verified Accept packet and its existing persisted report projection retain
session/frame/document references, exact target hash, action offset and capture
offsets. Contract checks reject mismatched action proof, missing packet hashes,
unauthorized navigation and timestamps outside the action window. No baseline
inventory is overwritten. Form evidence does not create normalized concerns,
findings, score effects or consent registration; a future finding based on these
forms would require the canonical concern/policy path separately.

The shared form report projection uses the existing first-layer Accept visibility
gate. Starting-page and full-site form tables label the rows “After Accept click,”
retain collapsed Privacy disclosure, and present one compact limitation message.
The overview counts “Form observations” when visits are combined, since the same
form may appear before and after the action. Structured capture is shown as
“Fields captured”; no screenshot availability is implied. Historical records
without this optional evidence remain unchanged.

Cost estimate disclosed before implementation: below $0.70/month incremental at
100,000 eligible scans/month, eight retained copies and 30-day retention. The
8 KiB cap implies about 6.6 GB maximum retained storage across those copies;
bounded DOM work is estimated at about 30 ms per eligible scan. This is an estimate,
not a hard browser CPU or production latency guarantee. The implementation adds
no configured wait; unresponsive-frame tests verify synchronous finalization.
If volume, retention or limits grow, reassess the repository cost-approval rule.

Local verification covers main/embedded forms, privacy wording and sanitized
links, cancellation, same-URL document changes, pending evaluation finalization,
packet-to-report retention, malformed provenance, neutral unconfirmed clicks and
collapsed disclosure UI. The Accept regression suite and relevant report tests
pass. Browser preview was checked at 900 px with no page overflow or console
errors. This has not been deployed or verified against a fresh live SITS Accept
run. A separate HubSpot unblock control remains outside this authorization.

### Release preparation (October 2)

The owner requested committing and deploying all intended changes, reconciling
branches/worktrees and preserving unique work. Production web initially served
`cc949a12da8429011c2d9640b9116242bd3bad4e`; scanner and validation images still used
`1a1c039f383b5c13c3128f814d89849ce831386c`. The only additional branch,
`codex/preserve-gpc-research`, contains isolated research and remains preserved
locally and on origin, outside this production release. No extra worktree or
stash required reconciliation.

Recent validation deployments failed because the configured reusable worker
runtime-base image was missing. The release will bootstrap that image through
the canonical workflow without changing service capacity. Existing worker image
size is approximately 602 MB; estimated incremental registry storage is below
$0.10/month (below the pre-approved threshold), disclosed before proceeding.
Scanner runtime bases remain reused, with one application image built and
replicated to the three existing approved regions. Production verification is
read-only; no new public-site scan or form interaction is part of this release.

The release gate exposed a deadline race missed by the earlier focused checks:
a form evaluation could finish after the deadline, leaving fewer inspected frames
than candidates without a limitation reason. Finalization now marks that outcome
limited, and invalid optional form payloads retain only an explicit
`capture_invalid` coverage record. Optional capture failure cannot interrupt browser
cleanup. A delayed-evaluation regression covers this case. The unrelated IMOU
fragment test fixture was also updated to contain a substantive cookie-policy body
under the existing 120-character evidence requirement; production policy behavior
was not weakened.
