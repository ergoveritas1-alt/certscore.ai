# CertScore.ai retained-evidence CMP library expansion

## Result

The October 27 follow-up adds passive recognition for CIVIC Cookie Control,
Piwik PRO consent forms, WPConsent, Shopify Customer Privacy and Klaro. It also
extends Ensighten Privacy to its exact reviewed Accept/Reject IDs and CookieHub
to the reviewed `.ch2-container` and `.ch2-dialog` roots.

All recognition remains in the canonical shared CMP registry and vendor
resolver. The existing runtime pass already reads exact registry markers. New
entries append to the shared registry, retain existing limits, and contain no
action recipe, preference-opening scope or decision decoder. Shopify's new
consent-management service reuses its existing corporate/vendor identity and
has a distinct service identity. Resolver attribution advances to
`certscore-vendor-resolver-2026-10-27-cmp-expansion-v19`.

## Retained replay

The source cohort is the prior month-long Mac mini review of completed actions
whose exported CMP identity was missing: 510 actions, 333 distinct source
reports, 488 initially unconfirmed actions. All source hashes and scan IDs were
rechecked. This is a replay of retained export markers, not a reconstruction of
the original action session or a fresh scan of the sites.

| Added recognition | Additional unconfirmed actions | Distinct sites |
| --- | ---: | ---: |
| CIVIC Cookie Control | 13 | 8 |
| Ensighten Privacy | 8 | 4 |
| Piwik PRO Consent Manager | 8 | 5 |
| Shopify Customer Privacy | 6 | 3 |
| WPConsent | 5 | 3 |
| Total, deduplicated | 40 | 23 |

These are additional to the preceding CookieScript/Complianz/CookieHub work.
Klaro and CookieHub root recognition pass local capture tests but add no newly
identified action in this export cohort. A provider marker does not establish
that consent was saved, that a control is actionable or that a choice was honored.
No historical report, score, registration result or audit checkpoint was changed.

## Selection and unresolved markers

The review ranked recurring markers by distinct sites and required reviewed
specificity before adding a match. Exact branded IDs are preferred to short
classes, generic cookie names or vendor-domain ownership.

The remaining ranking includes generic `button-group` and `actions` containers
(seven sites each), `cc-compliance` (six), `cn-buttons` (five), `ch2-dialog-actions`
(five still unidentified), generated styling classes, and other custom controls.
`cn-buttons` appears in Klaro source, but that short class alone is not enough to
name Klaro. CookieHub's reviewed root does not authorize treating every `ch2-*`
class as CookieHub. Forked cookie-consent libraries may share `cc-*` classes.

The `securitiCmpCookiePrefBtn` cluster is a five-site review lead. The reviewed
upstream Securiti flyout rule does not validate that exact marker, so it remains
unmatched pending stronger source evidence. Generic `ez-cookie-notification`
controls likewise remain unassigned. This avoids trading unknowns for guessed
vendors.

Piwik PRO's current documentation explicitly allows its `ppms_privacy_*` cookie
with other consent tools. That cookie and generic Shopify globals/commerce
cookies are therefore excluded as standalone identities for these new entries.
Recognition of Piwik's explicit branded consent-form DOM is separate from a
claim about which application supplied the consent decision.

## Source review

Provider documentation and published source were cross-checked with the upstream
DuckDuckGo Autoconsent detection library, pinned at commit
`411524e21188fb260838fb411c9e65de0de4c254`. Only reviewed identity facts are used;
none of that library's clicking, waiting, hiding or state-changing rules is loaded
or executed. There is no new dependency or online lookup during scans.

- CIVIC: https://cookiecontrol.com/docs/v9 and the documented
  https://cc.cdn.civiccomputing.com/9/cookieControl-9.x.min.js source.
- Piwik PRO's published form:
  https://piwikpro.github.io/ConsentManager-CustomConsentFormExample/implementation-guide.html
  and its cookie distinctions:
  https://help.piwik.pro/support/privacy/cookies-created-for-visitors-by-piwik-pro/.
- WPConsent: published WordPress plugin source and
  https://wpconsent.com/docs/how-to-customize-the-wpconsent-banner-with-css-variables/.
- Shopify: https://shopify.dev/docs/api/customer-privacy and the pinned
  `rules/autoconsent/shopify.json` detection/control identifiers.
- Klaro: https://github.com/kiprotect/klaro, including its published notice and
  root stylesheet; short notice classes remain insufficient.
- CookieHub: pinned `rules/autoconsent/cookiehub.json`, cross-referenced with
  https://docs.cookiehub.com/reference/data/cookies-and-storage.
- Ensighten: the already-retained October 23 Volkswagen Bootstrap source contains
  the exact `ensAcceptAll` and `ensRejectAll` IDs. No site was revisited.

Downloaded source is retained for inspection only, with URL/hash receipts. No
external source code was executed. Failed source fetches were not bypassed.

## Validation and limits

All 247 vendor-resolver tests and 72 selected shared/CMP/browser/release-gate
tests pass: 319 total. The latter includes 13 passive loopback capture cases,
positive and prefix-collision controls, generic-marker negatives, unchanged
action-recipe eligibility, repeated existing Accept/Reject behavior and fast/full
gate selection. Shared, vendor-resolver and scan-core package typechecks pass;
the changed test files also pass a strict standalone TypeScript check.

The first new vendor-test run used the wrong spelling of the resolver's existing
`unrecognized` status; the assertions were corrected and the complete vendor
suite passed. No runtime behavior was changed to satisfy those assertions.
The full release preflight remains pending. Local replay and fixture success do
not establish production improvement.

Estimated incremental recurring cost for this extension is below $0.20/month at
100,000 scans, as disclosed before implementation; the two library increments
combined remain below $0.95/month. This is an engineering estimate for bounded
matching/metadata at the retained cohort frequency, not a measured AWS bill.
No extra invocation, wait, model call, worker capacity, retention period or paid
lookup was introduced. Local work incurred no paid cloud usage.

No deployment, flags, new public scans or historical rewrites are included.
Ordinary production evidence, bound to the eventual deployed revision, must
verify any later coverage benefit. Existing audit state remains unchanged.
