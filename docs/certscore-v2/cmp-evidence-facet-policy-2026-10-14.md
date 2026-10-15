# CMP evidence facets and registered preference binding

Local implementation requested by the owner on October 14, 2026. No deployment.
New materializations use `cmp_inventory_tables.v8` and
`independent_cmp_basic_facts.v4`; historical persisted assessments are unchanged.

## Independent evidence eligibility

A validated action packet may retain a completed storage snapshot despite dropped
network rows. Its factual CMP storage/expiry and partial cookie comparison can use
that snapshot when the exact scan/target, authorized completed click, completed
capture window and retained snapshot pass the canonical packet verifier. Cancellation,
incomplete windows, missing snapshots and malformed/foreign proof remain ineligible.
Request completeness, semantic registration, complete-inventory Review eligibility
and scoring remain independent and unchanged. An overflowing request sample never
establishes a complete activity check or a no-activity result.

The shared reportability projection filters action-labelled expiry rows by the
corresponding observed first-layer control, just as for activity and consent-storage
tables. Before-choice expiry remains independently visible. Original action packets
remain retained; neither a table nor a saved report is repaired on read.

## Configured consent-cookie identity

The existing all-vendor DOM read may additionally retain at most four configured
cookie identities in `cmp_configured_cookie_identity.v1` (currently only one Drupal
`drupalSettings.eu_cookie_compliance.cookie_name`). It reads own data properties,
never getters or APIs, and only for one unambiguous registered provider. Names are
bounded to 160 safe identifier characters. Navigation invalidates the checkpoint.
Passive capture also rechecks its loader binding before returning.

WC01 requires typed exact-target/document evidence and the canonical provider's
registered configuration path. The name can identify a retained factual cookie
record/expiry; it is not a global alias, inferred purpose, refusal witness, proof
of a new write, or permission to score an unconfirmed action. Old Drupal captures
without the configuration witness stay unchanged.

## Preference panels

Versioned registry bindings cover HubSpot (`hs-eu-cookie-settings-button` to
`hs-modal-content` under `hs-banner-parent`), Didomi (notice Learn More to
`didomi-consent-popup` under `didomi-host`) and Osano (banner Manage button to
`osano-cm-info-dialog`). Existing ARIA bindings and OneTrust/Borlabs recipes remain.
Registered selectors also allow an exact Options anchor. Labels must still pass
the canonical Options classifier; an informational “Learn more” label alone is
not authorized by a panel selector. Passive Accept/Reject
recognition recipes are not action recipes.

The observer still authorizes at most one Options click. It requires a unique
visible enabled, hit-testable, correctly labelled control and exact existing panel
identity or an approved deferred panel under the same pre-existing provider root.
Deferred panels require the registered accessible role/name. Multiple providers,
ambiguous panels, root replacement or document drift fail closed. It never saves,
changes choices, opens deeper tabs, invokes vendor opening APIs or retries a visit.

Selector references:
- HubSpot's published banner: https://js.hs-banner.com/v2/53/banner.js
- Didomi: https://support.didomi.io/configuring-custom-scenarios-api
- Osano: https://docs.osano.com/en-US/osano/article/aelZSY5t-css-for-customizing-styling-osano-cookie-consent

## Budget and verification

No new lane, invocation, model call, timeout, retry, scan-time network fetch or
publication is added. Preference inspection retains the 17-second / 56 GB-second
cap, basic-capture reserve, one-click limit, existing row/byte limits and screenshot
review rules. The identity field adds under $0.02/month at 100,000 scans with one
year retention (conservative all-scans estimate, existing artifacts; below the
repository's pre-approved $1 threshold).

Retained replay uses the original SHA-verified coordinator bundle, manifest and
geometry, prohibits HTTP/model calls and rechecks that saved projection hashes did
not change. FullStory recovers consent storage and expiry; HubSpot recovers expiry.
SITS and IKEA statuses and all existing Review findings remain unchanged. Fixtures
cover overflow, foreign/malformed/cancelled evidence, unconfirmed choices, configured
identity, getter refusal, ambiguous/replaced panels, navigation and shared action
reportability. Accessibility still preserves full counts with bounded examples;
unstable-frame coverage is not promoted to complete by this change.

## Three owner-approved local verification scans

The owner approved three local quota exceptions on October 14. Exactly three scans
ran; the anonymous limit was restored to 20 immediately after each admission and
its original file hash verified. No deployment or additional rescan occurred.
The canonical contact ledger records all three outcomes and their new cooldowns.

| Site / local report ID | Observed | Review | Partial | Incomplete | Not assessed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Georgia Tech / `b0f8f20c-5399-425a-b782-5006e4cd2fe0` | 7 | 1 | 0 | 5 | 0 |
| FullStory / `c2c8f805-4f9f-4b3f-916f-f5ea4e647a70` | 5 | 0 | 1 | 6 | 1 |
| HubSpot / `d9bf307b-9618-40ee-b644-3187a6684e5b` | 3 | 0 | 0 | 5 | 5 |

Georgia Tech retained typed configuration for `cookie_compliance`, both action
snapshots/expiries and a valid prominence comparison. Its five preference-dependent
checks remain incomplete because no unique actionable Options control was resolved.
FullStory retained completed Accept storage/expiry and a partial activity check;
Reject failed before dispatch because its hit target was intercepted. Options was
not uniquely actionable, and prominence had no retained pixel comparison.
HubSpot dispatched one Options click but failed the registered deferred-panel
identity/role/root verification. The available diagnostic does not distinguish
which binding predicate failed. Both action visits withheld dispatch with
`transparent_consent_scope_not_ready`; no post-choice evidence was invented.
These scans therefore do not establish successful live preference inspection for
HubSpot or Osano, despite passing the local fixtures. Retain the failures as leads.

Original bundle, manifest and geometry SHA checks passed. Fresh CMP assessments
match replay from those original bytes; saved projection hashes remained unchanged
on verification, and report/export rows agree. All three full report pages returned
HTTP 200 and rendered CMP Details expanded in a local browser check. End-to-end
local scan durations were 15.520, 16.403 and 20.247 seconds respectively; no worker
budget was extended. One-time scan spend remains within the approved below-$0.30
estimate. Detailed receipts are in `artifacts/cmp-facet-fixes-20261014/`.

## Local recovery repairs after retained verification

The owner requested retained-evidence/local-test repairs for HubSpot preference
verification and FullStory's intercepted Reject, with no new scan or deployment.

Deferred preference panels now finish accessible-role/name hydration within the
existing absolute opening deadline, holding the exact panel and pre-existing
registered parent nodes. Names must resolve inside that parent. Replacement,
ambiguous roots/panels and navigation remain ineligible. The optional bounded
`cmp_panel_verification.v1` diagnostic distinguishes role/name readiness from
parent/panel identity failures. This repairs premature verification of a visible
but incompletely initialized panel. The historical HubSpot packet lacks the
failed predicate, so delayed hydration is a tested failure mode, not an established
explanation of that historical visit. Its original assessment remains unchanged.

Reject actionability recovery now shares its existing named-resolution (500 ms),
optional canonical-resolution (500 ms) and geometry (1,000 ms) allowances under one
deadline. A failed re-resolution no longer skips the remaining geometry slice.
Only a safely hit-testable, visible, enabled control may proceed through the
unchanged canonical label/control proof, baseline freshness, exact-target,
semantic-registration and final dispatch guards. No second click, center-hit bypass,
new lane, retry visit or larger allowance is introduced. Cancellation terminates
geometry recovery. A persistent obstruction still prevents dispatch. FullStory's
retained packet proves interception but does not identify whether it was temporary;
the new recovery therefore needs a future authorized live verification.

Local tests cover delayed HubSpot role/name initialization after one Options click;
wrong roles, unresolved names, labels outside the parent, parent/panel replacement
and out-of-parent panels; and an animated Osano-style Reject with a temporary
interceptor, persistent interceptor and cancellation. The temporary case dispatches
once and confirms its local refusal record; the latter two dispatch zero times.
The vendor's previously downloaded HubSpot renderer was also inspected locally,
with all external requests blocked. Original coordinator bundle/manifest/geometry
hashes and saved CMP assessments still pass canonical retained replay.

Existing 17-second / 56 GB-second preference and action/lane/publication ceilings
remain unchanged, as do model calls, scoring and saved reports. Additional bounded
panel diagnostic storage is estimated below $0.01/month at 100,000 scans with one
year retention, within the repository's pre-approved threshold and existing budget.
No new public scan, deployment or contact-ledger admission occurred for these repairs.

## Two owner-approved fresh recovery-verification scans

Exactly two additional local admissions were approved and used for HubSpot and
FullStory after commit `76c52f43`. The original quota file was restored after each
admission, with equal before/after hashes; usage increased from 37 to 39 and the
limit remains 20. No deployment or further rescan occurred.

- HubSpot: `92533fe5-31f7-41d6-88b4-a300899a3399`, 15.673 seconds. Three CMP checks
  Observed, three Not assessed and seven Incomplete. Preference inspection was
  cancelled before its packet was retained (`preference_inspection_cancelled`).
  Therefore no new panel-verification predicate was retained and the live HubSpot
  repair remains unverified. Accept failed actionability; Reject was not attempted
  because the consent scope was not ready. Do not describe this as a successful
  preference-panel verification or borrow old action observations.
- FullStory: `f7b36da6-7043-4789-8ca7-093de4d0377f`, 19.747 seconds. Five CMP checks
  Observed, one Review, two Not assessed and five Incomplete. Reject was clicked
  once; its complete eight-second after-click capture retained storage and dropped
  zero requests. The existing separately eligible after-click Review projection
  reports 22 tracking requests. Semantic refusal registration was unconfirmed.
  No geometry-recovery fallback was needed on this visit, so the successful action
  capture does not establish that a live interception exercised the new recovery.
  Deeper preferences still have no unique actionable Options control.

Original bundle/manifest/geometry checksum checks, canonical CMP replay against
persisted assessments, saved projection immutability, report/export parity and both
quota restoration receipts passed. Both actual report pages were opened in the
in-app browser with CMP Details expanded and visually checked. Screenshots and
receipts are in `artifacts/cmp-targeted-repairs-20261014/`. The one-time scan spend
remains within the approved below-$0.20 estimate. The central-history export and
updated calibration registry check passed; both contacts received new cooldowns.

## Preference opening and retention cancellation repair

Review of the original HubSpot bundle and manifest verifies that preference work
was cancelled at the existing report barrier after 15,633 ms, before its 17-second
observation ceiling. No preference packet was retained. The exact browser phase
and failed panel predicate cannot be recovered from that historical scan.

The opening path previously allowed panel visibility and accessible-role/name
hydration to consume the entire remaining lane budget. It now shares one
1,000-ms optional opening cap across click dispatch, panel visibility and deferred
role/name verification. The existing allowance helper also protects 1,000 ms for
inventory and 250 ms for finalization. Insufficient remaining time prevents the
optional click. Missing/unready panels end as limited/timed out and preserve
earlier independently document-bound checkpoints. Replacement, ambiguity and
navigation still invalidate the affected proof; no panel controls are inferred.
This favors returning useful partial evidence over a long speculative opening
wait. Panels taking longer than this cap remain incomplete.

Preference artifact retention now uses the independent artifact-cancellation
signal, with its existing 500-ms upload cap. Observation completion activates the
existing artifact reserve and clears the browser-work timer through the existing
scan-core completion callback. A stopped browser observation can therefore save
its limited packet; overall artifact cancellation still prevents retention. The
worker verifies packet scan/target/dispatch binding before upload, and the
coordinator keeps its checksum/binding verification, zero tail wait and one-result
publication. Late worker output cannot reopen a report.

Local regression cases cover valid delayed hydration, absent panels, missing
role/name, partial checkpoint retention, cancelled observations with a live
artifact reserve, cancelled artifacts, wrong binding/hash, and stalled workers.
The original HubSpot/FullStory bundles still reproduce their persisted CMP
assessments without rewriting either report. In particular, this cannot fill the
missing historical HubSpot packet or claim that its live panel now succeeds.

No new lane, visit, click, retry, timeout increase, model call, artifact copy or
upload is added. The same single bounded packet upload uses the already-approved
artifact reserve; maximum compute and storage budgets remain unchanged. Incremental
recurring capacity/request cost estimate: $0 beyond the existing approved budgets.
No public scan or deployment was performed. Retained-source review receipt:
`artifacts/cmp-preference-cancellation-20261014/retained-review.json`.

## HubSpot action readiness, paired comparison and specific failure projection

The saved HubSpot run retains a joined Accept worker that failed actionability
before dispatch and a joined Reject worker whose final proof reports
`transparent_consent_scope_not_ready`. Neither choice was clicked; joined worker
transport is not completed action capture. Its screenshot was approved and
retained, but the producer's pixel-comparison diagnostic says `not_eligible`.
That historical diagnostic omits the failed predicate. Offline replay verifies
the unique pair, document token, 71-ms image/geometry skew and original image hash;
pure pixel measurement succeeds. This verifies the algorithm, not the missing
historical capture eligibility proof. Do not overwrite or upgrade saved prominence.

The producer now anchors its final frame-stability snapshot immediately before
geometry capture, after access diagnostics. A frame arriving during the earlier
access read no longer falsely invalidates the later geometry/screenshot pair.
Frames changing during the actual pair still prevent measurement. Eligibility
diagnostics separately identify frame changes, non-unique pairs and incomplete
image binding within the same existing 80-ms comparison allowance. The exact
historical frame event is not recoverable; the regression demonstrates this
failure mechanism without asserting a more specific historical cause.

Accept/Reject trial and recovery now share the existing maximum 3,000 ms
(2,500 ms without canonical discovery): one 1,000-ms trial plus the existing
named/canonical/geometry recovery slices. Final-proof opacity settling may reuse
the unspent readiness allowance after search ends; it cannot restart that
allowance. Accept also retains its unused geometry slice when re-resolution
finds no actionable target, matching the bounded Reject recovery. The unchanged
one-second opacity helper rejects hidden/inert/disabled/ambiguous controls and
opposite labels. Full action proof, exact target, safe hit target, cancellation,
confirmation and the existing lane/result barrier remain authoritative. No
additional click, visit, lane, action window, model call or timeout is added.

Canonical CMP materialization now recognizes validated, scan/target-bound
pre-dispatch failures even when their worker outcome is `joined`. Missing
post-choice activity, storage and expiry become grouped `incomplete` coverage
with specific action failures, not absence findings. Completed storage/activity
facets remain independently usable. Expiry no longer incorrectly blames missing
preference evidence. Bound pixel diagnostics likewise explain comparison failure
separately from screenshot safety review; malformed diagnostics are ignored.
The shared CMP UI displays those projected details inside the grouped checks.
Assessment -> normalized concern -> shared projection remains the only display
path, with no new score effect or raw-signal UI inference.

Local tests cover both choices after late opacity, persistent transparency,
opposite labels and cancellation; transient/persistent Accept interception;
iframe arrival during access followed by a successful bound pixel comparison;
unstable/unbound visual rejection; explicit failed-action projection through
normalized concerns and grouped UI; and comparison/safety-review group labels.
Retained HubSpot replay now projects three Observed and ten Incomplete rows,
including three specific action coverage failures. This is diagnostic clarity,
not additional observed coverage. FullStory's Review and other findings remain
unchanged. Original artifacts and saved report records are unchanged; canonical
local previews and hash receipts are under
`artifacts/hubspot-capture-repairs-20261014/`.

No public rescan or deployment was performed. Existing compute/interaction
ceilings are unchanged. Added diagnostic reason storage is estimated below
$0.01/month at 100,000 scans with one-year retention, within the existing approved
budget and repository's pre-approved threshold; no extra storage request or
artifact is introduced in the scan path.

## One owner-approved fresh HubSpot verification

Exactly one fresh local scan was authorized and admitted after `14b04eb6`:
`257741ec-9e2f-40e2-a912-b98fccedaf90`, target `https://www.hubspot.com/`.
Registry validation and a fresh successful central-history export preceded
canonical selection with the owner's explicit targeted cooldown override. Local
usage was 39; the temporary admission limit was 40 and the original limit of 20
was restored immediately after admission with equal original/restored file hashes.
No extra scan or deployment occurred. Estimated one-time spend remains below $0.10.

The scan completed in 18.594 seconds. Both Accept and Reject clicked once and
completed their bounded activity windows (three and eight seconds, respectively),
with zero dropped requests and retained storage snapshots. Semantic consent
registration remains unconfirmed; factual after-click capture is still usable
under the existing scoped policy. Neither action needed re-resolution or a
geometry fallback on this visit, so this verifies the live capture outcomes
without asserting that each repair branch was exercised.

Prominence is Observed from a document-bound, approved 1366-by-900 screenshot and
retained measurements, with 435-ms geometry/image skew. Accept/Reject fill contrast
was 16.467/16.463 and outer emphasis 0.041/0.041; no material prominence disadvantage
met the existing review threshold. Screenshot bytes, document binding, original
bundle/manifest/geometry hashes, canonical CMP replay against the persisted
assessment, report/export parity and quota restoration checks passed.

CMP Details shows six Observed checks, one Review, five Incomplete and one
Not assessed. The Review retains 11 eligible tracking requests after the Reject
click, including X/Twitter, HubSpot, LinkedIn and Google, first observed 0.11 seconds
after the click. Browser consent records and CMP cookie expiry are Observed.
The preference packet was saved after 4.478 seconds and retains its privacy-link
checkpoint; its Options control was not uniquely actionable, so no preference
click occurred. Five deeper preference checks remain explicitly incomplete.
Pre-choice privacy-link reachability remains Not assessed because its retained
hit-target check was false; this does not assert that HubSpot lacks that feature.

The actual full report was opened in the in-app browser with CMP Details expanded
and visually checked. Receipts, fresh source verification, quota restoration and
the screenshot are under `artifacts/hubspot-fresh-verification-20261014/`.
The repository contact ledger was updated for this one visit, with the central
contact persisted under idempotent key
`owner-hubspot-readiness-verification-20261014-257741ec`.

## Privacy-link accessibility diagnostics

`privacy_link_access.v1` adds an optional, strict per-link outcome to the existing
retained CMP privacy-link record. The passive basic capture and isolated
preference inspection reuse their existing link reads, canonical privacy-surface
classification and loader checkpoints. No browser visit, RPC, scroll, click,
policy fetch, retry, model call, wait or deadline increase is introduced. A shared
50-ms browser read slice bounds geometry/style/hit work across at most 300 anchors
(or the basic capture's existing 16 classified candidates); deadline/rectangle or
ancestor-depth exhaustion stays explicitly incomplete. Candidate identity is
rechecked before basic facts are retained.

The diagnostic distinguishes reachable, outside viewport, not rendered, hidden,
transparent, inactive, pointer disabled, hit-target missed and inspection
incomplete. It identifies what the read actually established, never inventing a
banner obstruction or unsupported CMP feature. Transparent/inert/hidden ancestors
cannot establish reachable solely from DOM hit testing. Boolean/outcome
contradictions and unrecognized diagnostics fail contract validation.

Only eligible, document-bound evidence enters the canonical CMP assessment,
source hash, normalized concerns, concern policy and shared report projection.
Failed access stays Not assessed and score-neutral. Newly materialized rows use
the specific retained reason; historical false results without a reason say that
the saved scan did not record why. Persisted historical assessments and original
artifacts are not rewritten. Multiple differing reasons remain in the existing
supporting packet rather than asserting a single cause.

Retained HubSpot scan `257741ec-9e2f-40e2-a912-b98fccedaf90` verifies one privacy
link with a false hit-target result and no diagnostic; its exact reason cannot be
recovered retrospectively. Original bundle SHA and before/after local persisted
report hashes are unchanged. The offline replay remains Not assessed and uses
explicit historical wording. Verification receipts are under
`artifacts/privacy-link-diagnostics-20261014/`. No public rescan or deployment
occurred. Existing capture budgets are unchanged; additive diagnostic storage is
estimated below $0.05/month at 100,000 scans with one-year retention, as disclosed
before implementation (below the repository's $1/month approval threshold).

## FullStory / Osano capture repairs, retained-first verification

The owner authorized local Options, prominence and request-retention repairs
within the existing latency/cost envelope, with no deployment or fresh public
scan. Osano's named registry binding is now `osano_preferences.v2`, covering both
the banner Manage button and its documented `button.osano-cm-window__widget`.
The canonical observation-only “Cookie Preferences” label is eligible for the
single isolated Options action only when the exact named, registered target
matches. The existing final metadata read rechecks composed-ancestor visibility,
opacity and inactivity before dispatch. Generic observation-only labels remain
non-actionable; Accept/Reject
classification and semantic confirmation are unchanged. Existing/deferred panels
must bind to the same unique `.osano-cm-window` and the registered preference
panel; foreign aria-controls, outside/replaced panels, ambiguous roots, hidden,
transparent, inactive and covered controls cannot establish opening proof. No
Osano API opener, custom footer-link guess, extra interaction or fetch was added.

Official selector/behavior references:
- https://docs.osano.com/en-US/osano/article/8cMRoKpv-common-css-changes
- https://docs.osano.com/en-US/osano/article/Vku5EG_U-hiding-the-cookie-widget-cookie-icon
- https://docs.osano.com/en-US/osano/article/dxTRCPqZ-first-layer-categories-manage-preferences

The existing bounded Options inventory read now returns access states atomically
instead of performing repeated locator visibility/enabled/hit reads. Shared
50-ms browser work, 100-candidate bounds and canonical label filtering retain
`cmp_options_resolution.v1` counts. Counts explain incomplete preference rows
through typed assessment -> source hash -> normalized concern -> concern policy
-> shared CMP projection. Missing historical counts are never reconstructed from
an independent lane or a later visit; no feature-unsupported assertion is made.

`terminal_pair_first.v2` moves protected settled geometry immediately after its
existing screenshot, before duplicate rapid inventory. A fully document/image-
bound, complete, stable settled pair may consume the existing single 80-ms pixel
allowance and become the terminal consent packet. Successful pairing skips the
redundant inventory/late screenshot. Ineligible captures retain existing recovery;
interim frames cannot spend that allowance, and covered controls never produce a
visual comparison. Exact geometry/image/document/frame/skew and safety-review
checks remain in place; no extra capture, decode, wait, model call or publication
is added. New canonical materializations explain verified paired-control
occlusion as an incomplete comparison, not unequal prominence or a scoring gap.

`priority_bounded_action_requests.v2` preserves all original capture/retention
bounds (192 post-click rows, 256 overflow evaluations) and omission accounting.
On overflow, a distinct canonical tracking endpoint (host/path/resource type/
purpose) can displace a duplicate known tracking/support endpoint before another
copy consumes the slot. Query values do not define identities; overlong paths
are not collapsed by truncation. The earliest example of an endpoint and unknown
traffic remain protected, alongside existing new-host diversity. Endpoint
replacement also preserves the latest tracking example; only a middle tracking
duplicate is expendable, protecting useful post-choice timing/ancestry coverage. Selection does
not change attribution, eligibility, scoring policy, observed counts, source completeness
or represent an omitted request as retained. Historical v1 summaries stay v1.

Retained FullStory `f7b36da6-7043-4789-8ca7-093de4d0377f`, HubSpot
`257741ec-9e2f-40e2-a912-b98fccedaf90` and IKEA
`3e99f256-8aae-4abd-a2fb-03060ba64447` pass original bundle/manifest/geometry/image
SHA verification and persisted local report immutability. FullStory's current
canonical replay can explain the two covered controls as Incomplete instead of
Not assessed; this is diagnostic coverage only, with no new Observed checks.
Its saved report is unchanged and its shared post-Reject Review still cites 22
tracking requests. The old Accept capture omitted 88 requests, including 18
tracking requests; these cannot be recovered or used to claim full v2 live
retention coverage. The old Options failure retains no new candidate counts.

Local coverage includes registered existing/deferred Osano widgets, inaccessible
and ambiguous controls, unrelated/replaced panels, the full protected settled
capture, frame stability, canonical diagnostic projection and source rejection,
endpoint diversity, unknown protection, exact historical/zero-loss/overflow
accounting and the unchanged CPU cap. Receipts are under
`artifacts/fullstory-capture-fixes-20261014/`. Builds and web/core typechecks pass.
No public scan, deployment, quota change or historical rewrite occurred. No
recurring compute capacity or maximum allowance increase is introduced; bounded
additional diagnostic storage is estimated below $0.01/month at 100,000 scans
with one-year retention, as disclosed before verification.
