# Native browser identity with authenticated crawler transport

The October 6, 2026 owner request requires ConsentCheckBot identification while
capturing a fresh visit without accepted consent. Production Lambda browser
contexts use `native_navigator_crawler_http.v1` through the shared Chromium
context configuration and existing Web Bot Auth route. This is an upstream
capture change; it adds no scoring rule or report inference.

## Configuration and capture

`CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT` identifies ConsentCheckBot on outgoing
HTTP requests. The local equivalent is `CERTSCORE_HTTP_USER_AGENT`. When either
is set, Chromium supplies its native `navigator.userAgent`, including in child
frames and workers. No navigator getter is patched. Legacy
`CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT` / `CERTSCORE_CHROMIUM_USER_AGENT`
remain supported when the new HTTP identity is absent; they are ignored for the
browser context when the HTTP identity is present.

The shared context sets the HTTP header and the existing request route explicitly
preserves it across redirects. Language, locale, timezone, GPC injection, network
guards, signing, action authorization and fresh isolated contexts are unchanged.
Unsigned local verification installs the same transport route without claiming
that requests were authenticated. Enabled Web Bot Auth still fails closed without
its signing configuration. HTTPS signatures retain their canonical authority and
Signature-Agent components.

The repository AWS deployment helper applies and verifies the HTTP identity in
all existing base and inventory Lambda functions in the three approved regions.
Runtime diagnostics separately expose the HTTP identity, native browser mode,
and whether a browser user-agent override is effective. A retained legacy Lambda
variable does not override the native browser mode during configuration migration.

## SITS verification

SITS's public Borlabs configuration enables `cookiesForBots`. Its browser runtime
checks `navigator.userAgent` against bot terms and calls `saveConsentAll()` when
that condition holds. Passing ConsentCheckBot as Playwright's `userAgent` exposed
the bot identity to this rule and made a fresh browser automatically accepted.
The absence of a scanner click did not prove unaccepted consent.

Owner-requested local captures on October 6 verified the new identity path:

- The fresh consent-proof context started with zero cookies. Its document and
  observed child requests identified ConsentCheckBot over HTTP; navigator used
  native Chromium. No consent action ran.
- Borlabs's read-only `hasConsent` API returned false for every configured
  service, including Hotjar, LinkedIn and HubSpot.
- Typed consent inventory identified Accept all, Accept essential cookies and
  Individual preferences. The representative screenshot showed the live banner.
- The independent bounded runtime visit observed no Hotjar, LinkedIn or HubSpot
  form-loader requests and no HubSpot forms. The consent-proof visit completed
  in about 3.2 seconds; the runtime visit in about 2.7 seconds.

Local evidence is retained under ignored `artifacts/sits-native-preconsent-20261006/`.
Earlier actual form images under `artifacts/sits-form-verification-20261005/`
belong to the auto-accepted bot visit and must not be relabeled as unaccepted
evidence. The historical production scores of 100 and 56 are not repaired by
changing capture configuration. A fresh canonical scan must determine its score.

HTTP identification remains visible to the server. This change avoids the
confirmed navigator-based shortcut; it cannot force a server to treat a crawler
as an ordinary visitor. Any known automatic grant still requires honest upstream
evidence and canonical eligibility treatment, never a display relabel.

## Cost and verification

Estimated incremental recurring infrastructure cost for this configuration
change is $0/month: production reuses its signing route, existing contexts,
capture windows, lanes, invocations, retention and capacity. Observed request
volume may differ when the site stops auto-granting consent. There is no added
model call, rescan, retry, timeout or coordinator tail.

Focused real-browser tests verify empty isolated baseline/GPC contexts, a bot
auto-grant fixture, document redirects, child HTTP identities, unchanged GPC
delivery, and cryptographically valid HTTPS Web Bot Auth signatures. Legacy
configuration and bounded Lambda diagnostics have separate regression coverage.

Production capture of forms that appear only after Accept is a separate feature.
It is not implemented or cost-approved by this identity change. Such images must
retain their actual after-Accept provenance and remain separate from pre-consent
runtime scoring.
