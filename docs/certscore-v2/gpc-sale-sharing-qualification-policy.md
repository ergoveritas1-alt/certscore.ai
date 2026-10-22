# GPC sale/sharing qualification

The owner subsequently approved [offline GPP decoding and consistency checks](gpp-offline-decoder-policy.md)
under `gpc_sale_sharing_evidence.v2` / `california-gpc-response.v7-gpp`.
The v1/v6 rules and replay below remain historical context, without silent upgrades.

Owner-authorized local implementation and replay, October 21, 2026. This narrows
GPC recipient eligibility for new observations. It does not authorize deployment,
production report rewrites or changing the explicit opt-out or Reject policies.

## Objective and limits

California's opt-out preference signal addresses sale/sharing of personal
information, including cross-context behavioral advertising. A non-essential
cookie, advertising vendor, successful ad request or identifier alone does not
establish a statutory sale/sharing violation. Service-provider processing,
contextual advertising and restricted processing need separate treatment.

The CertScore.ai score remains an evidence-based risk indicator. It does not
determine operator applicability, private contractual terms or actual downstream
use. Recipient counts and the approved 15/25/32/37/40/43/45/47 schedule remain
unchanged. GPC affects California posture only; EU/Reject scoring is unchanged.

## Versioned retained facts and canonical assessment

New producers retain `requests.advertisingCollectionQualification` under
`gpc_sale_sharing_evidence.v1` in the existing bounded observation. Each row
binds exactly to an existing successful, source/session/document-bound advertising
collection request and canonical recipient. The scanner records a closed activity
role, rule basis and request-local processing signals; it assigns no points or
legal conclusion. At most the existing 100 attributed collection rows are assessed.
No raw identifier, cookie value, encoded GPP string or additional request payload
is retained in the qualifier.

WC01 applies `california-gpc-response.v6-sale-sharing` through persisted typed
assessment -> normalized concern -> concern policy -> unified finding -> score,
API, report and Admin Scans. Public API validation and Admin GPC# use the same
typed qualification selection. The raw collection counts, factual findings and
comparison remain available independently of scoring. Customer reports do not
explain deductions. Historical records without this qualifier keep v5 semantics;
new source-bound replays are explicit artifacts, not silent historical upgrades.

## Request qualification

Supported activities are closed identity-resolution/synchronization protocols,
audience membership collection and identified advertising collection on exact
reviewed vendor endpoints. Examples include DoubleClick advertising-feature
collection with a client identifier, Google remarketing with a visitor identifier,
LinkedIn Ads ID collection, Microsoft UET visitor collection, Adobe/Criteo identity
mapping, Lotame mapping and OpenX ESP identity resolution. Known identity-protocol
requests can initiate mapping without a visitor identifier in the query string;
their attribution is to the protocol, not a claimed completed match.

Generic GPT/AdSense ad delivery, lookup HTML, pagead/id, unknown paths and payload
field names alone remain unresolved for this policy. Publisher/account IDs,
random/correlator, page-load IDs, screen metadata and an opaque POST body do not
establish a qualifying visitor identity. No body decompression or new collection
is introduced. Existing response, Sec-GPC, representative access, exact endpoint
attribution, original-byte hash and session proof requirements remain mandatory.

The following retained request-local signals make that request neutral:

- Google `rdp=1`, `npa=1` or `ltd=1` on supported Google domains.
- Meta `dpo=LDU` or `data_processing_options=["LDU"]` on the pixel endpoint.
- Valid IAB US Privacy v1 with sale opt-out `Y` in character 3, including `1NYN`.
- Nonempty GPP strings without a supported decoder; presence is not a decoded
  opt-out and no section values are guessed.
- Duplicate or invalid processing declarations.

These signals do not prove honoring, establish actual service-provider status or
erase separate unrestricted qualifying requests. Absence of a restriction flag
does not by itself qualify a request. CMP-readback contradictions remain a
separate verified basis for the initial 15, with zero invented recipient IDs.
An unresolved request cannot add an initial effect or recipient increment.
Deduplicate supported canonical entities across eligible requests and union with
the unchanged explicit opt-out family before applying the shared cap.

## Replay and budget

All 47 frozen scans were replayed from verified retained bytes. The 609 original
artifacts remain unchanged. Eleven scans still have qualifying GPC deductions;
scan-recipient pairs decrease 21 -> 17. DZone changes 5 -> 2 recipients and
40 -> 25 points (California 57 -> 72). Seiska changes 3 -> 2 and 32 -> 25
(California 65 -> 72). The other nine eligible scans are unchanged. All EU and
Reject results remain unchanged; all 38 reportable visits retain EU and CA scores.
The nine no-go attempts remain no-go outcomes.

The change uses only bounded in-memory inspection of existing request URLs. It
adds no browser visit, invocation, wait, retry, model call, Options/Manage click,
SDK show/open call, worker size or retention extension. Additional processing
and retained metadata are estimated below $0.50/month at 100,000 scans/month,
within the below-$1 preapproval. Actual cohort sizes and verification results
are recorded in `artifacts/gpc-sale-sharing-qualification-2026-10-21/`.

## Primary sources

- [California regulations effective January 1, 2026, §§7025, 7050–7051](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf)
- [Google restricted processing and GPC](https://support.google.com/adsense/answer/14182916?hl=en)
- [Google restricted-processing request parameter](https://support.google.com/adsense/answer/9598414?hl=en)
- [Google non-personalized ads](https://support.google.com/adsense/answer/9007336?hl=en)
- [IAB US Privacy string specification](https://github.com/InteractiveAdvertisingBureau/USPrivacy/blob/master/CCPA/US%20Privacy%20String.md)
- [LinkedIn Ads ID](https://www.linkedin.com/help/lms/answer/a515671)
- [Lotame identity mapping](https://my.lotame.com/t/83h7t0k/user-id-syncing-with-lotame-on-the-web)

Declarations are assessed conservatively as evidence limitations. They are not
certification of a vendor's behavior or a finding that a site honors GPC.
