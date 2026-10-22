# CertScore.ai passive Google tag context — October 22, 2026

The owner authorized safe capture improvements and retained-evidence replay within existing scan budgets, without Options panels or deployment.

## Evidence and meaning

`google_tag_context.v1` retains a bounded sample of already-present Google tag queue declarations from the existing document-metadata read. It is an optional extension of site metadata in the original, document-bound DOM snapshot. It is internal observed context, not a new finding or scoring policy.

Supported observations are explicit `config` destination IDs; `event` commands with literal supported `send_to` destinations; and explicit boolean `allow_google_signals`, `allow_ad_personalization_signals` and `ads_data_redaction` settings. Destination and route IDs are hashed. Only conversion/page-view/other event categories are retained. Arbitrary event names, user IDs, emails, audience attributes, page URLs and user-data values are not retained by this block.

A queued command does not prove execution, successful collection, an authenticated Analytics-to-Ads account link, audience export, audience membership, or GPC honoring. `backendAdsLink` remains `not_observable`, `audienceUse` remains `not_established`, and coverage is always `sampled`. Missing historical evidence is not retroactively populated. Missing, accessor-backed, malformed, truncated or unavailable queues cannot establish disabled advertising features.

Backend account linking is not a mandatory qualification gate when independently verified requests already establish supported advertising, audience or identity-sync collection. Preserve current request/source/signal proof, restrictions, recipient deduplication, historical semantics, EU scoring and the canonical assessment -> concern -> policy -> unified finding -> score pipeline. A queue declaration is not promoted through a display shortcut or used to disqualify an independently eligible recipient.

## Capture limits

Reuse the existing single document-metadata evaluation and its current deadline/reserve. No added evaluation, visit, invocation, wait, retry, header/body read, source download, model call or worker. The GPC metadata allowance remains at most 250 ms, subordinate to the existing terminal-readback reserve; no new finalization work is added.

Inspect at most 64 queue indices in total, from the default `dataLayer` plus up to two custom names explicitly declared by Google loader URLs in the existing bounded script/link inventory. Sample head and tail within each queue's allowance. Retain up to eight distinct recent declarations and four destinations per declaration. Stop queue inspection at two milliseconds. Alias routing and computed/dynamic values remain unsupported. Read own data descriptors; do not invoke accessors or SDK commands, wrap queue pushes, alter privacy choices or submit forms. The existing browser serialization helper is reused.

Bind new context to the same unchanged loader token and original document URL hash as the metadata read, with a producer-side snapshot timestamp. Queue index is ordering context only, not execution time. Do not infer an earlier processing declaration from this later snapshot. Any future assessment using this context must verify its original bundle hash and match its loader and URL hash to the retained source document.

## Cost and verification

Existing compute/time allowances, inspections, retention period and publication behavior are unchanged. Bounded metadata and processing are estimated below $0.25/month at 100,000 scans and 30-day retention; no capacity increase or paid API usage. This sub-dollar estimate was disclosed before implementation.

Local browser regressions verify one evaluation, no network requests, no queue mutation or SDK/accessor invocation, redaction, custom queues, time/entry/row caps, navigation rejection and propagation through baseline/GPC runtime snapshots. Retained-evidence replay cannot reconstruct queues not captured historically.

## Primary references

- [Google routing and groups](https://developers.google.com/tag-platform/gtagjs/routing): client-side destination routing.
- [Google privacy settings](https://developers.google.com/tag-platform/security/guides/privacy): declared feature controls and their limits.
- [Analytics-to-Ads linking](https://support.google.com/analytics/answer/9379420): linking is an account-level operation requiring account permissions.
- [Google Analytics data controls](https://support.google.com/analytics/answer/17016975): linked-property data flow and Ads usage controls.
- [CCPA definitions](https://cppa.ca.gov/regulations/pdf/cppa_act.pdf), section 1798.140: sharing concerns disclosure/making available of personal information for cross-context behavioral advertising; a local queued command alone does not establish that disclosure. This is the rationale for CertScore.ai's evidence bar, not a statutory requirement for one particular browser artifact.
