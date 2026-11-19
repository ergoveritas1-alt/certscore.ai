# CertScore.ai collection review risk policy

## Verified collection under GPC or after Reject

New local assessments use `california.collection-review.v8-verified-event`. One recipient incurs 4 points for classified presence, 7 for a verified successful collection with unresolved purpose, or 15 for qualified collection. Apply the strongest evidence once per recipient per visit. Repeated requests add no points. For 1–4+ verified recipients the totals are 7/11/13/15. Additional presence-only recipients use the marginal steps of the existing presence schedule. A declared sale opt-out on a Google CCM page view excludes that request from review scoring. An independent eligible request can still count.

Both visits share the 15-point partial and 47-point combined caps. The existing per-visit full-schedule ceiling and independent Reject identifier rule still apply. Historical assessments retain their versioned treatment.


Owner approval: October 22, 2026. Local implementation; no deployment or historical production rewrite.

CertScore.ai separately assesses observed facts, potential regulatory exposure and stronger purpose-qualified collection. A supported privacy-risk finding does not require a legal violation determination. Missing evidence alone never creates a finding, a pass or a deduction.

## November 18, 2026 · Non-essential presence

For new California assessments, `california.collection-review.v7-presence` counts a canonical recipient once per verified GPC or applicable Reject visit. A retained non-essential cookie snapshot or a classified service request supports partial credit. A successful event with unresolved purpose receives the same partial weight. A snapshot establishes presence at the read time. Full qualification continues to require request-specific collection evidence.

| Recipients on one visit | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Partial points | 4 | 7 | 9 | 11 | 12 | 13 | 14 | 15 |
| Full points | 15 | 25 | 32 | 37 | 40 | 43 | 45 | 47 |

Apply the strongest tier per recipient per visit and add the two visit effects. Cap each mixed visit at the full schedule for its recipient count, all partial effects at 15, and the combined family at 47. Existing request-local processing restrictions and the independent Reject identifier rule apply. New scores using the partial schedule carry `california-regulatory-posture.v25-presence`. Historical assessments use their recorded policy versions.

## November 17, 2026 · Recipient scoring by visit

The November 17, 2026 approval supersedes the cross-visit recipient union below for new assessments. Under `california.collection-review.v6-per-visit` and `california-post-reject.v7-per-visit`, CertScore.ai applies the existing recipient schedules separately to the GPC and Reject visits. A canonical recipient gets its strongest supported collection tier once per visit, regardless of request count. Potential collection on both visits contributes 7 + 7 for one recipient. Qualified collection on both contributes 15 + 15. Qualified collection on one and potential collection on the other contributes 15 + 7 for one recipient.

Calculate the mixed-tier headroom separately for each visit, then cap the combined review contribution at 15 and the full collection family including review at 47. Explicit opt-out continues to share recipient credit with the choice family. The independent 3-point post-Reject identifier rule remains capped once per scan. Sanity’s saved capture contributes 7 for GPC collection and 3 for the separate Reject beacon. The EU score and evidence thresholds are unchanged. Historical assessments retain their versioned treatment. New scores using this policy carry `california-regulatory-posture.v24-per-visit`. The change uses existing evidence, with no additional capture, retention fields or recurring infrastructure cost.

## California

`gpc_collection_review.v1` retains up to 32 canonically attributed successful collection requests from the verified original GPC document/session. Require actual main navigator/header delivery, request-local Sec-GPC, exact URL/time binding, a classified collection endpoint and a retained HTTP 2xx/3xx response. Libraries, generic vendor presence, failed responses and unsupported attribution do not qualify. Existing full recipient qualification has priority in the shared 100 qualification inspections; review discovery uses only remaining slots.

`california.collection-review.v2` persists separate GPC and Reject assessments. A potential-risk row requires positive collection by a classified analytics, advertising, marketing or session-replay recipient. Full sale/sharing purpose need not be established. NPA alone remains context. Request-local restricted-processing declarations remain retained, observation-only context rather than proof of compliance. Missing or invalid privacy-signal interpretation is explicitly unresolved.

Reject additionally requires the completed authorized cookie-rejection action, source/target proof, bounded completed window, request ancestry after the click and an exact typed collection inspection. No semantic consent-registration prerequisite is introduced. General request records now retain the HTTP status already captured by the response callback. A completion timestamp alone is insufficient: the existing callback records both successful and failed terminal requests. Historical missing statuses remain unknown; no response is synthesized from a different lane.

The owner approved **7/11/13/15 California potential-risk points for 1/2/3/4+ distinct eligible recipients**, capped at 15, on October 22, 2026. Union eligible recipients across GPC and Reject. Exclude each recipient already receiving full California recipient-family treatment through GPC, Reject or explicit opt-out. Repeated requests, cookies and paths add no entity increments.

For mixed inventories, the incremental potential-risk effect is the smaller of its schedule and the remaining difference between the existing full-family total for all distinct recipients and the full-family amount already applied. This preserves the full schedule and 47-point combined cap, and guarantees that promoting a potential recipient to fully qualified never improves the score. For example, three full recipients (32) plus one potential recipient add 5, totaling 37; promotion to four full recipients still totals 37. Potential-only inventories receive exactly 7/11/13/15. The separate GPP family remains unchanged.

New assessments use `california.collection-review.v2`; new scores with this effect use `california-regulatory-posture.v16-collection-review`. Stored v1 assessments retain their original flat 5-point effect and v15 score version. Reads rederive evidence under the retained assessment version; no historical production rewrite is authorized.

October 22 retained-scope correction: new assessments use
`california.collection-review.v3-retained-scope` and CA score v17. The schedule,
recipient union, mixed-family headroom and caps are unchanged. Reject uses the
versioned [retained-context scope rule](california-reject-scope-policy.md).
Historical v1/v2 assessments rederive with the previous narrower Reject scope;
v2 retains its scaled schedule and v16 score. GPC eligibility is unchanged.

Persisted typed assessments -> normalized concern -> concern policy -> unified `california_collection_review` finding -> California score and report priorities. Retained assessment reads must reproduce their original source projection. Absent new assessments do not upgrade historical reports. Findings remain visible per path even if score deduplication removes their incremental effect. Reports show factual vendors, timing, processing context, unresolved purpose and recommended review; no deduction explanations or claim of legal violation.

### Google page-view measurement under GPC — November 17, 2026

Under the owner-approved `california.collection-review.v4-google-page-view`, a successful Google advertising page view can support potential-risk review even when the request declares a US Privacy sale opt-out. The retained proof binds the GPC-bearing POST to the exact HTTPS `pagead2.googlesyndication.com/ccm/collect` endpoint, a single `en=page_view`, the visited document in `dl`, and its own 2xx response. The exception permits the sale-opt-out declaration alone or alongside NPA. Other processing restrictions keep their existing treatment. The declaration stays visible in the assessment. Repeated events for Google share one recipient under the existing schedule. Historical assessments retain their original interpretation.

### Tracking identifiers sent after Reject — November 17, 2026

The owner approved a 3-point California potential-risk effect for a successful beacon or event request carrying a documented tracking identifier after a verified cookie rejection. A direct browser network edge must show the cookie was included, or the typed measurement inspection must match the transmitted parameter to a verified stored tracking identifier. The request must belong to the original document, start after the click and have its own successful network response inside the capture window. The report retains one compact witness from the source packet. Routine page and asset loads, attempted writes, cookies present only in storage, and referrer or preference cookies alone carry no effect.

`california.collection-review.v5-reject-identifier` counts one independent transmission per scan, regardless of the number of identifiers or repeat beacons. A transmission already covered by recipient collection review or qualified collection adds zero. An independently scored GPC event can coexist with it. The existing potential-risk and combined recipient caps apply. The finding describes the observed transmission without asserting downstream sale or sharing. Earlier assessment versions retain their original treatment.

## EU

Preserve the approved EU Reject presence rule: verified non-essential cookies and/or service requests on a completed authorized Reject path are risk findings under the existing 30-point family. Neither sale/sharing-purpose attribution nor semantic registration is a new prerequisite. Cookie persistence is not labeled a new write, and request presence is not labeled proven downstream use.

GPC alone does not become an EU consent refusal. The new California potential-risk effect does not change EU scores. EU consent, storage/access, transparency, legal basis and rights are separate questions assessed against their own positive evidence. Do not infer a missing policy statement or a legal violation merely because capture or purpose attribution is unresolved.

## Budgets and limitations

No new browser visit, Options opening, request/header read, wait, retry, worker, model call or deployment. Existing 48 request-inspection / 32 proof limits remain unchanged. Review metadata adds at most 32 rows per path; estimated incremental storage and bounded processing below $0.50/month at 100,000 scans and 30-day retention. No raw identifiers or payloads are added. The retained cohort replay demonstrates supported discoveries, not complete capture of every live recipient or account-side processing arrangement.

Primary background: [California privacy FAQ](https://www.cppa.ca.gov/faq.html), [EU cookie guidance](https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm), [EDPB lawful processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en). These sources explain the regulatory objectives; the numeric weights are CertScore.ai product policy.

October 22 scale update: scoring-only computation with unchanged evidence retention and capture; no incremental infrastructure or per-scan cost.

### Google CCM and OpenAI event review

New bounded request proofs can retain an exact-route POST event receipt on the Reject or GPC visit.
For Google's `pagead2.googlesyndication.com/ccm/collect`, a single explicit page-view event must
identify the observed document. For OpenAI's `bzr.openai.com/v1/sdk/events`, the receipt records
a nonempty submission. The review path requires successful, timely, request-bound evidence and
complete supported processing inspection. Existing request-local restrictions and per-visit
recipient schedules apply. This receipt establishes review eligibility only. Historical packets
without the receipt retain their existing interpretation. SDK downloads, configuration reads and
consent-only pings do not produce the receipt. Capture uses the existing budgets.

The optional `measurementFacts` in bounded Reject and GPC request proofs describes
what the exact POST carried. Google CCM can retain a recognized event type, the
SHA-256 of a single supported `tid`, and whether a supported `gclid` was present.
For the OpenAI web pixel, the reader follows the published
[SDK](https://bzrcdn.openai.com/sdk/oaiq.min.js) envelope (reviewed version
0.1.105). It hashes the query pixel ID and retains the index and standard type
of each recognized event in batches of up to eight, explicit boolean opt-out,
and observed click-reference or hashed-contact field kinds. Batch-level matching
fields are attributed only in single-event batches. Custom event names, pixel IDs
in clear text, contact hashes and click-reference values are excluded from these
facts. The existing body parser and limits apply. A supported OpenAI batch now receives complete body inspection only when every
event and its nested fields match the reviewed SDK format. Telemetry-only batches,
event opt-outs and explicit diagnostic consent denial cannot supply a verified
measurement receipt. Unsupported members or batches over the existing limits
can retain individual field observations without establishing complete inspection. These facts
alone do not qualify sale/sharing purpose or alter the score.
