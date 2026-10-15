# Google consent-mode interpretation: local review

Status: local implementation only. No push, deployment, production writes, rescoring, historical backfill, or new public scans.

## Evidence and article correction

The independent anonymous EU-Ireland visit retained in `outputs/mistral-disclosure-review-2026-10-14/evidence-headed.json` observed Mistral naming Google Analytics 4, its switch initially off, and Close, Accept all and Next controls. A GA collection request carried `gcs=G100`, a `gcd` parameter, and `npa=1`. No Analytics cookies were observed in that bounded capture. No controls were clicked. The separate headless capture did not render the same panel and is not the source for UI statements.

The article's summary, Mistral row and finding paragraph now distinguish the original request observation from this independent check. The score remains 62. All ten row URLs, every score, the original reports, social assets, methodology, other findings and structured data are preserved. The article preview is `http://localhost:3000/insights/ai-lab-privacy-leaderboard-2026#findings`.

## Implementation

Production Lambda runtime code lives in this repository's v2 packages. This follows the AGENTS.md Runtime and deployment topology instruction, which explicitly supersedes the older WS01 runtime boundary for production scanner changes.

- Canonical vendor resolution must identify an exact Google Analytics collection endpoint. Google ownership, tag libraries and lookalike hosts are insufficient.
- The existing passive runtime and separately authorized Accept/Reject observers retain optional `google-consent-mode-request.v1` metadata before URL sanitization. There are no additional browser sessions, interactions, waits, invocations or model calls. Action authorization and semantic registration are unchanged.
- Retained fields are request ID, time, endpoint origin/path, allowlisted GCS code, GCD presence, and a bounded non-personalized-ads declaration. No arbitrary query values, raw GCD encoding, client IDs, cookie values or page URLs are added.
- WC01 materialization validates the typed observation against the same canonical request and persists `google-consent-mode-interpretation.v1` in the existing request-purpose row. Existing bundle verification, source hash and lane provenance remain authoritative.
- G100 means the request declares advertising and analytics storage denied. G111 declares both granted. G101/G110 remain mixed without assigning individual flags. Missing, duplicate or unsupported GCS remains unknown. GCD presence and NPA alone never establish denied storage.
- Normalized concern, concern policy and unified finding projections retain the typed context. The shared checklist request/timing description can say that an Analytics measurement request declared storage consent denied. Reading typed context requires matching request, time, endpoint and retained evidence reference. Legacy query strings are never reinterpreted on read.
- Request eligibility, essentiality, severity, scoring, consent-control availability and Accept/Reject registration are unchanged. Denied flags do not erase observed requests or cookies, establish cookie absence, prove refusal, or determine legal compliance. Action packets retain the context for evidence review; this change does not add a new After Accept/Reject interpretation or scoring policy.

Scope is Google Analytics query declarations. Unknown encodings, request-body-only flags, other Google services, first-party measurement proxies and other consent-mode implementations remain outside this version. Close is not relabeled as Reject, and no CMP recipe is added.

## References

- [Google consent-mode concepts](https://developers.google.com/tag-platform/security/concepts/consent-mode): denied analytics storage can still produce measurement requests; GCS carries storage choices; GCD is sent even without consent mode and encodings may change.
- [Google Marketing Solutions Argos documentation](https://github.com/google-marketing-solutions/gps-sgtm-pantheon/blob/main/sgtm/argos/README.md): bounded G100/G111 interpretation and the four recognized GCS values.

## Validation and limits

- 30 focused tests pass, including a local browser fixture with stubbed GA traffic, malformed/duplicate flags, lookalikes, binding drift, legacy behavior, independent cookie facts, normalized concern/policy and unified finding preservation.
- 457 existing unified-finding, coverage-policy and checklist tests pass.
- The materialization regression preserves request classification, validation findings, snapshot, checklist statuses and score assessment with and without the new metadata.
- Contracts/vendor builds and scanner/web typechecks pass.
- The retained OpenAI report still renders score 75 with unchanged findings and score explanation.
- Article publishing validation and all nine publishing-plan tests pass. All links and scores compare exactly to the prior local article. Desktop and 390px mobile previews have no horizontal overflow or em dashes.
- The broader report-materialization suite has an existing failure in `materialization retains visual comparison only with the original image hash in the manifest`, at line 9538. The same assertion fails with all tracked sources restored to baseline commit `967ea2b905ad5e894cc42be8aa2ad89419e6558e`. This remains unresolved and is not attributed to consent-mode metadata. No release readiness claim is made.

Verification logs and preview images are local under `outputs/mistral-consent-mode-local-2026-10-14/`. The independent EU capture and the synthetic local fixture are separate evidence sets. Local fixtures do not claim Ireland egress or a fresh public-site observation.

## Cost

Actual AWS/model cost for this local implementation: $0. No infrastructure or retention settings changed. If later deployed, the expected bounded metadata/compute increase is below $0.25/month at 100,000 scans/month, assuming up to ten qualifying GA requests per scan, approximately 400 bytes per observation, ordinary existing artifact retention and unchanged database capacity. This is below the $1/month approval threshold and was disclosed before proceeding. Re-estimate before rollout if traffic, retention or capacity assumptions differ. No new standing capacity, browser lane, invocation or model call is introduced.
