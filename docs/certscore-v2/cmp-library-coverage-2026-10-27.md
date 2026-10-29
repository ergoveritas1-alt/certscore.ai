# CertScore.ai CMP library coverage review — October 27, 2026

The subsequent retained-marker expansion is documented in
`cmp-library-expansion-2026-10-27.md`. The counts below describe this initial
CookieScript/Complianz/CookieHub change; the follow-up adds 40 actions across
23 sites and keeps consent verification separate.

## Local implementation

CookieScript was present in the shared CMP registry but missing from the
canonical runtime vendor resolver. Reviewed CookieScript cookie, global, exact
control/root markers and its bounded CDN script identity now resolve through
the canonical resolver with versioned attribution. The shared registry also
recognizes its exact retained Accept/Reject control selectors.

Complianz recognition uses its published `.cmplz-cookiebanner` and
`.cmplz-buttons` markers. The existing bounded runtime DOM/global pass now uses
exact canonical registry markers, so a reviewed provider does not also need a
scanner-local keyword entry. Existing candidate caps and scan deadlines remain.

CookieHub recognition uses the documented exact `cookiehub` cookie or global.
The recurring `ch2-*` controls were reviewed, but a `ch2-dialog-actions` selector
alone remains unidentified: the retained selector is not enough to establish
provider identity without a reviewed source or corroborating marker.

The new Complianz and CookieHub entries are appended to preserve existing
registry ordering. They add recognition only. This change introduces no action
recipe, SDK setter, consent-state decoder, Options opening or confirmation claim.
CookieScript's existing adapter is unchanged.

Generic `data-testid` and `consent-banner` matches no longer identify
Usercentrics or Termly. The shared `euconsent-v2` protocol cookie remains CMP
infrastructure but cannot name Didomi, Quantcast, InMobi or another provider on
its own. Collision-prone Cookiebot `CookieConsent` matching is case-sensitive;
generic lowercase `cookieConsent` is insufficient. Existing precise markers
remain supported.

## Retained evidence

The review rehashed the source exports for all 510 completed actions in the
previously unidentified cohort, of which 488 were initially unconfirmed across
321 distinct hostnames. All had reported consent surfaces. None establishes
the absence of a CMP.

| Reviewed provider markers | Unconfirmed actions | Distinct sites |
| --- | ---: | ---: |
| CookieScript | 20 | 11 |
| Complianz | 13 | 8 |
| CookieHub | 2 | 2 |
| Combined, deduplicated | 35 | 21 |

These markers resolve in the current local library replay and were missing from
the previous runtime resolver. The replay also rejects 23 generic-selector
Usercentrics matches. The CookieScript count expands the earlier 18-action lead
by reviewing the exact control selectors as well as root/cookie markers.

The 35 actions represent 7.2% of the unconfirmed unidentified cohort. This is
recognition coverage demonstrated on retained marker fields, not a measured
production improvement or 35 newly confirmed choices. Exported baseline markers
do not reconstruct action-session identity. Historical reports, decisions,
scores and the daily audit checkpoint/backlog remain unchanged.

## Library expansion recommendation

Maintain a curated offline extension of the existing canonical library. Prioritize
recurring unresolved markers by distinct sites, then add primary-source-backed
positive and collision/negative fixtures. Store reviewed identity metadata in the
canonical registry/resolver; do not create a separate dashboard lookup.

Keep three capabilities separate: recognizing a CMP, safely exercising a control,
and verifying the resulting decision. Broader recognition improves attribution
and identifies where a future read-only adapter could help. It does not resolve
missing, opaque, incomplete or stale consent receipts. The current retained
evidence supports this bounded expansion, not a wholesale signature import or a
per-scan remote lookup service. Review `ch2-*`-only cases when stronger ordinary
evidence becomes available; preserve their unknown identity in the meantime.

## Sources

- CookieScript: https://help.cookie-script.com/en/articles/30246-custom-functions
  and https://help.cookie-script.com/en/articles/30182-how-to-change-order-of-the-buttons
- Complianz's published banner template:
  https://github.com/complianz/complianz-gdpr/blob/master/cookiebanner/templates/cookiebanner.php
- CookieHub cookies/storage: https://docs.cookiehub.com/reference/data/cookies-and-storage
- CookieHub's published loader: https://github.com/cookiehub-com/cookiehub-js

Primary-source receipts and retained replay inputs/results are saved in
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T215504Z-manual-cmp-library`.
No cohort website was revisited; browser fixtures run on loopback only.

## Validation

- All 245 vendor-resolver tests pass, including stable attribution identities and
  positive/negative provider signatures.
- All 46 selected CMP, shared-registry and loopback regressions pass, including
  existing repeated Accept/Reject actions and the four new passive capture cases.
- All 15 release-gate tests pass. The initial combined run exposed an inherited
  relative tsx configuration path in a temporary-checkout test; its child process
  now receives an absolute path, and the complete gate-test file passes.
- Shared, vendor-resolver and scan-core package typechecks pass. The three new
  test files also pass a separate strict TypeScript check.
- All 510 retained action rows were replayed after source SHA-256 and scan-ID
  verification. No report or registration outcome was rewritten.

These are targeted local checks. They do not replace the pending complete
release preflight or ordinary production verification.

## Cost and release limits

Estimated incremental recurring cost is below $0.75/month at 100,000 scans,
as disclosed before proceeding. This is an estimate for bounded local matching
and metadata at the observed low provider frequency, not a measured AWS bill.
It adds no paid lookup, model call, scan, wait, worker capacity or retention period.
Existing Accept diagnostic estimates remain separately documented. Local retained
replay and loopback tests incur no additional paid cloud usage.

No deployment, flag change or historical rewrite occurred. The exact future
release candidate still requires its full applicable preflight and separately
authorized AWS promotion. Ordinary production scans must verify any subsequent
coverage improvement with deployed revision and original evidence binding.
