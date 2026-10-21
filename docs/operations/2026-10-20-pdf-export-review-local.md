# CertScore.ai PDF export review — local verification

The later [20-comment annotation follow-up](2026-10-20-pdf-annotation-follow-up.md) supersedes this pass's 18-page layout: the final export is 17 pages, with all appendices starting on new pages, consolidated Accept/Reject evidence, and the same score and disclosure treatment.

## Scope and result

Local implementation and verification only. No commit, push, deployment, production data mutation, scanner flag change, extra capture lane, longer observation window, model call, or retention change was introduced.

The final fresh local scan is `95c4d765-01ee-4689-b9f7-201ee9d1793f`, for `https://ergoveritas.com/test1.html`. The canonical score remains 43. The PDF uses four review areas containing eight distinct projected observations; its grouping does not create findings or alter severity, confidence evidence, eligibility, or scoring. GPC remains a separately described signal.

The authenticated export returned HTTP 200 with an attachment PDF; anonymous access returned HTTP 401. The final sample has 18 pages, 14 top-level bookmarks, 47 named destinations, and 69 valid internal links. The PDF has no rendered localhost, S3, local-parity, source-hash, or storage-snapshot pointer strings. Automated page-bound and word-overlap checks passed, followed by visual inspection of all 18 rendered pages. Export and QA receipts are in `output/pdf/ergoveritas-pdf-review/`.

## Follow-up: 15–18-page presentation pass

The owner requested the remaining presentation work while explicitly preserving the score and disclosure treatment. The existing completed scan was re-exported; no new scan or browser capture was needed.

- Replaced forced appendix page breaks with measured continuous flow. Kept short evidence headings with their content, repeated table headers on continuation pages, and preserved long-cell continuation without a page-count cap or truncation.
- Consolidated repeated workpaper/source panels into one shared destination, repeated OneTrust guidance into one shared plan, and the re-test protocol into the remediation chapter. Removed only duplicate representations of CMP identity, control states and numerical charts; the corresponding facts remain in text/tables. Body and table font sizes were not reduced.
- Added a magnified Accept/Reject control detail beside the complete original screenshot. Overlays require a schema-valid persisted assessment, matching scan/document/candidate identities, exact screenshot SHA-256 and matching image dimensions. Invalid or withheld proof fails closed. The original image pixels are still embedded unchanged; the full capture is fitted without silently clipping tall images.
- Added high-confidence, exact-cookie-name service cross-references without changing cookie purposes, classifications, setter attribution, findings or scores. Clarified that service-request observations do not prove iframe presence. Removed a legacy Potential issue preamble from an already-projected Gap observed row without altering the row's canonical state or evidence.
- Added a separately labeled Reject-session timing visual, using only source-packet-bound request offsets and verified in-flight exclusion. The sample shows the request starting 71 ms after the observed confirmation, separately from initial-page timing. Measured 346 ms Reject and 3 s Accept windows remain explicit; the nominal window is not mislabeled as measured coverage.
- Missing browser-profile metadata and the unavailable post-Reject screenshot are disclosed rather than invented. No score-driver/recovery estimate, new canary ownership label, classification upgrade or new capture was introduced.

`evidence-preservation.json` records exact equality of all pre-existing exported report data after excluding only the generation timestamp and the newly added source-bound request-timing summary. It also verifies 67 distinct previously rendered evidence values and identical embedded screenshot/logo pixels. Renderer regression tests additionally assert preservation of every fixture evidence-table cell and long-cell endings.

## Review disposition

| Item | Disposition |
| --- | --- |
| 1 | Added a fail-closed PDF text/link guard before wrapping and again before serialization. It blocks localhost, private IPv4/IPv6 including mapped/encoded forms, S3 pointers, and local-parity paths. The API returns a generic 422. Private application origins do not produce broken public workpaper links. JSON evidence is preserved. |
| 2 | PDF location is Ireland (EU), preserving the `eu_ie` contract. Other product surfaces retain their existing labels. |
| 3 | Fixed the shared canonical presentation input to expose normalized vendor/count entities. Fixed review-level replay timing without promoting its assessment state. Removed customer requests to audit the detector. The fresh finding describes observed vendor artifacts; impact and confidence are separately labeled. A request/library is not represented as proof of recorded content. |
| 4 | The PDF identifies the exact tested page as affected. Vendor resources remain request/domain evidence rather than affected pages. |
| 5 | One PDF review projection supplies group and observation counts. Duplicate checklist IDs fail the build. Checklist/finding overlaps are coalesced; distinct service rows and source-row totals are separately labeled. Directly anchored vendor claims are not expanded to all related/inferred vendors. |
| 6 | Root-cause review uses the canonical checklist status throughout and includes one state/impact/confidence legend. Removed the contradictory legacy Potential issue preamble from the already-projected post-Reject gap. CMP audit criteria and resource classifications remain their own named dimensions; their typed assessments are not rewritten. |
| 7 | Distinguishes instrumented request/write events from cookie-snapshot changes. It does not invent an exclusion of CMP writes. |
| 8 | False/absent third-party setter attribution displays Not determined. A verified true attribution is still shown. |
| 9 | Verified the public canary script explicitly writes the test cookies and OptanonConsent with Max-Age=900. The 899-second remaining lifetime is an observation, not an invented expiry. No new short-consent-lifetime finding or scoring rule was introduced. |
| 10 | Groups overlapping projected observations into four review areas and one remediation plan per area. Replay is supporting context in initial tracking; device identification remains separately reviewable. |
| 11 | Includes the canonical missing-policy checklist gap in the overview and keeps GPC outside the GDPR/ePrivacy review-area chart. |
| 12 | Uses confidence words, separate from canonical impact. Limited confidence explicitly says verify first; scores/confidence evidence are not silently upgraded. |
| 13 | Adds request/write type totals, measured choice windows, unequal-window explanation, and in-flight exclusion proof only when bound to the canonical source packet. The final sample verifies that exclusion and identifies the registration timestamp as an observation upper bound. |
| 14 | New canonical copy says observed after the refusal confirmation. Accept is described as a comparison baseline. Score presentation remains unchanged as requested; no deduction/recovery explanation was added. |
| 15 | Adds What we tested, Root-cause review, Remediation plan, How to re-test, and a final Methodology and limitations chapter. |
| 16 | Shows the exact tested URL and explains the starting-page scope. |
| 17 | Removes mixed raw snippet/entity packets, hashes, classifier versions and repeated internal evidence-reference lists from the reader layer; original packets remain in JSON. |
| 18 | Removes global checklist numbering and numbers displayed inventories within each appendix. |
| 19 | The original PDF already had bookmarks; expanded the outline to include the new reader chapters and added a short contents block. |
| 20 | Replaces clipped priority-action prose with a complete link to the remediation plan. Full steps appear in the plan. |
| 21 | Uses neutral control-visibility dots and a separate After Reject: review required caption when that canonical gap exists. Observed controls are not relabeled as successful enforcement. |
| 22 | Uses specific projected observations in the assessment paragraph rather than saying the assessment needs work. The timeline reports the actual measured event times; it does not infer a six-vendor collection claim from vendor presence alone. |
| 23 | The follow-up explicitly preserves the score and disclosure treatment. The standing prohibition on customer deduction/recovery explanations is preserved. The existing score band is shown, without estimated recovery or a new scoring policy. |
| 24 | Replaces empty forms/accessibility plots with meaningful zero-result labels and the actual evaluated-rule count. |
| 25 | Adds canonical report and exact-URL re-test links when a public application origin is configured. Local-only PDFs retain the scan ID and omit unavailable public links. Verified the re-test destination prefills the exact URL without submitting a scan. |
| 26 | Adds an observed timing sequence on the executive summary and in What we tested, plus a separately labeled source-bound Reject-session confirmation/request sequence. Independent session clocks and measured choice windows are not conflated. |
| 27 | Adds a vendor choice-state request matrix from the existing inventory and bounded action samples. Columns report displayed requests and window lengths; limited samples are labeled. |
| 28 | Merges Unknown/Unknown purpose chart labels and shows related high-confidence service entries matched by exact cookie name. The association is explicitly not proof of that cookie's purpose or setter. Cookie classification remains conservative and unchanged; no display-only purpose upgrade is introduced. |
| 29 | Splits transport facts by their actual check upstream, merges duplicate control observations, deduplicates equivalent service rows for display, removes repeated per-cookie network-flow prose and duplicate reference lists. Original evidence remains in JSON. |
| 30 | Removes the generic Retained excerpt treatment of finding snippets. Policy-source facts remain explicitly sourced; scanner commentary is not presented as a quotation from the site. |
| 31 | Collapses unresolved disclosure checks into one topic list when there are no policy passages. Missing text is not promoted to ten missing-disclosure findings. |
| 32 | Keeps the complete original capture inline and adds a magnified control detail with Accept/Reject overlays only after exact byte/dimension and canonical document/candidate verification. The post-Reject screenshot is unavailable and explicitly identified as such; request/write evidence supports that observation instead. No extra capture or fabricated image was added. |
| 33 | Fixed normalized evidence construction: arbitrary string arrays and mismatch commentary no longer become policy quotations. The final fresh pre-consent packet no longer has explicit_policy_snippet_retained. |
| 34 | Adds conditional OneTrust blocking/category guidance and links to official client-side and GTM documentation. This is implementation guidance, not a claim that the canary runs a full OneTrust deployment. |
| 35 | Device-identification remediation investigates API use and identifier linkage rather than replay masking. Pixel/service observations are labeled as service requests and explicitly distinguished from iframe proof. Canonical resource classifications, finding eligibility and evidence remain unchanged. |
| 36 | Replaces repeated action-level boilerplate with one issue-specific plan and re-test procedure per review area. |
| 37 | Adds owner roles and explicitly labeled effort estimates. These are planning suggestions, not facts about the recipient's staffing. |
| 38 | Removes most repeated retained wording from the body; technical context remains in methodology/JSON. |
| 39 | Humanizes common displayed enums and acronym casing without altering evidence keys. |
| 40 | Corrects common URL/plural/punctuation wording and removes raw counter keys from narrative evidence. Table cells continue through the existing measured layout. |
| 41 | Derives a missing display duration from the recorded start/completion timestamps. |
| 42 | Moves the existing legal-status notice onto page one and preserves full methodology wording. |
| 43 | Reduced this sample from the original 43 pages through a 26-page baseline to 18 pages, meeting the requested range. Preserved existing report data, rendered evidence values, original image pixels and readable body/table type; no evidence truncation or hard page-count cap was introduced. |

The owner explicitly chose to keep the current canary-disclosure treatment. No new ownership label was added to the PDF.

## Validation and remaining limits

- 601 focused pipeline, policy, export, branding, safety, reader, visual-proof and scan-form tests passed on the final source. The earlier focused replay-copy tests also passed.
- The web typecheck passed. No production build/deploy gate was claimed.
- The broader legacy canonical-copy suite has 11 pre-existing failures, reproduced using its original HEAD presentation source. These unrelated expectations were not repaired as part of this work.
- The verified export uses the existing local Lambda simulator with real browser evidence capture. Temporary local auth sessions are removed by the verification harness.
- Public production-origin CTA links are structurally tested, but this local scan ID is not a production report; no production record was created to make such a link resolve.
- Cookie-purpose reclassification, collection of new post-Reject screenshots, and score-explanation policy changes are not presentation fixes and were not introduced. The PDF now explicitly distinguishes related service attribution from unconfirmed cookie purpose and pre-choice screenshots from post-Reject request evidence.

Incremental recurring infrastructure cost: $0/month. There is no additional browser work per production scan, model/API call, provisioned capacity, stored PDF, retention increase or background job. PDF generation remains on demand; removing verbose content reduces the reviewed sample's export bytes.

OneTrust guidance uses its official [client-side management documentation](https://my.onetrust.com/s/article/UUID-518074a1-a6da-81c3-be52-bae7685d9c94?language=en_US) and [Google Tag Manager integration documentation](https://docs.onetrust.com/en/consent--preferences/cookie-consent/third-party-integrations-and-blocking-guidance/cookie-consent-integration-with-google-tag-manager).
