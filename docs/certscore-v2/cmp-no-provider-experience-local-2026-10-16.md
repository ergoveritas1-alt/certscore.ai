# Consent details when a CMP is not identified

Local implementation only. No deployment, public scan, Options click, database write or report replacement.

## Shared presentation policy

`cmp_details_experience.v1` is additive presentation metadata on the canonical CMP report projection. It does not change the retained assessment, row statuses, applicability, concern eligibility, scoring or interaction authorization.

| Retained result | Section title | Default view |
| --- | --- | --- |
| Usable consent assessment and a provider identified through the canonical CMP registry | CMP details | Existing 13 criteria and evidence |
| Consent surface or controls observed, provider unidentified | Consent controls | Binary A/R/O report summary, banner and Reject checks, available measurements, action results and other supported evidence |
| Complete, document-bound inspection with no observed consent surface, all controls internally not observed and no contradictions | Consent and cookie signals | Factual visit summary, available policy and runtime evidence, links to related evidence |
| Missing, malformed, blocked, mismatched or otherwise unresolved consent capture | Consent capture limited | Limited label, available independently supported evidence, retained details |

A usable limited visit with unknown controls cannot establish the no-surface mode. Withheld screenshots do not veto valid structured controls. Provider recognition selects presentation only. It cannot establish a consent surface, absence or compliance.

All 13 rows remain in the projection and API export, with their original statuses and source references. Remaining rows stay accessible through the collapsed All retained checks disclosure. Its recap retains full counts. A collapsed check is not resolved, and missing CMP identity does not create a deduction or convert unknown to Not applicable. Existing review findings and supporting evidence remain in the default view.

The report and API section titles/recaps use the same metadata. The API contract generates the OpenAPI mirror and SDK types. SDK, authenticated MCP and MCP Light carry it unchanged. A/R/O values use the existing binary reportability policy, not a new assertion of verified absence or action registration. Historical report models without this metadata retain their existing full audit; the absence of presentation metadata does not establish missing controls. Rebuilding a report model from its retained canonical assessment supplies the new presentation without changing stored conclusions.

## Local verification

Artifacts: `/Users/benmasek/WC01/outputs/cmp-no-provider-experience-local-2026-10-16`.

- 123 focused tests passed, including incomplete/blocked/wrong-scan/document binding, withheld images, all four modes, full criterion preservation and API pagination/SDK reconstruction.
- Web, API contracts, SDK and MCP typechecks passed. Generated contract drift check passed.
- Replayed 12 retained report models: eight CMP providers plus Hugging Face, DeepMind, Cohere and xAI. The eight previously prepared provider models match every original non-CMP field, including scores and findings, and all original CMP fields. Only additive experience metadata differs.
- Hugging Face projects to Consent and cookie signals. DeepMind and xAI remain Consent capture limited for those retained visits; they are not reclassified as complete no-surface captures. Cohere remains CMP details with CookieYes.
- 48 report/section cases passed actual loopback API GET, source SDK, full/Light MCP protocol and download parity checks: 12 retained models and four explicitly synthetic boundary fixtures, each through CMP, consent and full selections. All report model file hashes stayed unchanged. Storage, credential validation, throttling and report loading are fixture adapters; this does not claim production infrastructure or identity-provider verification.
- Eight static React/CSS desktop/mobile renders passed at 1280 and 390 pixels. No page overflow or missing evidence targets; all 13 criterion anchors remain available and retained-check disclosures open. Reviewed screenshots of the no-surface and custom-control layouts. This checks static component layout, not a full hydrated Next.js session.
- No external traffic, new scans, persisted reports or scores, scanner lane changes, additional waits, model calls or deployment.

## Cost

Experience metadata measured 229 to 477 bytes on the retained examples, below 1 KB. Conservative incremental transfer and optional artifact retention estimate: under $0.25/month at 100,000 scans/month, up to four 1 KB copies per scan and one year retention. No new infrastructure, paid model usage, scan compute or retention policy. Local replay and verification used no AWS or model calls.

## Owner-requested no-CMP simplification

The owner subsequently removed All retained checks, shortcut links and the duplicate observed privacy-policy row from the `consent_signals` web view. Keep Provider: Not identified and the factual visit summary. Supported review rows remain visible. Identified CMP, custom-control and limited-capture views retain their previous behavior.

This is a component-only presentation change. Underlying projection metadata, all 13 assessment rows, public exports, counts, source references and scores are unchanged. Invisible navigation aliases preserve existing criterion targets by routing them to the section; they do not render check rows or create evidence. Policy evidence remains in Policies & disclosures.

Verification artifacts: `/Users/benmasek/WC01/outputs/cmp-no-provider-simplify-local-2026-10-16`. Passed 38 focused component/export/layout tests and 48 actual local API/SDK/MCP/download cases. Web typecheck passed. Refreshed and visually verified the retained Hugging Face example in the in-app browser. No new scans, infrastructure cost or deployment.
