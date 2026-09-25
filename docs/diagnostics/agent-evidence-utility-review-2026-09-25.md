# Evidence usefulness for auditor and agent conversations

Date: 2026-09-25. Scope: the same seven user-selected retained production scans, all `scans.status=completed`, outcome `completed_partial`. This review adds no scan or production write.

**Owner direction after review:** Keep the default MCP answer brief. The local implementation covers truthful external-domain counts, bounded evidence follow-ups, and one concise public-page scope sentence. Exact policy passages remain on-demand in the existing report-evidence export. Detailed policy commitments, a new semantic extraction layer, and additional capture remain deferred. The changes have not been deployed or used to rematerialize historical production reports.

## Recommendation

Make retained observations and published policy statements independently retrievable, with exact citations and explicit testing scope, including when no finding exists. The highest-value improvements are in the canonical evidence projection and MCP retrieval contract. The sample does not establish a need for more browser sessions, longer capture, additional models, new score deductions, or a score ledger.

The three intended uses need different outputs:

| Use | Evidence the consumer needs | A successful answer |
| --- | --- | --- |
| Auditor gathering material through MCP chat | Exact passages/events, capture context, reproducible references, verification state | A working-paper statement can be traced to the captured source and its limits. |
| Agent explaining a privacy finding | The decisive observations, applicable policy rule, uncertainty and counterevidence | Explains why the finding exists without upgrading a missing observation into a failure. |
| Agent evaluating a site's privacy practices | Observed public-page activity, declared service practices, unresolved questions | Distinguishes what happened in the capture, what the operator says happens, and what was not tested. |

## Method and limits

Read the seven previously downloaded production packets and original bundles. Their original SHA-256 verification is recorded in `/tmp/certscore-score-review-20260925/artifact-verification.json`. Inspected the current MCP server, Pulse projection, report-evidence export and retained-policy reader. Replayed each saved report projection locally through Pulse `full` and `evidence`, then through the MCP bundle builder using the Light 25,000-byte ceiling. Outputs and comparison data are in `/tmp/certscore-evidence-utility-20260925/`.

These are local code replays using retained production inputs, not captured live MCP responses. The checkout contains the preceding round's local fixes; replaying a persisted projection does not regenerate its historical findings. An unauthenticated production report-evidence GET returned HTTP 403; live authenticated MCP parity was not verified. No customer token or access-control workaround was used. No new LLM evaluation was performed this round.

The sample is narrow: six sites share Floot/FatGenie infrastructure. All seven have one scanned page and five requested pages, no observed journeys, and a passive main-document form inventory with zero retained forms. The page counters do not establish why additional pages were not scanned. Frequencies below describe this sample only.

## Confirmed new observations

| Site | Scan ID | Retained baseline requests / third-party requests | Pulse full headline: third-party domains | Pulse evidence request rows | MCP evidence finding digests |
| --- | --- | --- | --- | --- | --- |
| Joyce | `02ad2122-7798-496f-8bc5-1b770d4045e9` | 8 / 0 | 0 | 0 | 0 |
| Foundry | `e78ab151-c340-4137-8835-f6a08cc013f2` | 43 / 1 | 0 | 0 | 0 |
| Casefile | `361fcc1a-2883-49d5-8f18-3a8f1ccff8aa` | 29 / 1 | 0 | 0 | 0 |
| Housing | `46cec730-578e-4336-9cf4-2cf79a140922` | 51 / 1 | 0 | 0 | 1 |
| TellDoug | `8a0b82bc-83e0-48ae-b5f1-d0ac76a8c513` | 44 / 1 | 0 | 0 | 0 |
| Backroom | `54715319-1e96-4bfa-9975-0919cc5f47a8` | 29 / 1 | 0 | 0 | 0 |
| CareerCaptain | `f528f0f2-42fa-444a-8375-93bbd1258162` | 46 / 1 | 0 | 0 | 0 |

For all six external requests, the retained URL is `https://floot.com/t.js`. This proves an external script request in the captured context; it does not establish analytics collection, personal-data transmission in its payload, sale/sharing, or a legal violation.

For example, Backroom `networkEvents[9]` is `net_169`, request `req_168`, GET/script, `thirdParty=true`, `collectionEndpointObserved=false`, `attributionStatus=ignored_noise`, reason `request_without_collection_or_vendor_signal`. Its request headers retain `cookieHeaderPresent=false` and `authorizationHeaderPresent=false`. The independently retained graph also contains the request and a response status of 200. These facts are useful without being a finding.

## Ranked changes

### 1. Correct observed-inventory semantics and preserve unclassified activity

**User question:** “Which outside services did this page contact, and what did it send?”

**Issue:** In six of seven local full-report replays, `evidenceHighlights.trackerFootprint.summary` says `0 third-party domains observed; 0 classified tracker vendors identified.` The first number is derived from tracker inventory/fallbacks in `apps/web/lib/pulse/projection.ts:buildEvidenceHighlights`, not the complete external-request inventory. The evidence-tier `requestTimingSummary.networkSummary` correctly retains one third-party request and one domain for those six sites. However, `requestEvidenceInventory.cap` is `{shown:0,total:0,truncated:false}` for all seven: no individual request can be inspected through that inventory. This is a projection/definition problem, not evidence that capture saw zero requests.

**Change:** Keep observed external domains/requests, classified tracking activity, operational services and unresolved purpose distinct. Expose a bounded, verified observation inventory even when attribution is unknown or ignored for finding eligibility. Report captured, eligible-for-this-view, returned and omitted counts with their scope. Make the retained safe request fields and source references retrievable. A library request must remain distinct from a classified collection request.

**Pipeline:** verified runtime evidence → persisted typed inventory projection → MCP inventory and counts. Any new finding still requires normalized concern → concern policy → unified projection. Do not promote the Floot script into a tracker finding.

**Verification:** These six retained examples show one external domain and zero proven classified tracking vendors; Joyce remains zero external domains. The request is retrievable and classified as unresolved/unsupported for collection rather than disappearing. Compare inventories with retained graphs and explicit omission counts. Do not infer request bodies or unknown purpose.

**Value / effort:** very high / small-to-medium. This is the first implementation priority.

### 2. Make deeper MCP retrieval return usable evidence, including for zero-finding scans

**User question:** “Show me the evidence behind that answer.”

**Issue:** The local `detail=evidence` bundle replay returns zero finding digests on six sites and one on Housing. The builder reduces its evidence input to digests, safety notes and links; it does not include the input's checklist/request/policy inventories. This is not a byte-budget truncation: all seven evidence bundles report `truncated=false`. Separately, `detail=full` requests Pulse `full`, which is a different shape and is not a superset of Pulse `evidence`. At the Light ceiling all seven full bundles omit `fullReport` and report that omission. They finish at approximately 15.8–19.5 KB. The omission is disclosed, but the deeper call is not reliably more useful.

**Existing capability to preserve:** `certscore_get_report_evidence_page` already supplies a paginated, snapshot-bound report export and a full download. This is useful and should remain. It intentionally excludes internal graph/diagnostic JSON, and exporting every display row is cumbersome for a focused question.

**Change:** Fix detail routing and define evidence sections independently of findings. Add structured selectors to an existing read tool or a focused evidence reader: topic/control, vendor/host, scenario, or exact evidence ID. Return relevant canonical observations and exact passages before repeated narrative. Include actionable MCP next calls when material is omitted; a Light caller should not depend on an unavailable OAuth-only tool or a browser-only link. Keep full-report export as the exhaustive alternative.

**Pipeline:** persisted typed evidence / canonical finding projection → bounded public-safe evidence read → MCP. No on-demand model call is necessary for exact ID or topic/host retrieval. Arbitrary semantic search would be a separate design and cost decision.

**Verification:** With zero findings, an agent can still retrieve the Floot request, a retained policy passage, storage observations and scope. Test summary → evidence → exact source using both Light and OAuth permissions. Test omissions, expired download links, snapshot changes and page reconstruction. A larger detail setting must either add evidence or state exactly how to retrieve it.

**Value / effort:** very high / medium. Fix current routing before adding a new tool.

### 3. Expose published practices as quoted claims with their own scope

**User question:** “Does this service use AI providers, and what does it say about retention or deletion?”

**Evidence:** Backroom's usable `/privacy` observation `policy_surface_a1ae8a93` retains: “When you invoke an AI-assisted feature, relevant inputs may be sent to OpenAI through an API so the requested feature can produce an output.” It also describes account deletion, administrative completion receipts and backup handling. CareerCaptain's usable `/privacy` text describes a 30-day Recently deleted recovery period, account-lifetime CV/profile records, and erasure exceptions. Those are materially useful to an auditor despite no scored finding.

Housing's retained `/privacy-policy` text discusses open provider-contract, international-transfer and sensitive-data reviews. That source was marked insufficient and must pass the corrected quality/ownership/integrity path before being presented as verified governing-policy evidence. TellDoug's OpenAI disclosure is visible in its original bundle, but the known text-artifact mismatch must remain explicit; it is not a safe production citation until provenance is reconciled.

**Change:** Let agents retrieve exact, verified policy passages for processors/AI use, information categories, purposes, retention, deletion and rights. Label them `published_policy_statement`, with source date, section and applicability, separate from `observed_runtime` and `canonical_assessment`. Preserve surrounding conditions and exceptions. First expose existing verified passages; only introduce new semantic extraction through the approved extraction/review roles and a separately reviewed contract. Do not turn policy promises, caveats or incomplete reviews into new findings or score effects.

**Example answer:** “Backroom's captured policy says relevant inputs may be sent to OpenAI when an AI feature is invoked. The anonymous homepage capture did not exercise that feature, so it neither verifies nor contradicts that practice.”

**Pipeline:** retained owned policy text/sections → verified typed passage projection → MCP evidence. Any assessment or finding must still enter the normalized concern/policy pipeline.

**Verification:** An agent cites the exact source passage and attributes it to the operator; it does not claim the scanner observed an OpenAI transfer. CareerCaptain's 30 days remains tied to Recently deleted, not all records. Missing, partial, foreign-owned and unverifiable passages remain limited.

**Value / effort:** very high for broader privacy review / medium. Begin with retrieval of existing passages, avoiding additional per-scan model work.

### 4. Give each answer explicit testing scope and a useful unresolved question

**User question:** “How far can I rely on this result?”

**Issue:** All seven captures cover one public page; the form inventory is main-document/passive with zero forms and `activeSubmission=false`; no journeys were observed. Runtime lane duration is 1,455–3,449 ms, while total scan duration also includes other lanes. Lane duration is not an exact post-load observation window. Generic coverage copy does not give an agent enough context to assess a service's signed-in processing.

All seven retain explicit Accept/Reject lane limitations at the passive barrier, while the local Pulse results expose `postAcceptObservation=null` and `postRefusalObservation=null`. These cannot be interpreted as successful refusal, failed site controls, or evidence that no optional processing exists. GPC already has a substantially richer delivery/comparison/observation contract; reuse that approach rather than flattening it into pass/fail. All baseline runtime graphs are partial with 1–21 unresolved initiators; unresolved attribution must not become a causal claim.

**Change:** Expose a typed question-relevant scope: exact page, capture date/region, session/scenario, authentication context when known, interactions exercised, frame/form inspection scope, actual observation bounds when retained, capability limitations and terminal action outcome. Use distinct unavailable/not tested/not applicable/failed-capture states. Scope form absence to the inspected document. Keep baseline, GPC and action sessions separate. Give an appropriate follow-up such as “obtain the processor list and relevant contract” or “review signed-in deletion behavior,” without automatically starting scans or interactions.

**Pipeline:** producer capability and terminal outcomes → persisted coverage/assessment → MCP scope and follow-up guidance. Missing producer scope must remain unknown until captured correctly; never invent it in presentation.

**Verification:** For these seven examples an agent cannot claim sitewide no collection, authenticated-feature coverage, verified refusal, or GPC honoring. It should distinguish an incomplete request graph from missing all network capture. Test no-go fixtures separately because this sample contains none.

**Value / effort:** high / small-to-medium for exposing existing fields; additional capture is unproven and deferred.

### 5. Make an auditor's citation independently resolvable

**User question:** “Attach the exact support for that statement to my working paper.”

**Issue:** Some checklist `evidenceRefs` in the replay are explanatory strings such as `Evidence: complete ConsentControlAssessment v2` or `Evidence: runtime capture completed`, rather than source locators. Runtime records can have empty `evidenceRefs` despite stable event IDs. Retained policy sections already contain document/evidence hashes, offsets, source-offset basis and extraction state, but the compact API exposes selected provenance and human-readable references. General report anchors are useful navigation; they do not uniquely identify the quoted historical bytes.

**Change:** Give every returned evidence item a scan-bound ID and source locator, immutable source hash/version, capture time, original URL, session/scenario, verification/redaction/truncation state, and either an exact passage with its source offset basis or a typed event reference. Distinguish the evidence hash from the report-export snapshot hash. Return a reusable logical citation that can mint an authorized download when needed; an expiring signed URL must not be the only identifier. Retain existing image-safety and access controls. Do not expose raw cookies, bodies or private storage paths.

**Pipeline:** retained artifact verification → typed evidence reference → persisted projection → authorized resolver → MCP citation. Reuse existing hashes and artifact verification rather than building a second provenance system.

**Verification:** Resolve a citation back to exactly the same retained bytes after a report renderer change. A stale/mismatched reference fails explicitly. Use TellDoug as the negative integrity fixture; it must never return a 21-character shell as support for a 4,843-character policy claim. Check section offsets against their declared source representation, not a different normalized document.

**Value / effort:** high for auditor use / medium. Build alongside focused evidence retrieval.

## Implementation order and evaluation

Implement the two concrete MCP defects first: truthful external-domain/request inventory and evidence-detail retrieval. Then add a common citation/scope envelope around existing retained evidence. Expose policy passages through the same reader. Add richer processing-claim extraction only after demonstrating a question that existing verified passages cannot answer.

Evaluate using fixed tasks on retained packets, with expected evidence and forbidden overclaims:

1. Backroom: distinguish one Floot script request from zero classified tracking vendors.
2. Backroom: attribute OpenAI use to the policy and keep signed-in behavior untested.
3. CareerCaptain: explain 30-day recovery without asserting universal 30-day erasure.
4. Housing: explain the notice and limited action evidence without an unsupported refusal finding.
5. Joyce: explain unsuccessful policy discovery without asserting that no policy exists.
6. TellDoug: disclose the artifact conflict instead of citing mismatched text.
7. Every site: distinguish no forms on the inspected page from no collection by the service.

Measure correct source citations, supported statements, preserved qualifications, successful retrieval, tool calls and response bytes. Deterministic fixtures validate contracts; a later bounded agent evaluation validates actual answer quality. Existing observations do not establish a measured LLM error rate.

No additional capture, paid-service usage, retention policy or production model invocation is proposed as an immediate requirement. Estimate read/egress and any storage/model delta before implementation under the repository cost-approval rule. This review makes no recurring-cost change.

## Things this sample does not justify

- New legal findings from a policy's own caveats, absent authenticated activity, partial capture, or unknown attribution.
- Treating a server-location/CDN edge as the operator's headquarters, all processing locations, or proof of a legally restricted transfer. Backroom's Floot request explicitly labels its location `server location (may be CDN edge)`.
- Broad new capture of bodies, cookie values, form submissions or authenticated journeys.
- A global score redesign, score ledger, universal free-text answer engine or additional per-scan model calls.
- Generalizing six related Floot examples into prevalence across production. Validate the proposed contracts against retained tracker-heavy, real form, action-confirmed and no-go cases before rollout.
