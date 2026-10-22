# CertScore.ai Hotjar coverage verification

Local owner-authorized verification, coverage changes and retained replay; October 22, 2026. No Options panels, live scans, deployment or production report rewrite.

## Primary source verification

The official legacy help article and Zendesk API returned 404. Archive discovery was unavailable (timeout/rate limit). Rather than infer rules from customer lists, inspect the vendor-distributed loader at `https://static.hotjar.com/c/hotjar-1473729.js?sv=6`. Its SHA-256 is `b122ad41b4f58ebeec4fa5c75dc10aaef546f9c3edeee1a52664ed93fc62de8f`. It directly references `https://script.hotjar.com/modules.96a30129fbe7c16f762f.js`, retrieved successfully with SHA-256 `50308a83a0d455d5af72946eb5e1e186552f9dd6ca6e88372210552c01c40116`. These were source-only HTTP reads, with no script execution, interaction or target scan.

The module's storage definitions bind numeric site IDs to `_hjSessionUser_` and `_hjSession_`. The user serializer persists a generated identity and creation state; the session serializer persists identity, sampling/recording flags and session state. The event sender posts to `https://events.hotjar.io/`. Receipts, offsets and bounded source excerpts are in `artifacts/hotjar-coverage-fixes-2026-10-22/vendor-code-verification.json`.

## Implementation and eligibility

Append only the exact numeric-site-scoped session/user cookie pattern to the local unreleased cookie-purpose v6 coverage table. Both cookies share the existing Hotjar entity. Preserve v5 and older historical classification. Do not classify all `_hj` cookies, infer an actual cookie from a policy/CMP declaration, accept placeholder/wildcard suffixes, or infer active recording from sampling/recording flags being present.

Resolver v12 adds exact event-collector endpoint attribution. This fixes a hostname-only discovery gap: future already-issued collector traffic can use existing typed request capture and the California potential-risk pipeline on both GPC and Reject. The SDK's two-line JSON body remains explicitly unsupported by the generic body inspector; discovery and successful response can establish potential-risk collection without inventing body identifiers or full sale/sharing purpose. Unsupported body metadata never upgrades a full recipient qualification. Script downloads stay ineligible for collection. Preserve recipient deduplication across cookies/services and GPC/Reject, full-vs-potential treatment, source/choice/session proof, EU presence scoring and the canonical persisted assessment -> normalized concern -> concern policy -> unified finding/checklist -> score flow.

## Replay

Replay all 122 earlier and 47 later scan records against the preceding vendor-coverage replay, checking 359 original main/worker/packet size/hash references. Hotjar adds zero EU and zero CA deductions in either cohort. No observed Hotjar cookies were found in the original/GPC cookie observations or retained action evidence; retained runtime Hotjar requests are loader downloads on uoguelph.ca, jta.org and observador.pt. Policy/CMP inventories containing Hotjar cookie names are declarations, not runtime observations. The seven previous vendor-coverage EU increases (+47 aggregate family points) remain unchanged.

## Addressing remaining CA proof gaps

Preserve source/session/document identity and action timing before downstream projection; retain already-observed HTTP status and completion inside existing response callbacks; prioritize distinct supported collectors within the existing 48 inspection/32 proof caps. Existing capture fixes already implement response retention and bounded recipient selection. This change adds Hotjar's supported collector; it does not add reads, slots or waits. Replay can recover interpretation errors when positive facts were retained, but cannot reconstruct a discarded response/body or claim an unobserved request occurred. Any future verification rerun requires separate authorization.

The audit also identifies a separate current California choice-scope gate: five EU-positive earlier paths have retained source identity but labels `Reject`, `Decline` or `Reject Optional Cookies` that do not meet the narrower CA scope selector. This is an assessment/context question, not automatically missing capture and not failed click confirmation. Recommend using the canonical label classifier plus retained CMP/action context to resolve cookie-tracking scope, with focused ambiguity tests and versioned assessment policy. No scope-policy expansion is implemented in this Hotjar change.

Four EU-positive scans (Pella, ReadCube, Sits, Ovid) each have one response-unverified Reject review candidate. This is candidate-level coverage, not a claim that four additional deductions would follow: successful response, exact path and recipient deduplication still determine eligibility. Missing proof remains unknown.

## Budgets and verification

No new browser work, request/header reads, retries, waits, model calls, larger workers or increased caps. Incremental classification/proof metadata storage estimated below $0.10/month at 100,000 scans and 30-day retention, within existing item caps; disclosed before implementation. No raw identifiers or request bodies are added to retained proof. Deterministic tests cover exact cookie boundaries, preserved historical purpose semantics, unsupported body diagnostics, GPC/Reject potential-risk eligibility, failed/missing responses, persisted EU projection and cross-path/entity deduplication.
