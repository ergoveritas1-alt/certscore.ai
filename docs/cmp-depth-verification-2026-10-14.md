# Complementary CMP-depth verification — October 14, 2026

Local development only. No deployment, push, production report rewrite, new capture
lane, longer deadline, retry, or additional model call was introduced.

## Sample and contact controls

The owner requested another representative sample and focused rescans where useful.
The earlier five-site exercise is recorded in
[evidence-diversity-verification-2026-10-14.md](evidence-diversity-verification-2026-10-14.md).

The canonical registry passed for 100 targets. A successful central all-channel
history export preceded selection. The canonical selector used an explicit
owner-requested cooldown exception and excluded blocked/retired targets. Retained
scan metadata identified five complementary sites with prior A/R observations:
FullStory/Osano, IKEA/OneTrust, Georgia Tech/Drupal EU Cookie Compliance,
HubSpot/HubSpot Consent Banner, and Weather.com/prior Sourcepoint. Prior provider
observations do not establish the provider or controls in a new visit.

Exact retained public entry URLs were used for fresh per-scan action authorization:
`https://www.fullstory.com/`, `https://www.ikea.com/`, `https://www.gatech.edu/`,
`https://www.hubspot.com/`, and `https://weather.com/`. Registry root URLs remain
contact-ledger keys. No redirect broadened interaction authorization.

Five initial scans and three focused verification scans completed. The HubSpot
verification submission returned HTTP 429 `anonymous_scan_daily_limit` before any
scan or target contact was created. The daily 20-new-scan limit was not bypassed.
Weather.com was not retried merely to seek more favorable evidence. The global
SITS contact hold remains unchanged.

Eight actual contacts were recorded centrally under idempotent keys
`cmp-depth-20261014-initial` (5) and `cmp-depth-20261014-verification` (3), with
reviewed repository ledger updates. The blocked HubSpot submission is retained
locally but is not a target contact.

## Reports and outcomes

| Site | Initial scan | Focused verification | Result |
| --- | --- | --- | --- |
| FullStory | `05525bb4-592d-49da-a105-7bb55dff9beb` | `09c8c608-53a7-4cb7-8ebb-f82c0d31bd1b` | A/R observed. Geometry hit tests retain a covering chat iframe, so no valid prominence comparison is claimed. Contrast and list violations remain four elements each in both visits. |
| IKEA | `f9f5df51-c0e0-442d-8409-b4ef2a6aa01d` | `b3aa4074-6fd8-440c-84b2-2a7e6aa99b8c` | A/R/O observed. Approved, document-bound near-identical button comparison is now Observed and score-neutral. List violation remains two elements. Preference dialog binding remains limited in this live variant. |
| Georgia Tech | `1210b440-ae46-4b9a-9653-0b1a562a03b9` | `4f4844e2-d0c6-4779-8e48-dfd69218cbe1` | Initial recovery lost its DOM identity. Verification retains matched identity, banner/Reject and prominence Observed. Two unnamed links persist in both WCAG audits. Three classified requests after a verified Reject click support the existing review policy; refusal registration remains unconfirmed and is stated explicitly. |
| HubSpot | `69aff51c-73d3-4b09-9cee-3c5cc35dd9c7` | Not created: daily allowance exhausted | Initial consent recovery has the same missing-DOM-identity defect. Fixed capture/materializer paths are covered by deterministic tests and the Georgia Tech live recheck; a fresh HubSpot recheck is still outstanding. WCAG retains contrast 9, frame title 1, list item 2 and nested interaction 3 elements. |
| Weather.com | `9640df84-c554-450b-ae4e-96c5d392e9ab` | Not repeated | CMP capture remains insufficient, preference inspection cancelled, WCAG explicitly limited by changing frames. No fabricated control absence or zero-issue accessibility pass. |

Reports: `http://localhost:3000/scan/<scan-id>`. These are simulated sharded local
runs on the local network path, not a verification of production regional egress.
Initial coordinator elapsed times were 14.6–23.3 seconds; completed follow-ups
13.4–18.1 seconds. Independent lane durations overlap and must not be added.
Live visits can vary; status changes alone do not establish causation.

## Fixes

1. **Retain recovery-session DOM identity.** Move the existing loader read ahead of
   the DOM text capture, bracket DOM/inventory/geometry with the same two existing
   checks, and attach the verified loader identity to the DOM snapshot only when
   recovery completes. No extra CDP read, navigation or wait. Recovery never borrows
   an earlier session's image.
2. **Preserve consent-lane ownership.** When successful usable lane evidence has
   matching observation, DOM and geometry identities, use both its URL and token.
   A later runtime-session DOM at the same URL must not overwrite its loader.
   Missing, malformed or mismatched bindings still fail closed. Historical
   persisted assessments and original artifacts were not rewritten.
3. **Surface verified neutral visual comparisons.** Comparisons without the
   Accept-styling asymmetry signal previously disappeared before normalized concern
   construction. A separate `consent.visual_comparison.observed` concern now passes
   exact persisted-assessment comparison through concern policy as internal-only,
   checklist-neutral and score-neutral. CMP Details can show Observed for the
   narrower comparison criterion, retaining measurements. Material disadvantage
   still uses the existing prominence/materiality policy; this is not a compliance
   conclusion or a new positive score effect.
4. **Require FullStory product evidence.** Version the canonical resolver as
   `certscore-vendor-resolver-2026-10-14-fullstory-endpoint-v1`. Require a product
   endpoint pattern or a recognized storage signature; ordinary FullStory home,
   font, SVG and application asset requests no longer inherit session-replay
   purpose merely from their hostname. Endpoint patterns are anchored to the URL
   path, so query text cannot substitute. Retained replay excludes 38 incorrectly
   attributed rows and preserves seven product-specific rows. The new FullStory
   packet contains no `www.fullstory.com` website-asset attribution to replay.
   This replay does not rewrite old evidence or reconstruct a historical score.
5. **Explain click-only review accurately.** The checklist's generic definition
   previously obscured a valid `reject_click_tracking.v1` review. Use the existing
   policy outcome's request/timing explanation, label it Tracking after Reject
   click, and explicitly state unconfirmed refusal registration. Existing
   eligibility, scoring and the separate confirmed-refusal path are unchanged.
6. **Bound registered OneTrust dialog inspection.** When `aria-controls` is absent,
   a canonical registered Options selector may bind only to one existing hidden
   OneTrust preference node. Require the same connected node after the one
   authorized click. Already-visible, missing, duplicated, replaced or incorrectly
   labelled targets remain limited, without Save/choice changes or API opening.
   Deterministic standard-layout fixtures pass. IKEA's live variant still does not
   establish this binding; no broader capability claim is made.

## Evidence allocation and safety

IKEA's verified pair used the existing 2,000 ms screenshot finalization allowance
although inventory remained partial. The priority-100 geometry image completed
review approximately 449 ms after finalization began; a separate lower-priority
image missed its 75 ms finalization and remained withheld. Original-byte hashes,
loader tokens and withheld-file deletion were checked. Review completion after
withholding does not make an image available.

WCAG still evaluates the full configured rule set and preserves full rule-element
counts. Representative example limits do not reduce findings. HubSpot retained
five examples for nine contrast elements; its combined violation/manual-review
example accounting recorded 52 matches, 16 examples retained and 36 omitted.
FullStory, IKEA and Georgia Tech retained identical violation counts and identical
example accounting across their two completed visits. Weather's changed-frame
failure remains explicit with unknown evaluated totals.

No timeout, lane count, model-call count or approved maximum compute envelope was
increased. OneTrust inspection remains within the previously approved preference
inspection scope/allowance, and screenshot handling remains within the approved
2-second allowance. One-time local scan/diagnostic expenditure is estimated below
$1. There is no new recurring budget or production deployment in this exercise.

## Validation

- Original producer bytes verified against terminal SHA-256 metadata; one terminal
  completed result per completed scan; typed bundle parsing; report/export CMP
  status parity; retained-image hash/document checks and withheld-image deletion.
- Eight saved reports, 24 CMP/accessibility/policy selected-section API export →
  pagination → SDK reconstruction checks, preserving displayed evidence and refs.
  This verifies the shared export/reconstruction path, not a production MCP call.
- 81 focused assessment, visual-flow, post-refusal and CMP projection tests passed.
- 15 preference/recovery fixture tests passed, including unchanged DOM/geometry
  binding and ambiguous/hidden/replaced/missing dialog negatives.
- 159 vendor/known-CMP registry tests passed; package build and web typecheck passed.
- Broader boundary suite: 160 passed, one pre-existing failure in the policy/runtime
  missing-bridge audit-only candidate test. Reproduced the same `0 !== 1` failure
  with unchanged HEAD normalized-concern and concern-policy sources. It is outside
  this change; the broader suite is not reported as fully green.
- Final calibration registry and `git diff --check` passed. Actual IKEA CMP table
  checked in the browser with Observed badge, near-identical measurements, compact
  evidence control and copy icon.

Ignored receipts, producer artifacts, source metadata, submission guards, logs,
SDK checks and the local review screenshot are under
`artifacts/cmp-depth-20261014/`. No raw cookie values or credentials were added to
tracked documentation.
