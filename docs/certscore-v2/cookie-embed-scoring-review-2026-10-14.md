# Cookie, embed and after-Reject scoring review

Status: local implementation and policy proposal, October 14, 2026. No deployment, production writes, rescans or leaderboard publication are authorized by this document. Original reports retain their original evidence, score versions and amounts.

## Implemented locally

`certscore.cookie-purpose.v2` extends the shared cookie registry for new captures:

- Exact CookieYes and existing Axeptio preference-cookie identities are consent management.
- Exact `aws-waf-token` is security, consistent with existing security-cookie scoring.
- `country`, `locale` and `oai-did` are documented service functionality only when the cookie domain is exactly `openai.com`. Setter, ancestor, generic name or similar domain alone cannot establish this context.
- `GCLB` has a documented infrastructure purpose, but remains unknown for essentiality until deployment-specific evidence supports that conclusion.
- Unverified identifiers, including `gb_anon_id`, `llama_dev_csrf` and the DataGrail candidates, remain under review. Analytics and advertising identifiers keep their existing classification.

Producer events retain the purpose-policy marker, category and essentiality. Journey classification preserves the versioned purpose. WC01 consumes that retained marker through cookie normalization, normalized concerns, concern policy, checklist and scoring. Legacy captures without the new marker retain their existing interpretation. Technical service classification is not a legal consent exemption or certification.

`distinct_embed_exposure.v1` adds bounded scoring evidence to existing canonical embed outcomes. Groups bind host, content purpose and a query-free resource URL. Identical groups are charged once across iframe, social/media and generic embedded-content labels, in that precedence. A row keeps its existing flat five-point weight when it introduces a distinct group. The existing family cap stays unchanged. Different resource paths, hosts or content purposes are not automatically collapsed. Query-only variation is a conservative distinct-resource lower bound; it is not proof of a separate embed.

Canonical pixel services remain tracking observations, without an additional embed charge. This uses the shared vendor registry, not a new vendor allowlist. Actual iframe/widget observations, tracking, cookies and accessibility remain separate evidence. All original finding rows remain present; the central capped breakdown controls both the score and visible deduction attribution.

New scoring versions are `gdpr-eprivacy-posture.v19`, `overall-posture.v9` and `full-site-distinct-findings.v8`. Historical v18/v8 explanations use the prior calculation, and source-bound cached full-site v7 and v6 scores retain their recorded amounts. Malformed new overlap proof is score-neutral; missing legacy proof is not silently upgraded. Full-site merging unions bounded group evidence across eligible pages.

## Isolated policy simulations

These hold all other original deductions fixed. They use exported report evidence and local policy fixtures, not new verified producer captures. They must not replace a report or leaderboard value.

| Website | Original score | Isolated simulation | Reason |
| --- | ---: | ---: | --- |
| deepmind.google | 59 | 69 | Three labels share the same five YouTube resources; embed deduction falls from 15 to 5. Storage and GA deductions remain. |
| groq.com | 71 | 81 | Reddit pixel loses two overlapping embed charges. Tracking, storage review and contrast remain. Vendor-count reconciliation is still a separate audit. |
| cohere.com | 77 | 85 | Its original sole cookie is CookieYes consent storage; the existing after-Reject deduction remains. |
| huggingface.co | 92 | 100 | Its original sole deduction is the WAF token. Accessibility was not evaluated, so this is not a complete audit. |
| openai.com | 75 | 75 | Three functionality-cookie purposes become known, but two GCLB records remain unresolved. The current after-click policy is unchanged. |

New EU-Ireland scans with verified producer evidence are required before publishing replacement scores. Cohere's separate independent visit also observed Marketo requests before consent; a future scan could differ from this isolated arithmetic. Setter attempts alone do not establish stored cookies. Do not retrofit those later observations into the original report.

## Proposed after-Reject policy, not implemented

Replace the single 15-point treatment with purpose-specific evidence tiers for future scans. Keep the maximum family deduction at 15; do not add charges for each request or count OPTIONS preflights as separate measurement events.

| Eligible evidence | Proposed deduction | Interpretation |
| --- | ---: | --- |
| Confirmed refusal followed by direct optional advertising, session replay, persistent measurement identifier use/write, or a verified consent-signal contradiction | 15 | Strong evidence that optional activity continued after refusal. Existing target binding, registration, request ancestry and grace rules still apply. |
| Confirmed refusal followed by analytics measurement with request-bound denied-storage signals, complete bounded storage capture and no observed persistent identifier use | 5 | Measurement still occurred, but the retained evidence distinguishes it from ordinary identifier-based tracking. This does not establish legal compliance. |
| Verified page-performance-only RUM with request-level purpose proof, no advertising/replay purpose, no observed persistent identifier transmission and complete bounded storage coverage | 0 | Retain a factual performance-measurement observation and coverage limits. Do not exempt a whole vendor or host. |
| Unconfirmed refusal, unknown purpose, incomplete capture or missing identifier/storage proof | 0 for a new purpose-specific enforcement claim | Retain factual after-click observations and an explicit review/coverage state. Never assert that nothing happened or that refusal was honored. |

This proposal would supersede the separately owner-approved `reject_click_tracking.v1` 15-point unconfirmed-click review rule for new assessments only. Until approved and implemented, that existing rule and all historical scores remain unchanged.

Do not exempt a request merely because it carries `gcs=G100`, `gcd`, `npa=1` or a supplier's privacy claim. Retain bounded request-bound mode and purpose information, identifier-presence classifications, semantic decision proof, source accounting and storage coverage through the existing typed evidence contract. Never retain raw identifier values to implement this policy. Ambiguous or missing evidence must remain review, not a clean result.

For consistency, separately calibrate pre-consent denied-storage analytics to the same five-point measurement tier. Do not give Mistral or Cohere a site-specific exemption. Disclosure improves interpretation but does not erase observed measurement. Do not change the existing eight-point pre-consent vendor rule as part of the current implementation.

Implement this proposal only after owner approval of the weights and evidence requirements. Add exact endpoint/purpose calibration cases for Cloudflare RUM, Google denied-storage measurement, identifier-bearing analytics, advertising, mixed-purpose payloads and incomplete captures. Use existing lanes, budgets and capture windows, with no new public run, model call or automatic interaction.

## Primary sources

- [CookieYes consent ID documentation](https://www.cookieyes.com/documentation/obtain-the-consent-id/)
- [AWS WAF token characteristics](https://docs.aws.amazon.com/waf/latest/developerguide/waf-tokens-details.html)
- [OpenAI cookie policy, October 7, 2026](https://openai.com/policies/cookie-policy/)
- [Google Cloud load-balancer session affinity](https://docs.cloud.google.com/load-balancing/docs/https/request-distribution)
- [Google consent-mode behavior](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Cloudflare RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/)

These sources describe technical purpose and supplier behavior. They do not decide the legality of a particular site's implementation.

## Cost and verification

No AWS resources or production state were changed. Current work incurred no new AWS scan or model spend. If deployed later, bounded metadata adds an estimated less than $0.10/month at 100,000 scans with existing retention; no extra request, lane, browser session, timeout or model call is added. This estimate was disclosed before proceeding.

Focused tests cover new versus historical cookie classification, exact domain binding, local browser capture and journey/schema preservation, canonical concern-to-checklist scoring, shared versus distinct embed resources, pixel exclusion, malformed proof, full-site union and historical explanation compatibility. The 621-test producer/vendor/web suite passed, followed by 34 boundary checks and 60 final cookie/report checks after the last refinements. Scanner and web typechecks and the vendor/contracts build passed. The retained OpenAI replay preserves score 75, findings and the full v18/v8 explanation. All ten original report hashes remain unchanged.
