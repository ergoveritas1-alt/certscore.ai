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
