# Detailed Evidence saved-report fixes — October 14, 2026

Initial verification was local, with no deployment, package publication or fresh scan. The subsequent owner-authorized release is recorded in [production verification](certscore-v2/releases/2026-10-14-detailed-evidence-fixes-production-verification.md).

## Changes

- Full MCP bundles no longer run typed Pulse fields through generic compaction. The saved MiniMax response contained 80 valid string request-event IDs; compaction previously replaced the final 30 with an object, violating the output schema. Typed fields now remain intact. Existing envelope limits still explicitly omit a full report that does not fit; comparison evidence is never silently shortened.
- Full report exports and `section=policy` retain validated, same-scan `privacyAuditEvidence`. California-focused reports also export the existing California privacy choices section through the shared presentation contract. Verified controls, unverified candidates, notice passages and provenance remain distinct. SDK types and generated OpenAPI mirrors include this section. MCP privacy navigation points to focused policy evidence.
- The website and export share California section titles, recaps and header states. Workpaper rows describe retained evidence, not additional canonical findings. Missing, malformed or cross-scan evidence remains unavailable; missing controls do not become absence findings.
- Old deferred-automation summaries now say “Post-choice tracking was not assessed in this saved scan.” Generic policy uncertainty says “This disclosure could not be confirmed from the saved policy evidence.” Specific failures, original supporting evidence and source assessments remain intact.

## Saved-data verification

All verification ran locally against previously saved production responses. Fetch was replaced with an offline adapter that rejects unexpected requests and mutations. API projection/pagination, SDK reconstruction and real in-memory MCP tool delivery were compared.

| Saved report | Scan ID | Score | Findings | Result |
| --- | --- | ---: | ---: | --- |
| MiniMax, no priority issues | `50620d0a-abd3-4399-8a09-39207ac8df79` | 100 | 0 | Policy parity; full MCP output validates with all 80 proof IDs retained |
| AdPushup, many issues | `3165a11c-2756-4ff2-b07a-61c8940d5d8a` | 39 | 5 | Policy/California evidence parity |
| Limited-evidence ErgoVeritas canary | `9ba99a8c-b1ad-44c1-985f-92cef760ab40` | 92 | 1 | Limited states retained; no California card in EU focus |
| SITS | `a68a5b3b-df92-429a-bbef-975aa2fdddf0` | 82 | 2 | Policy parity; source assessments unchanged |

The saved public CMS section was preserved verbatim in replay because the public export does not contain the internal CMS assessment. No CMS reassessment was inferred from that missing internal data. Canonical score, findings, CMP support, policy evidence and source row statuses were compared with the saved originals.

Receipt: local `artifacts/detailed-evidence-edge-audit-20261014/fix-verification.json` in the primary checkout. Reusable replay: `scripts/verify-detailed-evidence-saved-reports.mts` (use a tsx configuration with `jsx: react-jsx`).

Validation: API contracts 25 tests; SDK 37 tests; MCP 159 tests; focused web presentation/export/layout 25 tests; web and SDK TypeScript checks; API/SDK/MCP builds; generated-contract drift check; MCP release guards; diff whitespace check. The regression tests cover strict output validation, whole-section budget omission, nested typed data, privacy candidates versus verified controls, missing/cross-scan sources, pagination reconstruction, shared website/export headers, and legacy copy without source mutation.

## Latency and cost

No scanner change, lane, wait, retry, model call, new scan, production request, storage write, infrastructure or capacity change was introduced. Existing response ceilings and pagination remain unchanged. New recurring scanner/model/storage/provisioning cost: $0. Export formatting/transfer can vary slightly; estimated incremental on-demand cost is below $1/month at 100,000 evidence reads, pre-approved by the repository policy and disclosed during implementation. This estimate is not a measured production billing change. No production latency claim is inferred from the offline replay.
