# CertScore.ai SOCS and report context — November 8, 2026

Owner authorization: local implementation and offline tests, within the existing scan budget; no deployment. This change adds no requests, visits, waits, actions, tasks or model calls. It preserves existing capture bounds and retention periods. Additional bounded classification metadata is estimated below $0.10/month at 100,000 scans (planning estimate, not measured billing).

## Cookie purpose

New captures use `certscore.cookie-purpose.v12`. Exact `SOCS` on `google.com` or its valid subdomains is documented consent-preference storage, with `essentiality=unknown` and `unknownReason=necessity_not_established`. Page/initiator/setter URLs, lookalike domains, other domains, case variants and local/session storage do not establish this identity. No specific CMP product or choice confirmation is inferred. The provider registry stays at its existing version; purpose recognition does not create a new provider identity.

Primary source reviewed: https://policies.google.com/technologies/cookies?hl=en — Google's Functionality section documents SOCS as cookie-choice state with a 13-month lifetime. Exemption is a separate question: https://www.dataprotection.ie/en/dpc-guidance/guidance-cookies-and-other-tracking-technologies . Neither source is fetched during scans.

The bound canonical classification flows through runtime cookie inventory, normalized concerns, concern policy and checklist projection. Verified new SOCS is excluded from unidentified-purpose storage concern counts while unknown necessity stays retained. A SOCS-only reconciled inventory therefore has no eligible non-essential storage concern. Other unknown cookies, missing inventory entries and positive non-essential cookies retain their existing treatment. v11 and earlier classifications, original observations and stored reports remain unchanged. No scoring weights were changed.

## Report presentation

The shared assessment presentation distinguishes priority findings from review items while keeping both cards and evidence available. Review items sort after priority findings. The section is named “Findings and review items”; a mixed/conditional overview reports separate counts.

The standalone HTTP redirect probe is a review item. Its known plaintext-response summary explicitly describes the separate probe and does not assert browser exposure or verified HSTS/browser-upgrade protection. Separate insecure navigation/form findings remain priorities under their existing rules. Unknown historical copy is not interpreted as a positive HTTP result.

Visual contrast with missing retained element examples, or only explicitly minor/moderate impacts, is a review item. Supported serious findings and explicit critical findings remain priorities. Mixed accessibility groups retain priority if any member remains a priority. Exact retained color-contrast, enhanced-contrast (AAA), and link-in-text-block rules get distinct labels/context. Existing measured ratios, required ratios, affected counts and element examples remain available. This is editorial ranking over projected findings, not a new accessibility assessment or score policy.

## Verification

- Vendor resolver: 263 offline tests pass, including exact SOCS/domain negatives, historical versions and unchanged v11 Funding Choices provider binding.
- Web focused suite: 302/302 pass; broader storage consistency checks add 2 passes and 2 pre-existing failures. All new SOCS pipeline, mixed inventory, tampering, HTTP/accessibility ranking, rendered count/card and reviewed narrative tests pass.
- The two pre-existing failures are pre-consent-storage-consistency score expectations (92 vs expected 94, 78 vs expected 85). They reproduce using pre-change files in an isolated local mirror; no score policy was changed to satisfy stale assertions.
- Contract and vendor-resolver strict type checks pass. Web type check is recorded in the verification receipt.
- Reviewed 15 changed retained narrative cases. Original findings and source corpus stay untouched; updated only their current editorial expectations. Before/after receipt: `outputs/socs-report-context-2026-11-08/editorial-review.json`.
- No production scan, paid query, deployment, historical rewrite or dashboard publication was performed.
