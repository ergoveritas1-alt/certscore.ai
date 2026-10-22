# Offline GPP decoding and request consistency

Owner-authorized implementation and retained-evidence replay, October 21, 2026.
This extends GPC qualification locally. No deployment, production report rewrite,
new capture or Options/Manage opening is authorized.

## Versioned flow

The producer records `gpc_sale_sharing_evidence.v2` with a request-local
`gpp_request_decode.v1` observation. WC01 applies
`california-gpc-response.v7-gpp` through the existing persisted typed assessment
-> normalized concern -> concern policy -> unified finding -> California score,
API and Admin count projections. The approved recipient schedule and shared
47-point cap are unchanged. EU, Reject and explicit opt-out scoring are unchanged.

Historical `gpc_sale_sharing_evidence.v1` retains v6 interpretation, including
its undecoded-GPP neutrality; observations without request qualification retain
v5. Reading an old assessment does not invoke the decoder or reclassify it.
Explicit local replays retain original worker hashes and separate new outputs.

## Decoder and bounds

Use the official IAB `@iabgpp/cmpapi` dependency pinned to 3.2.0. Instantiate only
the pure HeaderV1, UsCa and UsNat codecs. Do not instantiate CmpApi, call browser
APIs, open a CMP, send a decoding request to an external service or retain new
raw strings. A header preflight bounds Fibonacci range expansion before the
reference decoder sees the header. Selected US sections are decoded directly;
unrelated TCF/vendor sections are not expanded or interpreted.

Limits: existing URL/field caps (16,384 characters, 256 fields), GPP string 4,096
characters, header 128 characters, 32 header section IDs no larger than 63, eight
applicable IDs (128 characters before splitting), and two supported selected sections. Support California section
8 version 1 and US National section 7 versions 1/2. Unsupported scopes/versions,
limits, duplicate parameters, missing/empty strings, absent applicable sections,
invalid fields and noncanonical encodings remain neutral. Re-encode fresh objects
and compare exact bytes, because the reference decoder alone accepts some
noncanonical padding. Never retain dependency exception text containing inputs.

Each new qualification row includes the bounded decoder version, status,
declared/header section IDs, selected sale/sharing/targeted-advertising opt-outs,
service-provider mode, explicit GPC or null, consistency and fixed diagnostic
codes. Missing GPC is unknown; it is not false. At most the existing 100 verified
advertising-collection candidates per visit receive canonical qualification.
The artifact-only cohort audit may inspect all already-retained GPP requests;
it cannot create findings from requests missing canonical collection proof.

Payload and applicability validation retain independent diagnostics: an empty
`gpp` does not hide an empty or invalid `gpp_sid`, and valid applicable IDs remain
retained even when the payload is missing. Both parameters remain request-local;
never fill missing values from a sibling request or an earlier/later CMP state.
This diagnostic refinement creates no new qualification or score effect.

## Consistency and scoring

- Require the request's applicable section IDs to exist in the decoded header and
  all selected supported sections to decode. A header-only string naming section
  8 in `gpp_sid` does not contain California opt-out data.
- Compare decoded sale choice with a valid same-request IAB US Privacy declaration.
  Conflicting known choices remain unresolved, with no scoring promotion.
- Compare known choices in simultaneously applicable US National/California
  sections. A not-applicable value does not automatically contradict a known one.
- Preserve explicit opt-out and service-provider declarations as neutral request
  evidence. A declaration does not prove honoring or a private contractual role.
- A GPP GPC=false field despite verified delivered GPC is a propagation diagnostic;
  it is not an automatic deduction and cannot erase otherwise eligible identified
  collection when no restriction was declared.
- CMP comparisons use verified same-document worker state. Compare choices as
  simultaneous only at the exact same producer timestamp; otherwise retain
  earlier/later/unavailable explicitly. A later terminal readback does not prove
  what the CMP declared when an earlier request was sent. Simultaneous conflicts
  remain neutral. No fuzzy time matching or cross-session fallback is permitted.
- Valid, consistent GPP with no restrictive declaration may allow existing
  independently verified identity/audience collection to qualify. Decoding alone
  does not establish a recipient or positive collection. Generic ad requests and
  opaque payloads remain unresolved. Invalid/missing GPP cannot create a finding.
- Preserve the existing verified CMP-acknowledgment/applicable-opt-out-off initial
  effect. Request-level propagation diagnostics do not substitute for that proof.

Canonical request selection independently rechecks decoded state restrictions;
a missing derived processing flag cannot promote a declared opt-out. Public API
validation uses the same typed selection; generated OpenAPI/SDK types preserve it.
Customer reports retain factual evidence without deduction explanations.

## Frozen cohort result and cost

All 47 scans replay successfully; 609 original artifacts rehash and size-verify.
All 47 parent assessments, GPC public API payloads and Admin score/count projections
validate. There are zero additional GPC deductions or recipients: 11 eligible
scans, 17 scan–entity pairs, seven unique recipient identities. All CA/EU scores
and Reject assessments/deductions are unchanged; 38 reportable scans retain both
scores and nine no-go attempts remain no-go outcomes.

The full retained audit finds nine requests with GPP parameters across DZone and
ListChallenges: five valid California opt-out declarations with GPC=true, three
header-only strings naming an absent California section, and one empty GPP value.
Four requests are canonical collection candidates, including the empty value;
none adds eligibility. The audit and per-scan results are retained in
`artifacts/gpp-offline-replay-2026-10-21/`.

No browser visit, invocation, lane, wait, retry, model call, Options opening,
worker-size or retention increase. Estimated incremental bounded decoding and
metadata cost is below $0.50/month at 100,000 scans/month, within the below-$1
preapproval; measured sizes/timing are in the verification artifact. The dependency
is local and has no paid-service usage. No SDK package is published by this task.

## Primary sources

- [IAB reference implementation, pinned release 3.2.0](https://www.npmjs.com/package/@iabgpp/cmpapi/v/3.2.0)
- [IAB reference encoder and fixtures](https://github.com/IABTechLab/iabgpp-es)
- [GPP sections and applicability](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Sections/Section%20Information.md)
- [IAB US Privacy v1 string](https://github.com/InteractiveAdvertisingBureau/USPrivacy/blob/master/CCPA/US%20Privacy%20String.md)
