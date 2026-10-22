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
