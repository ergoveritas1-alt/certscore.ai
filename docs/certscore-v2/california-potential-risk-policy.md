# CertScore.ai collection review risk policy

Owner approval: October 22, 2026. Local implementation; no deployment or historical production rewrite.

CertScore.ai separately assesses observed facts, potential regulatory exposure and stronger purpose-qualified collection. A supported privacy-risk finding does not require a legal violation determination. Missing evidence alone never creates a finding, a pass or a deduction.

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

## EU

Preserve the approved EU Reject presence rule: verified non-essential cookies and/or service requests on a completed authorized Reject path are risk findings under the existing 30-point family. Neither sale/sharing-purpose attribution nor semantic registration is a new prerequisite. Cookie persistence is not labeled a new write, and request presence is not labeled proven downstream use.

GPC alone does not become an EU consent refusal. The new California potential-risk effect does not change EU scores. EU consent, storage/access, transparency, legal basis and rights are separate questions assessed against their own positive evidence. Do not infer a missing policy statement or a legal violation merely because capture or purpose attribution is unresolved.

## Budgets and limitations

No new browser visit, Options opening, request/header read, wait, retry, worker, model call or deployment. Existing 48 request-inspection / 32 proof limits remain unchanged. Review metadata adds at most 32 rows per path; estimated incremental storage and bounded processing below $0.50/month at 100,000 scans and 30-day retention. No raw identifiers or payloads are added. The retained cohort replay demonstrates supported discoveries, not complete capture of every live recipient or account-side processing arrangement.

Primary background: [California privacy FAQ](https://www.cppa.ca.gov/faq.html), [EU cookie guidance](https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm), [EDPB lawful processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en). These sources explain the regulatory objectives; the numeric weights are CertScore.ai product policy.

October 22 scale update: scoring-only computation with unchanged evidence retention and capture; no incremental infrastructure or per-scan cost.
