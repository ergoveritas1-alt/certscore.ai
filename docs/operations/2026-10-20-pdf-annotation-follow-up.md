# CertScore.ai PDF annotation follow-up

## Result

Applied the owner's 20 annotations to the same completed local ErgoVeritas scan, `95c4d765-01ee-4689-b9f7-201ee9d1793f`. The final PDF has 17 pages. The canonical score remains 43, and the disclosure treatment is unchanged. There was no new scan, browser capture, model call, deployment, commit or push.

The new layout supersedes the previous continuous-appendix layout: all seven appendices now start at the top of their own pages. Certificate evidence is consolidated into Webserver security rather than given a separate overlapping appendix. Canonical topic identifiers and the JSON workpaper remain unchanged.

## Annotation disposition

| Comment | Applied change |
| --- | --- |
| 1 | PDF download controls attach the browser's recognized time zone. The API validates it, and the PDF prints the localized time, daylight-saving abbreviation and zone identity. This export shows 20 Oct 2026, 14:30 PDT (America/Los_Angeles), distinct from the Ireland scan location. Unknown viewer zones fall back explicitly to UTC; source timestamps remain unchanged. |
| 2 | Rewrote the assessment to lead with projected tracking, refusal-enforcement and privacy-notice gaps plus concrete next steps, rather than a supporting cookie-classification uncertainty. Kept factual scope and qualifications; added no raw-signal inference, finding or score effect. |
| 3 | Removed floating appendix-letter markers from the priority list. |
| 4 | Removed floating appendix-letter markers from topic tiles. |
| 5 | Renamed the topic and Appendix A to CMP and consent. Appendix letters remain in appendix headings, not as unexplained tile badges. |
| 6 | Spelled out Transport security in the Webserver security tile. |
| 7 | The tile now shows HTTPS delivery, HTTP redirect, mixed-content and certificate results, plus expiry. The appendix preserves the certificate subject, issuer, dates, chain and validation evidence. |
| 8 | Merged the overlapping certificate/transport topic into Webserver security. There is no separate TLS tile or appendix. |
| 9 | Replaced the abstract external-domain network graphic with service/domain totals, purpose counts and the count observed before choice. |
| 10 | Verified the persisted runtime-lane accessibility packet: completed axe-core 4.11.3 audit, 63 evaluated rules, zero violations and zero review items. The summary reports those bounded automated results and explicitly says this is not a manual audit. Missing or contradictory audit evidence cannot render a clean zero. |
| 11 | Removed timing sequences from the executive summary and test-context page. Initial-page and Reject-session sequences are now together in the CMP evidence, with their separate time origins named in one table. |
| 12 | Moved detailed request offsets, exclusion proof, measured Accept/Reject windows and event totals into Appendix A. What we tested retains general scope and timestamps, with a link to the CMP detail. |
| 13 | Renamed Root-cause review to Top issues in the chapter, summary card, contents and PDF outline. |
| 14 | Explains that zero is the observed total for one bounded session, not a separate three-second test or pass for every vendor. Acceptance remains unconfirmed in this source record and is not upgraded. |
| 15 | Removed the repeated per-vendor zero matrix. One row per choice describes the session; only actual observed requests receive request-detail rows. |
| 16 | Consolidated execution, confirmation, measured windows, network totals, consent-record changes, request evidence, timing and expiry into one Accept/Reject results block on page 7. First-layer availability evidence is grouped before it; GPC and captures follow separately. |
| 17 | Removed the four in-page navigation buttons from every appendix. PDF bookmarks and summary topic links remain. |
| 18 | Same removal applies to Webserver security. |
| 19 | Appendices A–G begin on pages 5, 9, 11, 12, 13, 15 and 17, each as the first content heading below the running header. |
| 20 | Same navigation-button removal applies to External services / domains. |

## Verification

- 616 focused tests pass, including client PDF-link/query handling, time-zone validation and daylight-saving formatting, canonical presentation, consolidated choice paths, export authorization, long evidence cells, image binding and unchanged source data.
- Web typecheck and `git diff --check` pass. Component tests use a local React test bootstrap for legacy components normally compiled by Next.js; no unrelated React-source repair was made.
- Authenticated local PDF export returns HTTP 200; anonymous export remains HTTP 401. The local site remains available on port 3000.
- All pre-existing JSON report data is identical to the annotated 18-page baseline after excluding only the generation timestamp. Score, evidence, classifications, confidence, disclosure and source timestamps are unchanged.
- Separately checked 67 distinct previously rendered evidence values and identical embedded screenshot/logo pixels against the earlier 26-page baseline. Renderer tests verify every fixture evidence-table cell and long-cell endings.
- All 17 pages were rendered and visually reviewed. Automated checks find no text-bound violations, overlapping words, private infrastructure strings or broken internal links. The PDF has 13 top-level bookmarks, 42 named destinations and 37 valid internal links.
- `annotation-verification.json`, `evidence-preservation.json`, `pdf-validation.json`, the PDF and its full JSON workpaper are in `output/pdf/ergoveritas-pdf-review/`.

The earlier broader legacy canonical-copy suite's 11 reproduced pre-existing failures remain outside this focused presentation change. No production build or deployment gate is claimed.

Estimated incremental recurring infrastructure cost: $0/month. There is no added per-scan browser work, model/API usage, provisioned capacity, retention or background job. Viewer-zone formatting is local presentation work; exports remain on demand and this PDF is smaller than the annotated baseline.
