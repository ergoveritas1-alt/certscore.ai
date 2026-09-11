**CertScore MCP failure audit — September 11, 2026**

Audit interval: September 7, 2026, 03:13:22 PDT through September 11, 2026, 03:13:22 PDT (96 hours). UTC: 2026-09-07T10:13:22.548426Z through 2026-09-11T10:13:22.548426Z.

**Scope and reconciliation**

The read-only production audit retrieved all 76 retained non-success rows among 781 MCP invocations. All 76 were recorded as `error`; there were no retained `rate_limited` rows in this interval. This is a statement about this ledger, not proof that no requests were throttled outside it. Rejected protected reads may intentionally be absent from activity telemetry.

Applying the same Internal/QA and Mac mini exclusion predicates as the default admin table yields **64 error rows among 338 external-view invocations (18.9%)**. The other 12 errors are excluded by those established predicates. Client names alone were not used to change traffic classification. Self-declared probe/verifier names do not establish who operated a client.

The 64 external-view errors break down as:

- **33 reads of completed-but-limited target scans:** access restrictions, login walls, CAPTCHA, navigation failure, or target-server 5xx.
- **29 invalid requests:** 22 malformed scan IDs, four unknown tools, two DNS-rejected targets, and one input-schema failure.
- **One premature/unavailable bundle read**, strongly consistent with a readiness race.
- **One genuinely failed scanner execution**. Three more internal verification calls read that same failed scan, so the all-traffic count is four errors, not four failed executions.

No rows were sampled away. There were no success rows with retained scan_status `failed`, `error`, or `cancelled` in the audit interval. The scope does not cover failures omitted from telemetry, nor scans whose failed results were never requested via MCP.

**Every error class**

| Retained error code | All traffic | Default external view | Diagnosis |
|---|---:|---:|---|
| `access_denied_or_forbidden_page` | 19 | 19 | Target access restriction; historical completed_limited read |
| `authentication_required` | 10 | 6 | Target page requires sign-in; not MCP account authentication |
| `captcha_or_challenge` | 5 | 5 | Target security challenge; historical completed_limited read |
| `invalid_arguments` | 6 | 1 | Input schema rejection; see validation analysis |
| `invalid_scan_id` | 22 | 22 | Non-UUID placeholder or random scan ID; rejected before origin work |
| `invalid_url` | 2 | 2 | DNS domain_not_found verified in contemporaneous web logs |
| `navigation_transport_failure` | 2 | 2 | Target navigation/transport limitation |
| `not_found` | 1 | 1 | Existing scan; likely bundle-readiness race near completion |
| `scanner_runtime_failure` | 4 | 1 | Repeated reads of one failed consent-proof evidence capture |
| `server_error_5xx` | 1 | 1 | Target website 5xx, not established CertScore API outage |
| `unknown_tool` | 4 | 4 | Unregistered synthetic tool name; correctly rejected |

**Findings and recommended changes**

1. **Distinguish historical limited scans from MCP execution failures.** All 37 all-traffic rows with target restriction/navigation/5xx reasons have retained `scan_status=completed_limited`. They span 24 scan IDs. `authentication_required` in these rows refers to the website's login wall, not a requirement to log into CertScore. For example, the retained scans for forenaxis-command.michaelmancini1968.chatgpt.site and desiredistrict.be have canonical `homepage_authentication_required` outcomes. Preserve these limitations and avoid bypassing authentication/CAPTCHA. Recommended agent copy: “The target website requires sign-in. CertScore cannot inspect protected content as a public visitor. Stop polling this completed scan; supply a public page or change the site's access settings before retrying.”

   The no-go-as-success fix already exists in deployed MCP source (commit c618f94f and follow-up 94562276). These error rows predate that fix; they do not prove it is still broken for new calls. The admin page still displays historical recorded errors as Failed. Add a historical “Scan limited” presentation based on the retained terminal status and canonical reason, keep original telemetry available, and separate request outcome from scan outcome. Do not rewrite stored events or reinterpret historical evidence from today's snapshot. Current snapshots for some older scans now show `completed_partial` with retained policy evidence; that later projection must not overwrite the original call's status in this audit.

2. **Make optional-null errors actionable.** Five bundle calls from `agentstatus-probe` failed schema validation. Four retain explicit `null` values for `detail`, `maxBytes`, `maxFindings`, and `maxPreConsentRows`; the oldest has the same response size and omitted-arguments signature, but lacks the detailed original fields, so that fifth precise cause is not proven. These five rows are excluded from the default external view by canonical traffic rules, but they still demonstrate a client-integration issue.

   Offline reproduction against the current server produced `invalid_arguments`, “The detail field is invalid,” and generic schema guidance, with zero origin requests. It does not explain the null/omission distinction or list the other invalid fields. Return bounded schema-owned issues for all affected fields, and say: “Omit optional parameters to use their defaults; do not send null. Call certscore_get_scan_bundle with only the unchanged scanId, or provide correctly typed optional values.” Keep required IDs/URLs strict. No broader validation relaxation is necessary.

   A sixth input-schema failure, from openai-mcp (codex), is the only external-view validation failure. Its retained URL/freshness are valid, and caller metadata shows a taskContext object, but the rejected content and exact issue were not retained. It cannot be attributed conclusively to taskContext. Current deployed code already discards invalid optional taskContext before scanning. Add safe issue paths/types to future telemetry rather than claiming a proven historical cause.

3. **Handle a known scan's unavailable bundle separately from “not found.”** Scan `2be74625-28ff-43ec-9d03-9e634028db94` was created through MCP at 01:47:52.222Z, status was read twice, and the bundle returned `not_found` at 01:48:01.379Z. The database records completion at 01:48:01.293Z—86 milliseconds earlier. The bundle call lasted 92 milliseconds. This is strongly consistent with the call straddling completion/publication, though the historical API response body is not retained and the exact failing substage cannot be proven.

   The current scan-resource route still returns 404 when a public record is not yet `completed`, before reaching its existing `scan_unavailable` readiness branch. `getPublicScanRecord` also catches lookup failures as null, which can mask a transient database failure as not-found. Fix the first incorrect boundary: use the existing pending/finalizing response for a known, publicly eligible scan; preserve 404 for unknown/ineligible IDs; preserve genuine internal availability failures as 5xx. Guidance should direct `certscore_get_scan_status` with the same ID and the existing retry delay, then bundle retrieval once ready. Do not rescan, broaden public eligibility, add polling loops, or charge new-scan quota just to recover a read.

4. **Make terminal scanner failures explicitly terminal and attributable to the service.** All four `scanner_runtime_failure` rows reference `81066dec-5e4e-4095-9fa9-064020f3d44e` (www.elotouch.com). The September 8 consent-proof lane failed evidence validation with `too_big` after about 15 seconds; this was not an invalid URL, a customer consent finding, or the outer 58-second work timeout. One public call and three internal verification calls subsequently read that same terminal failure.

   The 665-byte retained FailureDiagnostic.json was fetched and checksum-verified against the database hash `631c3336cbb446e72585ca9a36e926fa1f28b16977a301f33452dd4d04b49616`. Its field path is redacted as `[field].[0].[field]`, so this artifact cannot establish the exact field. Later commit 94562276 expands schema-path diagnostics and raises consent documentUrl's cap from 500 to 2,000; it is relevant mitigation, not proof that this historical case is conclusively repaired. Do not loosen evidence validation or synthesize a report to hide the failure.

   Current terminal guidance already recommends one refresh attempt and stopping if failure repeats. Improve it by saying that this scan ID will not resume, distinguishing status polling from a new scan, and stating that `freshness=refresh` starts a new scan and uses quota. Provide a stable support reference and a bounded safe failure stage/reason. Automatic reruns or longer waits are not recommended.

5. **Keep DNS failure provenance machine-readable.** Both URL errors were logged as `domain_not_found`, `retryable=false`: `aaronbux.com` on September 10 at 23:16:47Z and `www.us.oneill.com` on September 8 at 16:15:57Z. Contemporaneous web log entries are within milliseconds of the MCP rows. The retained aaronbux caller input already included `https://`; this was not a missing-scheme problem. Do not silently prepend www or choose a different host.

   Our pending commit f2e5ad0f adds clearer correction guidance and invalid-request classification. A remaining improvement is to carry the typed `domain_not_found` reason through Pulse → SDK → MCP; Pulse currently only retains `non_public_target` as a reasonCode and drops the other DNS distinctions. Use “The hostname could not be resolved” while preserving the exact verified target and keeping transient DNS failures distinct from permanent rejection.

6. **Retain the existing safe handling of malformed IDs and unknown tools.** The 22 invalid IDs comprise four `test` values, eight `x` values, and ten random non-UUID strings. The four unknown tools have synthetic `__verifymcp_auth_probe_...__` names. They correctly fail before scanner work. Pending commits afc3b9e2 and 2920e0c0 provide actionable recovery and the endpoint's actual tool list. Do not treat these as successful tool calls, bypass validation, block clients solely from their names, or create scans to satisfy probes.

**Deployment state and proposed order**

At audit time the web service reported Git SHA `0e3a1a66ec660072d0c61a9904662a1817bd75dc`. The hosted MCP service was healthy on task definition `certscore-web-mcp:119`, using image tag `ea20e239434c5a99edc1fcc3cb593bf6729ccd04` (version 0.2.20). Its source contains the prior no-go telemetry fix and optional task-context guard.

Our recent commits for invalid-request labels, registered-tool guidance, caller counts, and invalid-URL guidance are committed locally but not deployed by this task. The web admin and hosted MCP runtime are separate deployment targets; promoting only the web app will not update agent responses.

Recommended order: (1) precise validation issues and null-omission guidance; (2) correct known-scan readiness errors and transient lookup failures; (3) historical limited-scan presentation; (4) typed DNS reasons and clearer terminal failure/support metadata. Keep all changes in existing response/projection paths, without new scans, model calls, retry loops, persistent response bodies, or evidence-policy changes. New telemetry fields should be bounded schema-owned metadata, not raw payloads. Estimate any added retained metadata before implementation under the repository cost policy.

No application changes or deployments were made during this audit. It used read-only ECS database tasks, narrowly time-bounded CloudWatch reads, one checksum-verified S3 diagnostic, and an offline in-memory MCP reproduction. Temporary audit compute and request charges are estimated below $1 total (a few cents); there is no recurring infrastructure change. Raw diagnostic extracts remain local in `tmp/mcp-failure-audit/` and are not part of the customer-facing report.

**Complete retained error ledger**

Each row links to its retained MCP event. “External” follows the current canonical default traffic filter, not an identity claim. Error codes and statuses are original event values. Hostnames are matched from the scan record where available; they are not invented from client text.

| Time (UTC) | Event | External | Client (declared) | Error | Scan / target |
|---|---|---|---|---|---|
| 2026-09-07T17:24:02.779Z | [279b38b0](https://certscore.ai/app/admin/mcp?q=279b38b0-f1bc-4004-8837-f52bfaa422a1&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | one-command.michaelmancini1968.chatgpt.site |
| 2026-09-07T17:24:09.071Z | [15c25997](https://certscore.ai/app/admin/mcp?q=15c25997-cde7-48c1-a9cd-0bef577e6c7d&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | one-command.michaelmancini1968.chatgpt.site |
| 2026-09-07T18:45:04.443Z | [c187c079](https://certscore.ai/app/admin/mcp?q=c187c079-c628-4a68-bfff-03341cf462e2&timeSpan=all&traffic=all) | Yes | openai-mcp | `captcha_or_challenge` | intersport.pl |
| 2026-09-07T18:45:06.755Z | [3b65c4f3](https://certscore.ai/app/admin/mcp?q=3b65c4f3-e03f-4573-8126-b69107f09b70&timeSpan=all&traffic=all) | Yes | openai-mcp | `captcha_or_challenge` | intersport.pl |
| 2026-09-07T21:29:55.617Z | [268e54e4](https://certscore.ai/app/admin/mcp?q=268e54e4-83e3-4111-bd69-5b0b1304a2f9&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | karvyra-final-preview.michaelmancini1968.chatgpt.site |
| 2026-09-07T21:29:59.367Z | [a0eb1987](https://certscore.ai/app/admin/mcp?q=a0eb1987-71cf-4603-8057-54b86ef7758c&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | karvyra-final-preview.michaelmancini1968.chatgpt.site |
| 2026-09-07T21:30:04.253Z | [4f63292a](https://certscore.ai/app/admin/mcp?q=4f63292a-752b-4220-a23b-fa56f718c843&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | karvyra-final-preview.michaelmancini1968.chatgpt.site |
| 2026-09-08T03:04:23.725Z | [4419ee97](https://certscore.ai/app/admin/mcp?q=4419ee97-f3ce-45fb-a2ff-8c62b1c67d35&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-08T03:04:23.83Z | [f480095f](https://certscore.ai/app/admin/mcp?q=f480095f-4ffb-4aba-b1fd-d9b8080abfb4&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-08T03:35:07.874Z | [79ed44a0](https://certscore.ai/app/admin/mcp?q=79ed44a0-a480-4ea9-85d3-99224fcef11d&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | karvyra-final-preview.michaelmancini1968.chatgpt.site |
| 2026-09-08T03:35:11.588Z | [ecd60bee](https://certscore.ai/app/admin/mcp?q=ecd60bee-14c7-47cd-8934-41b086e3d06c&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | karvyra-final-preview.michaelmancini1968.chatgpt.site |
| 2026-09-08T09:26:16.268Z | [f971c4a6](https://certscore.ai/app/admin/mcp?q=f971c4a6-66d1-4cbc-9989-5c70528f6e05&timeSpan=all&traffic=all) | Yes | cracked-probe | `invalid_scan_id` | test |
| 2026-09-08T11:48:32.07Z | [e64e5c3b](https://certscore.ai/app/admin/mcp?q=e64e5c3b-ffc0-4df5-8a20-c35fd47ec8e2&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-08T11:48:42.127Z | [10123170](https://certscore.ai/app/admin/mcp?q=10123170-19d7-488d-ad8f-b55211909ab2&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `access_denied_or_forbidden_page` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-08T16:11:10.857Z | [897d0afe](https://certscore.ai/app/admin/mcp?q=897d0afe-1617-44b0-ac63-72bf994efcbf&timeSpan=all&traffic=all) | Yes | openai-mcp | `navigation_transport_failure` | www.thehartford.com |
| 2026-09-08T16:15:57.676Z | [bb43169c](https://certscore.ai/app/admin/mcp?q=bb43169c-8651-4ed0-9046-471e5b7c346f&timeSpan=all&traffic=all) | Yes | openai-mcp | `invalid_url` | www.us.oneill.com |
| 2026-09-08T16:17:00.643Z | [243a03d4](https://certscore.ai/app/admin/mcp?q=243a03d4-137c-4fa0-b190-bc16991dfbe7&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.timberland.com |
| 2026-09-08T16:17:13.876Z | [a1bf8982](https://certscore.ai/app/admin/mcp?q=a1bf8982-0e61-4405-9ace-6d94ccb26255&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.lww.com |
| 2026-09-08T16:17:19.216Z | [383c81f6](https://certscore.ai/app/admin/mcp?q=383c81f6-a179-4ab5-940c-8ece7d270e15&timeSpan=all&traffic=all) | Yes | openai-mcp | `scanner_runtime_failure` | www.elotouch.com |
| 2026-09-08T16:17:29.793Z | [53527da3](https://certscore.ai/app/admin/mcp?q=53527da3-4bf3-4b3b-93aa-bc215c159dc3&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.thecapitalgrille.com |
| 2026-09-08T16:17:44.087Z | [7097413e](https://certscore.ai/app/admin/mcp?q=7097413e-fbd0-4556-8c10-5eeb5c693ffe&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.ray-ban.com |
| 2026-09-08T16:17:55.77Z | [0cd0b134](https://certscore.ai/app/admin/mcp?q=0cd0b134-8b5d-4db3-925f-6d59121417a5&timeSpan=all&traffic=all) | Yes | openai-mcp | `captcha_or_challenge` | www.roddandgunn.com |
| 2026-09-08T16:18:20.144Z | [7767ea17](https://certscore.ai/app/admin/mcp?q=7767ea17-8ace-4932-be09-1f0eb4404139&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.t-mobile.com |
| 2026-09-08T16:18:23.281Z | [6676ae36](https://certscore.ai/app/admin/mcp?q=6676ae36-9224-4ab6-8f1f-e0acbacefa58&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | www.netapp.com |
| 2026-09-08T16:34:39.435Z | [29ed0d19](https://certscore.ai/app/admin/mcp?q=29ed0d19-6170-4b01-b1d1-68afa30d1e08&timeSpan=all&traffic=all) | Yes | openai-mcp | `navigation_transport_failure` | lithiachevroletredding.com |
| 2026-09-08T16:36:11.397Z | [60cf9571](https://certscore.ai/app/admin/mcp?q=60cf9571-ee5e-4849-82a1-606ff1437e22&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | us.mannatech.com |
| 2026-09-08T16:36:17.855Z | [8e531e8b](https://certscore.ai/app/admin/mcp?q=8e531e8b-b466-441e-ae70-8cd816070921&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | solostove.com |
| 2026-09-08T16:36:29.016Z | [231cdabc](https://certscore.ai/app/admin/mcp?q=231cdabc-00f0-49e5-be15-f76c51d24a42&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | yelp.com |
| 2026-09-08T16:36:46Z | [eddd11bc](https://certscore.ai/app/admin/mcp?q=eddd11bc-9d60-45d3-b552-d504537d202a&timeSpan=all&traffic=all) | Yes | openai-mcp | `captcha_or_challenge` | avid.com |
| 2026-09-08T16:37:04.775Z | [71fe7cec](https://certscore.ai/app/admin/mcp?q=71fe7cec-ebc9-4241-bb18-798501a328dc&timeSpan=all&traffic=all) | Yes | openai-mcp | `captcha_or_challenge` | corsair.com |
| 2026-09-08T16:37:14.497Z | [bd2c5e12](https://certscore.ai/app/admin/mcp?q=bd2c5e12-bca5-495a-a434-39d46d6e32b8&timeSpan=all&traffic=all) | Yes | openai-mcp | `access_denied_or_forbidden_page` | bergdorfgoodman.com |
| 2026-09-08T18:27:39.957Z | [22681d94](https://certscore.ai/app/admin/mcp?q=22681d94-97d4-4345-8038-642152b1f4da&timeSpan=all&traffic=all) | Yes | openai-mcp | `server_error_5xx` | forumexc.com.ar |
| 2026-09-09T01:34:09.722Z | [be160827](https://certscore.ai/app/admin/mcp?q=be160827-1235-4353-83fc-ed020f482233&timeSpan=all&traffic=all) | No | agentstatus-probe | `invalid_arguments` | ergoveritas.com |
| 2026-09-09T01:48:01.379Z | [b0c72ec8](https://certscore.ai/app/admin/mcp?q=b0c72ec8-9d9e-40e1-bd22-18263ed99c0e&timeSpan=all&traffic=all) | Yes | openai-mcp | `not_found` | ergoveritas.com |
| 2026-09-09T03:04:17.169Z | [21e53f37](https://certscore.ai/app/admin/mcp?q=21e53f37-a242-4ee0-9149-fe3d5532bd19&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-09T03:04:17.202Z | [82dde33b](https://certscore.ai/app/admin/mcp?q=82dde33b-da7a-4000-8d41-388a8b2167cf&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-09T06:15:12.764Z | [5436ceee](https://certscore.ai/app/admin/mcp?q=5436ceee-7e9f-4eda-ad9a-f8e8528dd499&timeSpan=all&traffic=all) | Yes | verifymcp-probe | `unknown_tool` | — |
| 2026-09-09T09:22:52.082Z | [60d7f464](https://certscore.ai/app/admin/mcp?q=60d7f464-7d68-474c-b3e5-1fe77b638809&timeSpan=all&traffic=all) | Yes | cracked-probe | `invalid_scan_id` | test |
| 2026-09-09T11:17:02.932Z | [00424c32](https://certscore.ai/app/admin/mcp?q=00424c32-2cab-46e8-b1c3-029c08c0c29e&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `invalid_arguments` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T11:18:09.449Z | [f723a65c](https://certscore.ai/app/admin/mcp?q=f723a65c-369f-433f-991e-91a7b2082b0b&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T11:18:13.802Z | [5d034ed0](https://certscore.ai/app/admin/mcp?q=5d034ed0-9d5d-4200-b9fe-66c895281611&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T11:51:15.881Z | [29e85084](https://certscore.ai/app/admin/mcp?q=29e85084-b027-473f-b0f4-c1bb3686c403&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T11:51:20.018Z | [a6595e71](https://certscore.ai/app/admin/mcp?q=a6595e71-e2a7-4451-888b-a074f5ebdabb&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T12:09:45.961Z | [7611761b](https://certscore.ai/app/admin/mcp?q=7611761b-bddc-4a40-8520-7b1762e36f04&timeSpan=all&traffic=all) | No | agentstatus-probe | `invalid_arguments` | ergoveritas.com |
| 2026-09-09T14:48:23.737Z | [533d71b0](https://certscore.ai/app/admin/mcp?q=533d71b0-711a-4c6a-a811-9575ef59a347&timeSpan=all&traffic=all) | Yes | openai-mcp | `authentication_required` | desiredistrict.be |
| 2026-09-09T14:48:28.148Z | [7a088211](https://certscore.ai/app/admin/mcp?q=7a088211-2184-49ba-8785-9a1899a03a8c&timeSpan=all&traffic=all) | Yes | openai-mcp | `authentication_required` | desiredistrict.be |
| 2026-09-09T16:20:55.438Z | [6bba0615](https://certscore.ai/app/admin/mcp?q=6bba0615-0289-44f5-a813-d4c8b11b8060&timeSpan=all&traffic=all) | No | certscore-no-go-read-verification | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T16:20:56.298Z | [2d170eb7](https://certscore.ai/app/admin/mcp?q=2d170eb7-55f5-4155-b309-ba24a02419d7&timeSpan=all&traffic=all) | No | certscore-no-go-read-verification | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T16:21:29.544Z | [09b4eb0a](https://certscore.ai/app/admin/mcp?q=09b4eb0a-3724-4887-8668-403c59851b6e&timeSpan=all&traffic=all) | No | certscore-no-go-read-verification | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T18:34:37.773Z | [6afd6803](https://certscore.ai/app/admin/mcp?q=6afd6803-b9d3-435d-9c58-f87179816705&timeSpan=all&traffic=all) | No | certscore-release-verifier | `authentication_required` | forenaxis-command.michaelmancini1968.chatgpt.site |
| 2026-09-09T19:00:07.114Z | [e35e3c76](https://certscore.ai/app/admin/mcp?q=e35e3c76-5e96-4dc6-8e21-44f021bfcca5&timeSpan=all&traffic=all) | Yes | verifymcp-probe | `unknown_tool` | — |
| 2026-09-09T20:28:03.639Z | [16bbdbc0](https://certscore.ai/app/admin/mcp?q=16bbdbc0-4940-4879-a389-e45d855eb318&timeSpan=all&traffic=all) | No | certscore-hosted-production-canary | `scanner_runtime_failure` | www.elotouch.com |
| 2026-09-09T21:14:57.955Z | [29220900](https://certscore.ai/app/admin/mcp?q=29220900-0310-4c6a-b677-5c5b10b7d4f1&timeSpan=all&traffic=all) | No | certscore-hosted-production-canary | `scanner_runtime_failure` | www.elotouch.com |
| 2026-09-09T21:29:51.26Z | [f080ca01](https://certscore.ai/app/admin/mcp?q=f080ca01-0586-4cd3-ab3a-90689dc4cb0b&timeSpan=all&traffic=all) | No | certscore-hosted-production-canary | `scanner_runtime_failure` | www.elotouch.com |
| 2026-09-09T22:36:51.219Z | [f0e93f90](https://certscore.ai/app/admin/mcp?q=f0e93f90-4100-4702-88b9-2e7a30b39873&timeSpan=all&traffic=all) | No | agentstatus-probe | `invalid_arguments` | ergoveritas.com |
| 2026-09-10T03:04:17.609Z | [c80329a4](https://certscore.ai/app/admin/mcp?q=c80329a4-838a-483f-9024-ada059326e07&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-10T03:04:17.646Z | [015cdfdb](https://certscore.ai/app/admin/mcp?q=015cdfdb-8eb3-4dc3-b88b-26bedc1df7bf&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-10T05:51:19.503Z | [27f03d47](https://certscore.ai/app/admin/mcp?q=27f03d47-3b55-487d-965c-7f4b7e7e51b9&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | a1yD |
| 2026-09-10T05:51:19.929Z | [de7ef340](https://certscore.ai/app/admin/mcp?q=de7ef340-efd6-4bcb-abfa-2f69cac0b978&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | mqg6De |
| 2026-09-10T05:51:20.112Z | [8b52b15c](https://certscore.ai/app/admin/mcp?q=8b52b15c-d56a-4aba-8e74-98060c701495&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | 3KP |
| 2026-09-10T05:51:20.228Z | [8eb25fdf](https://certscore.ai/app/admin/mcp?q=8eb25fdf-a498-4aa2-be2b-2c6a4a05b93c&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | imecPcvc5 |
| 2026-09-10T05:51:20.26Z | [bc63c48c](https://certscore.ai/app/admin/mcp?q=bc63c48c-666d-4847-b6e9-07a8e3e5b70a&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | F86 |
| 2026-09-10T05:51:20.306Z | [63c42bb2](https://certscore.ai/app/admin/mcp?q=63c42bb2-96b1-4892-97ca-9ae85c8fdf72&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | LvEC8V8l5k |
| 2026-09-10T05:51:20.317Z | [b7c60189](https://certscore.ai/app/admin/mcp?q=b7c60189-d90a-47eb-9802-56aebe5065a8&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | jFnRK9A3LSa |
| 2026-09-10T05:51:20.41Z | [7fe1acef](https://certscore.ai/app/admin/mcp?q=7fe1acef-2a81-4f7f-a3d2-7e33d4ef0986&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | VojOXQf2cXX |
| 2026-09-10T05:51:20.414Z | [331c5088](https://certscore.ai/app/admin/mcp?q=331c5088-56a6-470a-a8db-cd5bd3c0e5fd&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | wqkjbM |
| 2026-09-10T05:51:20.544Z | [37130d49](https://certscore.ai/app/admin/mcp?q=37130d49-d439-403c-bbfc-255145d8e225&timeSpan=all&traffic=all) | Yes | alpic-beacon-ai-review | `invalid_scan_id` | HHktT5KWY7 |
| 2026-09-10T06:14:17.379Z | [b230aad4](https://certscore.ai/app/admin/mcp?q=b230aad4-93a6-4f03-9a31-2ae2ae4839f3&timeSpan=all&traffic=all) | Yes | verifymcp-probe | `unknown_tool` | — |
| 2026-09-10T08:33:27.87Z | [1d215a9f](https://certscore.ai/app/admin/mcp?q=1d215a9f-e5a6-48fa-aeb1-b05d376c43c8&timeSpan=all&traffic=all) | No | agentstatus-probe | `invalid_arguments` | ergoveritas.com |
| 2026-09-10T09:25:05.94Z | [5a0f6ced](https://certscore.ai/app/admin/mcp?q=5a0f6ced-26f6-42e4-9872-21fd946b59fb&timeSpan=all&traffic=all) | Yes | cracked-probe | `invalid_scan_id` | test |
| 2026-09-10T18:44:43.732Z | [9c325072](https://certscore.ai/app/admin/mcp?q=9c325072-bacb-4615-b321-f6bf9e985235&timeSpan=all&traffic=all) | No | agentstatus-probe | `invalid_arguments` | ergoveritas.com |
| 2026-09-10T23:16:47.044Z | [7bebc79d](https://certscore.ai/app/admin/mcp?q=7bebc79d-d1ba-41e1-9998-54aa9c1ffab8&timeSpan=all&traffic=all) | Yes | openai-mcp (codex) | `invalid_url` | aaronbux.com |
| 2026-09-11T03:04:58.808Z | [e3747f98](https://certscore.ai/app/admin/mcp?q=e3747f98-db8f-4f0b-a3a9-02ec8ca07691&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-11T03:04:58.842Z | [cebb4097](https://certscore.ai/app/admin/mcp?q=cebb4097-5425-4f28-8f28-94af525acd41&timeSpan=all&traffic=all) | Yes | mcp-probe | `invalid_scan_id` | x |
| 2026-09-11T06:14:19.6Z | [e82ac645](https://certscore.ai/app/admin/mcp?q=e82ac645-cf68-43b9-bc43-1659404b8f62&timeSpan=all&traffic=all) | Yes | verifymcp-probe | `unknown_tool` | — |
| 2026-09-11T09:25:17.358Z | [ab54c8b7](https://certscore.ai/app/admin/mcp?q=ab54c8b7-1857-4820-97ee-38b8f5a2e5a8&timeSpan=all&traffic=all) | Yes | cracked-probe | `invalid_scan_id` | test |
