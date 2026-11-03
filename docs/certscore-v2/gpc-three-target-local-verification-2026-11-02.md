# CertScore.ai three-target local GPC verification

Two fresh local reports completed; Best Buy returned a failed starting-page verification result. The shared original GPC commit timestamp matches exactly on all three retained GPC workers. No product code, proof gate, capture budget, finding policy or production configuration changed during this verification.

The owner explicitly approved one passive scan each of Ars Technica, GEICO and Best Buy, a narrow central-contact-history exception and the existing bounded policy-assist calls for these sites. At most two targets ran concurrently. Each coordinator used its existing four passive lanes; Accept/Reject were disabled. These three approvals are consumed. No automatic retry was performed.

## Original-byte results

| Target | Coordinator outcome | Request comparison | Advertising/marketing requests, off / on | Analytics/replay requests, off / on | Exact GPC commit timestamp |
| --- | --- | --- | --- | --- | --- |
| Ars Technica | Completed, 45,032 ms | 5 seconds | 0 / 0 | 0 / 0 | Verified |
| GEICO | Completed, 44,295 ms | 3 seconds | 0 / 4 | 0 / 1 | Verified |
| Best Buy | Failed, 33,004 ms | No completed report | Not assessed | Not assessed | Verified in retained worker diagnostics only |

Each original worker was checked against its original coordinator/failure-lane receipt: byte length, SHA-256, schema, scan and isolated lane identity. No receipt was replaced, no original artifact was modified and no historical report was rewritten. Configured us-west-1 uses local emulation; actual local egress geography remains unverified. This small owner-selected sample does not establish production population coverage.

The two completed reports retain the existing `page_http_signal.v2` comparison. Their different window lengths remain explicit. GEICO's higher GPC-on count is an observation between independent fresh visits, not a causal finding or evidence of ignoring GPC. Both completed visits retained main-document header and navigator proof. Ars Technica's full-context readback remained limited; GEICO's full-context proof was verified.

Full-session facts stay separate. Ars Technica retains 28 classified tracking requests including six collection requests across its longer GPC observation; GEICO retains seven including four. Neither observation retained a verified advertising-collection recipient row. No stronger paired successful-advertising-collection packet was produced. Zero classified activity in Ars Technica's first five seconds does not mean no later/full-session activity or honoring.

Best Buy's single terminal result carries `original_runtime_visit_unavailable`, with `runtime_navigation_unverified` in the retained runtime eligibility assessment. Its baseline and GPC original sources both verify against the failure diagnostic's original references. This is worker diagnostic evidence, not a completed customer report, score or public comparison. The retained reason does not establish a blocking/challenge cause. No retry, longer wait or substituted starting-page evidence was used.

## Remaining proof limits

Both completed GPC visits retained `api_unavailable` at their bounded semantic checkpoint. Their paired CMP settings packet stays absent; no baseline settings, unchanged state or legal result is inferred. Ars Technica's earlier retained readable GPP result does not establish availability in this new independent visit. No adapter expansion, extra API call or waiting was introduced to populate settings.

All three final GPC worker artifacts omit the new private cookie-read binding. Their compact core sizes are 766,778 bytes (Ars Technica), 629,403 bytes (GEICO) and 1,187,810 bytes (Best Buy), all above the existing 409,600-byte retention target even with the binding absent. The current optional-metadata gate therefore cannot retain an added binding. The intermediate builder return is not recorded, so these sources do not prove whether it initially produced one. Original cookie read intervals were not reconstructed.

Largest retained fields differ by site: journeys and request rows dominate Ars Technica/Best Buy; request rows and journeys dominate GEICO. CNN's separate fresh run was dominated by cookie-event metadata. Any future retention repair must preserve the original logical request/cookie/journey facts, provenance, historical interpretation and canonical finding eligibility while fitting the existing budget. This phase made no trimming or cap change. The private binding's fixture proof remains valid; real-site retention coverage remains unresolved.

Visual review also exposed a repeated full-context limitation sentence in Ars Technica's existing shared guidance when two retained reason codes map to the same explanation. It is a wording follow-up; no status, finding or proof change was made to hide it.

## Handoff, review and receipts

The completed Ars Technica/GEICO coordinator bundles passed the canonical materializer, normalized concern/policy and unified finding projection, persisted hydration, strict API resource, canonical JSON export, shared web component, PDF text renderer, Markdown and MCP checks. Their public activity packets match the original canonical packets exactly, and private cookie-binding fields are not exposed. EU PDF scope remains unchanged.

Each actual GPC component was reviewed at 390 and 1280 pixels on fixture-backed localhost:3000. Enter/Space expanders worked, with no document overflow, page errors or unexpected/external requests. This is a canonical component review, not an authenticated Next.js route. PDF content was checked through the shared renderer in memory; no additional PDF files were authored for these two targets. The separate CNN run has its own rendered 24-page PDF review.

Exact commands and exit codes are in `outputs/gpc-three-targets-2026-11-02/`. The batch command exits 1 because Best Buy failed; that result is preserved. Both completed original-byte verification commands, both canonical handoff commands, both browser reviews and Best Buy's failure-receipt verification passed. The local registry validator passed before scanning. Production code hashes remain identical to the prior 410-test worker-repair verification; those suites were not rerun for this artifact-only phase. `git diff --check` passed.

`authorization.json` records the narrow grants. Each target has a run receipt and sanitized original-byte or failure proof. `contact-ledger-candidate.json` records all three domain contacts using the canonical repository helper, with the shared ledger's base hash and exact actual URLs. It is unapplied, preserving concurrent shared-ledger edits; no central ledger was read or written. Existing daily-audit configuration, source pins, schedule and dashboard remain unchanged.

Local original artifacts, full projections and scanner logs stay private. New shared diagnostics contain bounded facts, source hashes, sizes, counts and reason codes, with no raw cookie/storage values, request bodies, identifiers, GPP strings or document tokens.

This phase adds **$0/month recurring infrastructure/storage cost** because it changes no production implementation. The three explicitly approved one-off policy-assist charges are unmeasured. Local wall times are not Lambda billing, savings or production performance. The existing pending-release cost-headroom prerequisite remains. Nothing was pushed, published or deployed.
