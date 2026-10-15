# Cookie purpose and provider classification v3

Status: local implementation and replay reviewed on October 15, 2026. The owner subsequently authorized AWS deployment and ten fresh EU-Ireland publication scans. Deployment receipts and fresh scores are recorded separately; this document records the retained-evidence replay. Existing reports and stored evidence remain unchanged. Unknown-only storage review keeps its existing eight-point deduction.

## Canonical implementation

Fresh captures retain `certscore.cookie-purpose.v3`: exact cookie name and normalized storage domain, documented purpose set, technical purpose and essentiality, stable rule ID, and optional registry-backed provider identity. The containing retained event supplies event reference, timing, source and provenance. The existing bundle verification and persistence path remains authoritative.

Both passive capture and Accept/Reject cookie capture use the shared canonical resolver. Action storage uses `action_storage_purpose.v2` and checks identity, purpose and essentiality against the retained classification. Historical action v1, cookie v2, Axeptio v1 and unversioned interpretation remain frozen. New classifications cannot be reconstructed from old records just by reading a report.

The canonical path remains retained evidence, shared cookie materialization, normalized concern, concern policy, unified checklist/finding, then score and display. No display heuristic creates a purpose or finding. Invalid, conflicting or mismatched new proof stays unresolved. Provider conflicts stay separate from purpose conflicts and do not create scoring effects. Cookie provider, storage domain, initiator and site controller remain separate facts; the latter stays unknown without evidence.

New provider rules identify YouTube, AWS WAF and Axeptio. Registry identity matches carry a separate cookie-provider resolver version. Shared inventory honors retained cookie purpose, including Cloudflare affinity as Infrastructure. A same-name cookie on a different event cannot lend its vendor to another cookie. Initiator and ancestor URLs do not establish a verified direct setter.

## Semantic changes

- YouTube YNID and VISITOR_INFO1_LIVE retain documented possible uses without claiming active advertising or personalization. YEC retains security and analytics possibilities. These remain unknown-purpose review observations. YSC's security classification and ROLLOUT's non-essential measurement classification remain.
- Microsoft MUID, ANONCHK, MR and SM retain distinct identifier/support roles without treating a support flag as proof of advertising or transfer.
- Datadog `_dd_s` loses the blanket security exemption; `_dd_s_v2` retains the documented RUM session role with unknown essentiality until contextual evidence resolves it.
- LinkedIn `lidc` is routing infrastructure. LiveRamp `_lr_geo_location` describes country-of-call rather than an audience identifier. ID5 identifier, partner state and callback state are distinguished. Capability-test cookies and OneTrust notice receipts no longer claim identities or consent registration they cannot establish.
- Ambiguous `uid`, `ubid-*`, `sailthru_*`, `akaas_*`, unsupported `_pk_hm` and custom Tealium names stay unresolved in v3. Documented `ph_phc_<token>_posthog` persistence retains analytics purpose through one canonical exact-name rule instead of a broad vendor fallback.

No claim is made that every deferred cookie now has a verified purpose. Unreviewed vendor signatures and unresolved source/context gaps remain in the audit research queue. No new model, paid lookup, browser lane, retry or live scan was introduced.

## Replay and score effects

The local replay reads all ten original canonical bundles, makes in-memory counterfactual copies, and applies the shared cookie projection, normalized concern, concern policy, checklist and unchanged scorer. Every original storage deduction must match the stored report before a delta is reported. Provider-only replay must be score-neutral. Accept/Reject purpose changes are inspected separately; all after-Reject deductions remain zero in this cohort.

| Site | Stored score | Purpose replay | Storage deduction |
| --- | ---: | ---: | --- |
| Cohere | 100 | 100 | 0 to 0 |
| Anthropic | 93 | 93 | 0 to 0 |
| Hugging Face | 93 | 93 | 0 to 0 |
| Meta AI Developer website | 92 | 92 | 8 to 8 |
| OpenAI | 90 | 90 | 8 to 8 |
| Perplexity | 88 | 88 | 8 to 8 |
| Mistral | 82 | 82 | 0 to 0 |
| Groq | 81 | 81 | 8 to 8 |
| xAI | 80 | 80 | 8 to 8 |
| Google DeepMind | 69 | 73 | 18 to 14 |

DeepMind's storage deduction changes from 18 to 14: three supported non-essential identities remain (`__Secure-ROLLOUT_TOKEN`, `_ga`, `_ga_LS8HVHCNQ0`). Its tracking and embed deductions remain eight and five. YNID, VISITOR_INFO1_LIVE and YEC remain visible for review. This gives a purpose-only replay score of 73, not a new published scan.

These estimates hold every unrelated published deduction fixed. They are not full report regeneration, new browser observations or legal determinations. Other sites may change differently: for example, replacing a lone Datadog security exemption with unknown-purpose review can add the existing eight-point review deduction. There is no supported fleet-wide score estimate from this ten-site cohort.

## Validation and preservation

944 targeted tests pass: 610 contract tests, 193 resolver tests, 30 capture/journey/action boundary tests, 100 normalization/inventory/scoring tests, and 11 cookie/storage materializer tests. The browser fixture checks actual local cookie capture. Contract and resolver builds, scanner and web TypeScript checks pass. Checks include legacy interpretations, malformed proof, context lookalikes, provider conflicts, same-name association, action parity and unchanged 15/5/0 after-Reject tiers.

SHA-256 comparisons confirm all 22 original report/export files and ten downloaded canonical evidence bundles remain unchanged. No scoring weights, article content or production records were changed.

## Reproduction and artifacts

Run `pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-cookie-purpose-v3.ts RETAINED_DIR BASELINE_JSON OUTPUT_DIR` from the worktree. The helper is local and read-only with respect to source evidence; outputs are isolated from the original reports. It does not publish or call models.

Review artifacts are in `/Users/benmasek/WC01/outputs/cookie-canonical-replay-2026-10-15/`: `replay/summary.json`, individual replay records, `score-impacts.csv`, `integrity-after.json`, and test logs. Original audit: `/Users/benmasek/WC01/outputs/cookie-purpose-provider-audit-2026-10-15/AUDIT.md`.

## Cost

No added browser runs, model calls, standing capacity or retention period. The sampled retained classification objects average 459 bytes, maximum 655 bytes. Estimated incremental metadata storage and deterministic compute is under $1/month at 100,000 scans with the existing retention policy; budget approximately $0.25/month for this change. This was disclosed before proceeding. The read-only audit downloads are a one-time sub-$1 diagnostic cost. Reassess if evidence retention or observation volume expands materially.

## Primary documentation

- [Google cookie uses](https://policies.google.com/technologies/cookies)
- [Microsoft Clarity cookies](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies)
- [Datadog Browser SDK migration](https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/)
- [Cloudflare cookie functions](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)
- [AWS WAF token details](https://docs.aws.amazon.com/waf/latest/developerguide/waf-tokens-details.html)
- [Axeptio storage](https://support.axeptio.eu/en/articles/274085-does-axeptio-place-cookies)
- [LinkedIn cookie table](https://www.linkedin.com/legal/l/cookie-table)
- [LiveRamp ATS cookies](https://docs.liveramp.com/privacy-manager/en/cookies-set-by-ats.html)
- [ID5 cookie disclosure](https://id5.io/trust/cookie-disclosure)
- [PostHog persistence documentation source](https://github.com/PostHog/posthog.com/blob/master/contents/docs/libraries/js/_snippets/persistence-info.mdx)
