# CertScore.ai behavioral GPC evidence review

Local work against dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`.
The owner's priority is observable requests, collection, cookies, identifiers
and advertising behavior, with CMP state as supporting evidence.

## Result and implemented correction

The earlier zero-of-26 result concerned the conservative paired CMP settings
packet. Replaying the same 26 original retained pairs through the existing
`buildGpcActivityComparison` producer yields 22 measured request comparisons;
21 of those have no observed GPC-session GPP state. Twenty comparisons cover
five seconds, one covers three seconds and one covers one second. Six GPC visits
retain positive canonical advertising collection (31 requests in total),
independently of their matched comparison. These are convenience local records,
not a production coverage estimate or a statistically controlled experiment.

The local impact cohort report previously exposed only strict full-context
impact coverage under its matched-window summary. That obscured the separately
approved page-HTTP request comparison. It now adds `activityComparison` per row
using the existing producer, plus a `behavioralEvidence` summary with matched
request counts grouped by exact duration, missing-pair denominators, positive
full-session collection and observation availability. Existing strict impact
and CMP metrics remain unchanged. Empty or unavailable retained observations
never establish no collection. No alternate signal/endpoint verifier was added.

CNN scan `cnn-gpc-availability-4f53bea3-6448-4bf5-a66c-5e96df8a1e3f`
has a five-second packet: advertising/marketing requests 1 without GPC and 1
with GPC; analytics/replay requests 1 and 1. These are matched-window classified
request counts, not proof of unchanged choices, honoring, successful collection,
identifier transmission or downstream sharing. Later full-session collection
has its own timing and evidence. It must not be relabeled as five-second data.

## Scope and source integrity

Only `gpc-impact-cohort.ts` and its co-located test changed in this follow-up.
Only the existing read-only replay CLI consumes this report helper; no product
runtime caller or public contract was introduced. No retained artifact, original
hash receipt, historical report, policy, finding, severity, score, priority,
checklist, response status, cache version or production packet was changed.
No public scan, model call, AWS access, artifact download, push or deployment.

The manifest reuses existing original-byte size/hash pointers. Existing
verifiers recheck bytes, schema, lane/scan/context, delivery and window digests.
No absent baseline was reconstructed and no new receipt substituted for an old
one. No pair uses local/adaptive retention. Evaluation outputs remain separate
under `outputs/gpc-behavior-review-2026-11-02/`; `cohort-final.json` is the final
internal replay, not evidence attached to historical reports.

## Product gap and next development order

Current customer/API comparisons measure classified advertising/marketing and
analytics/replay request/service counts. Those counts are useful behavior facts,
but are not a paired measurement of successful collection, identifier
transmission or cookie changes. Scripts/vendor presence cannot substitute for
those stronger facts. Existing canonical GPC observations already provide
qualified positive collection and request/recipient evidence for the GPC visit.

The next backend projection should reuse original already-loaded paired bytes
at the current merge barrier to expose separately verified matched-window facts:

1. Successful collector requests and canonical recipients, with response and
   request-local role/purpose/restriction proof on each side.
2. Supported identifier-transmission categories (never raw identifiers), only
   where those original request proofs exist independently on both sides.
3. Cookie identity/write/presence differences only where compatible original
   snapshot timing, document and identity evidence support them. Cookie presence
   alone is not transmission, use or sale/sharing proof.

This needs a separately versioned optional backend/public handoff and source-pair
validation. It cannot be inferred from the current request-count packet or from
a merged GPC observation. Missing baseline body/identifier proof must remain
unknown; capture expansion is not authorized by this review. Keep the complete
GPC visit facts visible when a paired measurement is absent or shorter. Preserve
all finding/scoring and same-request restriction policies. Differences between
independent fresh visits do not establish GPC causation or a legal result.
Compatible consumers must precede future producer packets via the repository
AWS workflows; this note authorizes no deployment.

## Verification, adversarial review and cost

Inspected test/CLI/typecheck hooks before running. Local-only guard rejects
external Node sockets/fetch and unexpected browser traffic. This suite requires
no browser visits, application environment files, database or paid credentials.

```
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx --test --test-concurrency=1 packages/certscore-scan-core/src/gpc-impact-cohort.test.ts packages/certscore-scan-core/src/gpc-impact-assessment.test.ts packages/certscore-scan-core/src/gpc-cmp-state-comparison.test.ts scripts/replay-gpc-impact-cohort.test.ts
pnpm --filter @certscore/scan-core typecheck
git diff --check
```

24 tests passed, zero failures/skips; typecheck and diff check passed. New
regression verifies an independently bound baseline/GPC pair with observed
workers can retain the approved page-HTTP packet while strict impact remains
insufficient and CMP state absent. Missing required rows stay in denominators;
wrong hash/scan omit the measurement. The suite caught unavailable count
handling during implementation; final metrics distinguish unavailable
observations and keep finite positive-evidence totals. CLI tests protect
sources, prevent overwrite and reject duplicate scan IDs.

Adversarial review checked independent document tokens, no cross-scope promotion,
no pooling of different durations, no inference from zero/absent counts, source
pair verification, no findings created and no production callers. Existing
GPC predeploy coverage already includes these files. No UI/PDF layout or public
contract changed, so no new visual review or contract regeneration is required.
No full preflight was run for this internal report change.

Final compact internal cohort output is 232,704 bytes, adding 21,643 bytes to
that local evaluation file. Production storage, processing and recurring spend
increase are all zero: $0/month, within the unchanged combined $8 allowance.
The extra local parsing was not benchmarked as Lambda performance; no production
coverage, savings or latency claim is made.
