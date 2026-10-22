# Bounded post-Reject body/header proof and recipient prioritization

Owner-authorized local implementation, October 21, 2026. This extends observed
request capture, not the California recipient schedule, EU Reject rule or legal
interpretation. No deployment or historical rewrite is authorized.

## Request proof v2

Fresh Reject workers retain `california_reject_request.v2` with
`bounded_ca_request_proof.v1`. Preserve v1 observations with their original
interpretation. All facts come from the same already-issued browser Request and
Response; no browser navigation, Options/Manage action, request replay, model call
or observation-window extension is added.

Inspect at most 32 KiB of an existing POST body, 128 combined query/body fields,
64 headers of at most 8 KiB each, and 96 cookie names within that header limit.
Support bounded form encoding and flat JSON scalar objects. Require complete
body/header proof for v2 qualification. Unsupported/nested formats, escaped or
duplicate JSON keys, duplicate combined fields, malformed encoding, missing
transport bytes, compression, unsupported content types and limits stay neutral.
Unknown body fields are not assumed harmless. Full same-Request header readback
may complete asynchronously inside the existing observation window; failed,
pending or late readback cannot be filled from configured headers or cookies.
Publication never waits longer for it.

The producer keeps body/header hashes, fixed dispositions/reasons and at most
eight known identifier field/cookie names with value hashes. Raw bodies, cookie
values, authorization values and GPP strings do not enter the new evidence.
Request ID, method, time, origin/path, original URL hash and same-Response status
remain bound through the existing source packet, persisted assessment and
canonical concern/policy/finding pipeline.

The reviewed LinkedIn advertising endpoint `/wa/` may use the same explicit
advertising-ID fields as `/collect` when observed in the exact query/body, or
known advertising cookies (`li_fat_id`, `li_sugr`, `lms_ads`) actually sent on that
Request. Retain original names and sources; never relabel a cookie as a query or
body parameter. This is an explicit Reject-inspection context; default GPC URL
qualification is unchanged. Security/routing cookies (`bcookie`, `lidc`,
`__cf_bm`) cannot establish advertising identity. An explicit unresolved
`BizographicsOptOut` cookie or nonstandard privacy/consent header remains neutral.

HubSpot's exact tracking endpoint may retain diagnostic request/identifier facts,
including `vi`; ordinary analytics or a persistent analytics identifier does not
become California advertising/sale-sharing evidence. Existing GPC processing
restrictions and offline GPP interpretation also apply to body fields. A declared
restriction or unresolved payload cannot be erased by finding an identifier in
another source. Opaque response-cookie setters do not prove browser acceptance.

## Existing budgets and distinct recipients

Share the existing 48 total measurement/header inspection slots, preserving the
16-slot pre-click ceiling and at least 32 post-click slots. No second allowance
or retry is introduced. The final eight slots are reserved for unseen post-click
canonical recipients until eight recipients have been observed; duplicate or
unattributed traffic cannot consume that reserve. A measurement and California
inspection of the same request consume one slot and share one `allHeaders` call.

Keep the 32-request retained California proof cap. Prefer a successful,
unrestricted, fully inspected proof per distinct entity before filling spare
slots with duplicate or limited evidence. A later restricted request cannot evict
an earlier unrestricted proof merely because it is newer. Existing overall
request-retention/drop limits remain authoritative; this is bounded coverage,
not a claim to capture every request under arbitrary traffic.

Estimated incremental bounded CPU/storage is below $0.50/month at 100,000 scans
with existing retention, within the below-$1 preapproval. No lane, invocation,
worker size, paid service, model call, wait or retention period is increased.
The new metadata and live-fixture cost are local diagnostics only; source replay
never contacts the original sites. A fully intercepted Chromium fixture tests
same-Request POST/header binding without visiting a public site.

## Replay and remaining limits

The 47-scan retained replay cannot recover original POST/header bytes that were
never retained. Historical requests remain unchanged and no new California
recipients/deductions qualify. CA/EU/GPC/GPP/Reject results remain unchanged.
Fresh scans after separately authorized deployment are required to measure the
new capture's coverage. Unsupported body schemas and undecoded consent receipts
remain explicit limitations; no generic legal or identity inference is made.

Primary references for closed LinkedIn identifier selection:

- [LinkedIn Cookie Table](https://www.linkedin.com/legal/l/cookie-table)
- [LinkedIn Insight Tag identifiers](https://www.linkedin.com/help/linkedin/answer/a520391)

## LinkedIn encoded website-action bodies — October 22, 2026

The owner requested a fix and one fresh Ovid rerun within existing budgets and
without Options panels. New `bounded_ca_request_proof.v2` supports the reviewed
LinkedIn `https://px.ads.linkedin.com/wa/` POST envelope: `fmt=g` is canonical
base64 of gzip JSON, `fmt=b` is canonical base64 JSON and `fmt=a` is JSON. The
format was traced in the [vendor's published Insight script](https://snap.licdn.com/li.lms-analytics/insight.min.js).
This is endpoint-specific decoding of already-issued bytes, not request replay.

Both encoded input and decompressed output are capped at the existing 32 KiB.
The existing 128-field allowance includes nested object members, array elements
and query fields, with depth capped at eight. Reject malformed/noncanonical
base64, invalid gzip/UTF-8/JSON, duplicate decoded keys, query/body collisions,
prototype keys, unknown fields, unreviewed nested structures and expansion beyond
the cap. Supported closed event shapes cover page visits, dwell metadata and
click DOM context. DOM strings, publisher IDs, page/request/session IDs and
`liGiant` are not advertising-identifier evidence. Unreviewed payloads remain
neutral. The existing MIME, full-header, processing-signal, response, timing and
source/control/ancestry gates still apply.

The exact root `liFatId` field maps to LinkedIn's existing first-party advertising
identifier role for this decoded envelope only. Retain its original spelling and
body source with a value hash; do not relabel DOM values, query aliases or page
IDs. Root supported processing declarations enter the existing request-local
qualification and offline GPP checks; restrictions and unresolved state stay
neutral. Default GPC qualification is unchanged. Preserve historical proof v1
and source packets without reinterpretation.

Retain only an encoding enum and decoded-body hash in addition to existing proof
metadata; never retain decoded event text, DOM text, body bytes or raw identifier
values. Existing request/inspection caps, windows, lanes, header reads, worker
size, model usage and retention are unchanged. Estimated incremental bounded
decode CPU and metadata storage is below $0.50/month at 100,000 scans. The
authorized single Ovid rerun is a one-run cooldown exception; it does not clear
permanent target holds or add Ovid to rotating target selection.
