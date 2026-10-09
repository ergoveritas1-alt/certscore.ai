# Fresh localhost consent-path verification

Implemented locally on October 8, 2026; **not deployed**. This is focused live
observer verification, not a completed release gate or a six-lane production
report. Eleven additional public sites were visited using fresh independent
passive consent, Accept and Reject sessions. Targeted diagnostics/rechecks bring
the run to 19 parent contacts. No form was submitted. The preceding Termly check
is recorded separately in the release notes.

All browsers ran locally with ConsentCheckBot HTTP identity and native Chromium
navigator identity. Locale/timezone were en-IE/Europe-Dublin, but network egress
was local California; these visits do not establish EU production behavior.
Original typed packets were schema-validated and SHA-256-bound shared projections
retained. Closing-state diagnostics are investigative context, not replacement
registration evidence. No display, finding-policy or score fallback was added.

## Defects repaired

1. Accept silently retained only 24 recipes from a 25-recipe canonical registry,
   dropping Transcend. Both observers now share the existing Reject capacity of
   25 and explicitly reject overflow before browser execution. A local full-registry
   fixture reproduces the defect; fresh Notion Accept and Reject now both confirm.
2. The Transcend state reader unnecessarily invoked cross-domain `airgap.sync()`
   before its synchronous local `getConsent()` read. It now performs only the
   local read. A nonresolving-sync fixture verifies that no sync is invoked.
   This was a separate defect, not the cause of Notion's dropped recipe.
3. The canonical label registry lacked Finnish `Kiellä kaikki` (deny all).
   Registry v9 adds an exact, consent-context-bound Reject term. Aalto's fresh
   Reject now confirms; a subsequent fresh pair confirms both paths. Local
   full-registry Finnish fixtures confirm exactly one click per path and withhold
   fully transparent controls.

The preceding Termly repair also remains in this branch: documented category
events, complete state validation and dispatch-bound freshness. It was verified
against a separate live Termly target before this expanded run.

## Live results

| Site | CMP observed | Accept | Reject |
| --- | --- | --- | --- |
| mojohost.com | CookieYes | Confirmed | Confirmed |
| notion.site → notion.com | Transcend | Confirmed after repair | Confirmed |
| aalto.fi | Cookiebot | Confirmed | Confirmed after Finnish repair |
| mailerlite.com | Cookiebot | Confirmed | No Reject action: control is privacy opt-out |
| blick.ch | OneTrust | Confirmed via TCF | No first-layer Reject found |
| cimediacloud.com | OneTrust | Click completed; registration unconfirmed | Click completed; registration unconfirmed |
| hubspot.com | HubSpot | Not attempted: transparent scope | Not attempted: transparent scope |
| spotify.com | OneTrust | No first-layer Accept found | No first-layer Reject found |
| qobuz.com | No actionable CMP on local visit | Not attempted | Not attempted |
| larazon.es | No actionable CMP on local visit | Not attempted | Not attempted |
| florencebymillsbeauty.com | No actionable CMP on local visit | Not attempted | Not attempted |

Freenet was excluded by the central blocked state and was not contacted. The
owner's cooldown waiver does not bypass challenge/no-go protection. The four
no-control visits above loaded successfully; absence applies only to those local
sessions and must not be treated as a verified EU control absence.

An intermediate Aalto Accept recheck stopped before clicking because the final
uniqueness check no longer found an actionable control. Another fresh pair
confirmed both decisions. Do not hide that transient failure or claim every visit
is reliable. The Finnish Accept label already classifies correctly; no context
relaxation was needed. HubSpot closing-state diagnostics show its banner ancestor
at opacity zero despite nonzero button boxes. Retain the interaction guard.

## Unresolved OneTrust confirmation coverage

Cimediacloud's global configuration exposes 21 groups, with optional statuses
including `inactive landingpage`; its current receipt contains only four group
flags. A pre-action receipt can also lack the groups field. The existing verified
group policy requires a complete, stable configuration/receipt identity and a
changed complete decision. Those conditions are not met. Accept/Reject completed
clicks and bounded after-click evidence remain retained, with registration
unconfirmed and no invented registration-based finding or score.

Supporting this variant requires authoritative evidence of the current visitor's
configurable group set and a versioned proof for an initially uninitialized
receipt. Do not guess groups from common C0001–C0004 identifiers, banner removal
or the receipt's partial flags. This remains unresolved before a release claiming
complete OneTrust confirmation coverage.

## Verification and operations

- 117 focused classifier, API reader, recipe, OneTrust proof, Termly and repeated
  CMP-action tests passed.
- Two additional Finnish full-registry/browser safety fixtures passed.
- Nine geometry, Cookiebot receipt and action-target guard regressions passed.
- 29 shared CMP registry tests passed (157 focused tests in total).
- Contract build, scanner typecheck, calibration registry validation and diff
  whitespace checks passed. Broad release/preflight gates remain outstanding.
- Successful central contact-history export preceded selection. The owner
  explicitly waived public scan cooldowns; selection receipts retain that reason.
- All 19 contacts were centrally persisted through the repository ECS psql
  one-off with idempotent key `local-consent-path-cohort-20261008`. The run's
  bounded manifest, reviewed ledger and contact receipt are retained here;
  canonical Spotify/HubSpot ledger entries are updated. Other targets remain
  diagnostic inventory, without expanding the canonical registry.
- Estimated one-off ledger export/persistence cost: under $0.10, disclosed before
  execution. No new production lane, model call, image allowance, retention
  policy, retry or deadline was introduced. Existing approved form moderation
  allowance is unchanged.

See `summary.json` for exact run IDs, registration witnesses and paths to local
original packets/projections under `artifacts/local-consent-path-cohort-20261008/`.

## Subsequent full-report readiness check

The follow-up [localhost release-readiness record](../../releases/2026-10-08-consent-release-readiness-local.md) records four complete local scans, shared report/API/MCP comparisons, the approved opacity-settling fix and the local Accept-packet image-handoff fix. Its gate status supersedes this initial cohort's outstanding-gate note; historical live observations above remain unchanged.
