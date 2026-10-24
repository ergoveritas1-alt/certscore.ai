# CertScore.ai report coverage follow-through — October 24, 2026

Owner request: implement the five ranked report priorities, including the local
correctness release, passive CMP coverage, policy relevance, collector coverage
and explicit EU/California SDK summaries. Retained sources and offline fixtures
come first. No new production scans, Options opening, privacy choices, Gimbal
visits, diagnostic replays against public sites or historical rewrites.

## Changes

- Retain the prior D9–D12 correctness repairs. Complete the two carried D4
  investigations: a consent/runtime route disagreement cannot satisfy the exact
  California parent/child binding. New authoritative publications require both
  actual canonical posture scores, otherwise materialization fails terminally.
  Valid two-score reports with independent route variation remain reportable;
  recovered final navigation uses original same-worker response/DOM proof.
- `cmp_preferences.v21` retains a loader-bound `passive_cmp_readiness.v1`
  diagnostic. The existing single at-most-100 ms readiness checkpoint may finish
  for a newly visible registered CMP scope as well as the existing loaded
  OneTrust configuration. SDK roots remain own-data lookups; only the registered
  final method permits bounded prototype lookup. Scripts alone do not establish
  readiness, identity, absence or completeness. No extra wait/visit or flag change.
- Preserve the deployed D5 governing-policy role repair and its original hashed
  marketing/preference-shell regressions. Verify eligible ordinary production
  exposure separately; do not invent a second repair or claim closure without it.
- `bounded_ca_request_proof.v6` adds exact reviewed Reddit SDK metadata carriers
  and Mixpanel track JSON/object/batch and form-wrapped canonical base64 envelopes.
  Existing limits remain 32 KiB/128 members/depth 8, 48 inspections/32 proofs and
  eight identity digests. Mixpanel batches are capped at 16. Metadata or custom
  properties do not create advertising purpose or new identifier mappings.
  Unknown structures and privacy semantics remain unsupported. Request-local
  processing declarations survive independent partial inspection. No raw bodies
  or identifiers are retained. Existing v1–v5 records retain their semantics.
- Pulse summary variants and Markdown share the API resource's canonical posture
  projection, with typed SDK/OpenAPI fields. The generic score stays compatible;
  failed/no-go results do not acquire scores, and null is never filled in.
  Immutable old summary artifacts may omit the additive fields.

## Source review

Reddit: https://www.redditstatic.com/ads/pixel.js — the vendor SDK's POST body
uses `application/x-www-form-urlencoded`, duplicates only id/event/click_id in
its route and uses `m.*` metadata fields. Its source was read, not executed.
Mixpanel: https://github.com/mixpanel/mixpanel-js/blob/master/src/mixpanel-core.js
and https://github.com/mixpanel/mixpanel-js/blob/master/src/request-batcher.js —
`_encode_data_for_request`, `_send_request` and batch submission establish the
reviewed carriers. Only the exact api.mixpanel.com/api-js.mixpanel.com track
endpoints are supported here; no proxy or regional endpoint inference.
Original source downloads and hashes are retained in the local work artifacts.
Google/Lotame and any unreviewed Reddit/Mixpanel shapes remain unsupported.
Raw unsupported historical bodies were not retained, so parser fixtures do not
establish recovered production recipients or findings.

## Cost and release boundaries

Estimated added processing and bounded metadata below $0.75/month at 100,000
scans and existing retention, disclosed before implementation. The prior runtime
fix estimate remains below $0.10/month. No worker-memory, capacity, capture,
model-call, retention or action-budget increase. Local AWS spend is zero.
Use the canonical AWS consumer-before-producer release path with unchanged
flags. A successful release is distinct from ordinary-production verification.
The manual work does not advance the inventory endpoint or scheduled-invocation
ledger. C2 protocol coverage stays separate from diagnostic verification.
