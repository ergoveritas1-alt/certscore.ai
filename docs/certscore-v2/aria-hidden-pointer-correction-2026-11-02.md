# CertScore.ai DOM pointer actionability correction

Local implementation only, November 2, 2026 (Hawaii). Base HEAD:
`6a9d197a207765ea958059d6ee2f2b2fdd94aa07`. No push, deployment, package
publication, production configuration change, database access or backfill.
Concurrent edits are preserved.

## Correction to the earlier diagnosis

The preceding CNN scope note correctly recorded the DOM attribute and the
scanner's no-click result, but incorrectly treated `aria-hidden` as a necessary
physical interaction blocker. The scanner gate was too strict. The owner has
explicitly requested verification and local correction of that gate.

WAI-ARIA defines aria-hidden as accessibility API exposure. Visibly rendered
content can remain pointer-interactive while excluded from that API. Its
non-interference rule also distinguishes ARIA semantics from native host-language
behavior. HTML inertness, in contrast, suppresses hit testing. See the primary
specifications: [WAI-ARIA aria-hidden](https://www.w3.org/TR/wai-aria-1.2/#aria-hidden),
[WAI-ARIA non-interference](https://www.w3.org/TR/wai-aria-1.2/#non-interference),
and [HTML inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees).
[Playwright actionability](https://playwright.dev/docs/actionability) requires
visibility, stability, event reception and enabled state for a normal click.

A hermetic browser fixture establishes both sides independently: the accessible
role query excludes the aria-hidden button, while a native unforced DOM-locator
click succeeds without removing or changing the ARIA attribute.

## Implemented boundary

The DOM pointer scope gate, live readiness check, atomic settling snapshot and
final contextual proof no longer reject aria-hidden alone. Rendered independent
consent prose can supply the existing canonical context proof even when its
accessibility exposure is hidden. The existing policy-link hit test and optional
single restored scroll likewise use physical interaction prerequisites.

The composed context helper also includes a host's own open shadow root within
its original four-level depth cap. Its querySelectorAll traversal previously
excluded the root element itself, preventing that context read from finding
rendered prose in the host's own root. Existing per-snapshot caches and candidate,
frame, processing and time bounds remain in place.

Hidden attributes, inert ancestry, CSS display/visibility/opacity checks,
uniqueness, enabled state, exact consent intent/context, viewport hit targeting,
source/session/document binding, cancellation, target authorization, transactional
exclusions and final dispatch proof remain mandatory. No force-click workaround,
ARIA/DOM repair, selector guess or new consent adapter is introduced.

Accessibility-tree-based resolution and the existing accessibility audit remain
separate. The scoped accessible-control test continues to exclude aria-hidden
controls through the browser's role query. A successful pointer check is not a
claim of screen-reader accessibility, saved-choice registration, sale/sharing
opt-out fulfillment or legal compliance. An unavailable Reject stays unavailable;
the correction cannot invent a missing first-layer choice.

The strict optional legacy aria_hidden exclusion code remains readable. Earlier
captures keep their recorded outcomes and reasons. The change applies to newly
produced observations; it does not reinterpret or reconstruct historical reports.
Assessment, concern policy, finding IDs/weights and public API schemas are unchanged.
New facts still pass through verified original bytes -> canonical assessment ->
normalized concern/policy -> unified finding/checklist -> persisted shared outputs.

## Verification and cost

Exact final test results, original fresh CNN receipts, canonical replay and local
web/PDF review are recorded separately in `outputs/cnn-aria-pointer-2026-11-02/`.
Synthetic fixtures establish behavior, not production population coverage.

No lane, browser context, RPC, navigation, capture, wait, retry, timeout, model
call, configured capacity or publication is added. The code removes checks and
adds no serialized field. Additional guard-processing/storage overhead is
estimated below $0.01/month at 100,000 scans, within the existing approved $4
combined pending-fix allowance. Corrected eligibility can let an already-enabled,
already-budgeted action lane execute and retain its normal evidence. Its actual
compute/storage depends on completion rates and site activity; unchanged budgets
are not a measurement of unchanged billing. No Lambda savings or production
coverage is claimed. The approved existing policy assistant may run in the local
CNN scan; its one-off API bill is not measured.

Materialization v45 remains the existing unreleased working-tree cache change;
global projection v27 is unchanged. No database migration, repair campaign or
historical regeneration is enabled. Any future release must use the repository's
AWS workflows, with compatible readers before producer packets. This note does
not authorize deployment or increased infrastructure/retention budgets.

## Final fresh CNN proof

Scan `cnn-aria-pointer-623e63ff-e6d6-4dea-8fa7-5ac2f2b9def8` completed all six
lanes and one terminal local result. The original canonical artifact is 1,401,623
bytes, SHA-256 `c8791b648df769e5ac0cc67c5fce3ff0783bec833f194e195330858ca369bc47`.
Its original pointer metadata and byte-identical local materialization copy verified.
No original bytes or receipts were modified. Actual local geographic egress is
unverified; no California egress claim is made.

The original producer retained a positive pre-consent policy-link pointer hit.
The canonical privacy_access criterion is Observed. Accept completed with its
original uniquely actionable control proof. Browser consent records were updated
after Accept, but semantic acceptance remained unconfirmed. The source retained a
completed three-second after-action capture with 192 of 256 observed requests;
request-retention loss keeps the complete activity assessment limited. Reject did
not resolve a usable control within its existing window. The independent policy
lane also had retrieval/classification failures, so privacy_notice_availability
was not promoted. These limitations are not attributed to aria-hidden.

The actual fresh source passed canonical materialization, normalized concern/
policy, unified checklist, persisted JSON hydration, strict API, canonical JSON,
shared web and shared PDF checks. No scanner fact was supplied by a fixture.
Shared display copy now preserves the precise canonical pointer statement rather
than rewriting it as an unqualified accessibility claim. No status/policy logic
was added in a renderer.

Final checks: 422 core/contract/action/shared tests and 373 web/canonical/API/
export/PDF tests passed, with zero failures or skips. Contracts build/typecheck,
scan-core build/typecheck, Lambda typecheck, web typecheck, both public-contract
drift checks and git diff whitespace checks passed. These are focused checks;
full preflight was not rerun for this follow-up. The focused tests were added to
existing predeploy coverage. Initial fixture failures exposed the host-own-shadow
context omission; that was fixed and the entire broader suite passed afterward.

Actual shared-component review passed at 390/1280 pixels, including Enter/Space
expanders, zero horizontal document overflow, no page errors and no unexpected
traffic. Its exact bundled vendor logos were allowlisted locally. All 32 PDF
pages were rendered and reviewed, with the pointer proof inspected on page 4.

The local scan wrapper took 24,384 ms. Retained passive CMP timings were 74 ms
for basics and 183 ms for public links: 257 ms within the unchanged 350 ms slice.
These observations do not establish incremental Lambda time or savings. The gate
correction adds zero serialized fields/RPCs/timeouts. Completed existing actions
can retain more activity than a previously blocked action; the whole fresh packet
size is not an isolated feature-byte delta or production coverage measurement.
The combined pending-fix allowance remains capped at the approved $4/month, with
new guard-processing/storage overhead estimated below $0.01/month. No configured
infrastructure or retention increase is authorized or implemented.

HEAD remains the recorded main commit, with uncommitted edits. The unrelated
dashboard test's SHA-256 remains
`04b84bda03e0aa296cd91bf7b2d78cb0e33f4c645eeb2d6f8ec7ad9e0390e2b2`.
Final diff review checked physical blockers, accessible-query behavior, unrelated
Terms controls, duplicate/changed/stale controls, source binding, legacy packet
compatibility, raw-evidence exposure and the single-publication boundary. No
remaining blocker to this local pointer-gate correction was identified. The
separate live capture limitations above remain explicit.
