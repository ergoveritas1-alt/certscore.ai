# Post-refusal observation: default-off MVP

Status: implemented and locally verified, default-off, undeployed, and restricted
to explicit target authorization. Production-projectable evidence is emitted only
by the Lambda worker after confirmed semantic refusal registration.

## Purpose

This MVP adds an independent reject-only browser branch that can collect
confirmed post-refusal evidence without delaying the existing scan result. It
includes the default-off Lambda dispatch, verified late-packet reconciliation,
canonical WC01 concern/policy/finding projection, scoring, report generation,
report refresh, API/SDK/MCP status metadata, and canonical byte-budget priority.
Nothing has been deployed to production. Reject interaction is permitted only
with an explicit loopback, owned-canary, or per-run exact-target authorization.

## Current experiments

The single-case timing lab starts two independent browser sessions against a
deterministic fixture:

1. The existing consent-proof lane starts immediately and remains passive.
2. The reject-only observer starts after a configurable delay (2 seconds by
   default), uses a versioned exact-selector recipe, and records evidence only
   after a semantic refusal state is confirmed.

The reject-only observer:

- fails closed unless the target matches the explicit interaction
  authorization's exact host and path scope;
- never discovers a control from guessed DOM text;
- treats banner removal as corroborating evidence only;
- records `refusalExercised: false` and no scorable observations when semantic
  registration is not confirmed;
- excludes requests already in flight at the refusal anchor;
- hashes storage values and retains bounded names and metadata only;
- exits the observation window early after a classified non-essential request
  or write, while clean cases use the full configured window; and
- consumes the canonical vendor resolver rather than a feature-local vendor
  list.

The three-lane cohort starts the existing consent-proof, runtime-evidence, and
policy-evidence scan modes concurrently, then starts the independent reject
observer after the configured two-second offset. The normal result barrier is
the latest of the three existing lanes. The cohort never makes that barrier
await the reject observer.

Named CMP action recipes are derived from the canonical CMP registry. The
initial local coverage includes OneTrust, Cookiebot, and Usercentrics. TCF
recipes query `__tcfapi` for `TCData`; a confirmed `useractioncomplete` state
with the configured purposes denied can register refusal. A retained purpose
grant after a separately confirmed rejection produces an independent
`refusal_signal_contradicts_action` observation. The compact TC string is
hashed rather than retained raw.

## Reconciliation experiment

The initial report has a zero-wait policy by default:

- If the reject packet is already ready, it may become an opportunistic initial
  join candidate.
- If it is not ready, the initial report continues with zero added wait and the
  packet becomes a hash-bound next-generation candidate.
- Unconfirmed, unsupported, not-attempted, and aborted packets are neutral and
  cannot request a report generation.

The Lambda packet remains a retained artifact, but a packet marked
`productionProjectable: true` may enter the canonical report pipeline only after
its pointer, byte size, SHA-256, parent scan, base evidence hash, contract, and
confirmed refusal registration all verify. A late packet atomically invalidates
the prior pending projection and requests one idempotent newer report generation.
Unconfirmed or unverifiable packets remain neutral and do not request a report.

## Canonical report and score behavior

The implementation preserves the required pipeline:

```text
verified post-refusal packet
→ bounded runtime projection
→ normalized concern
→ concern policy
→ unified finding/checklist
→ score and report surfaces
```

The three canonical findings are:

- `post_refusal_non_essential_activity` for a classified request or storage
  write that begins after the confirmed refusal anchor;
- `pre_consent_storage_not_cleared` for classified non-essential storage that
  existed before the action and remains afterward; and
- `refusal_signal_contradicts_action` for a post-action TCF purpose grant after
  a separately confirmed rejection.

The GDPR/ePrivacy score row applies up to a six-point deduction for confirmed
post-refusal activity or a contradictory TCF signal, and three points for
persistence-only evidence. Unconfirmed, unsupported, not-attempted, cancelled,
stale, and unverifiable branches are score-neutral. Existing systemic poor-site
posture caps can place materially poor sites in the intended 10–30 range; reject
coverage itself never lowers a score.

API v2 and the SDK expose bounded additive `postRefusalObservation` status
metadata. Hosted MCP returns the same metadata and ranks all three post-refusal
canonical findings ahead of pre-consent findings when truncation is required.
The 5 KB floor retains the canonical finding set with
`canonicalFindingsComplete: true`. Report pages background-check for a newer
ready generation only when the reject branch was configured, for at most 24
seconds, and reload the whole canonical generation rather than patching one UI
fragment.

## Local commands

Run one timing comparison:

```sh
pnpm v2:post-refusal-lab -- --fixture ignored
```

Run the fixtures for manual browser inspection:

```sh
pnpm v2:post-refusal-fixtures -- --port 4178
```

Run the repeated three-lane timing cohort:

```sh
pnpm v2:post-refusal-cohort -- --repetitions 2 \
  --fixtures ignored,tcf,contradiction,cookiebot,usercentrics
```

The cohort defaults to a deterministic local policy-link ranker. Use the
canonical local OpenAI credential for a bounded production-provider timing
comparison:

```sh
node --env-file=apps/web/.env.local --import tsx \
  packages/certscore-scan-core/src/cli/post-refusal-cohort.ts \
  --policy-provider real --repetitions 1 \
  --fixtures ignored,tcf,contradiction,cookiebot,usercentrics
```

Available fixtures are `honored`, `ignored`, `missing`, `unconfirmed`,
`inflight`, `tcf`, `contradiction`, `cookiebot`, and `usercentrics`.

The cohort may target one explicitly authorized canary URL with one recipe:

```sh
pnpm v2:post-refusal-cohort -- --policy-provider real --repetitions 1 \
  --fixtures tcf \
  --target-url https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html \
  --owned-ergo-canary
```

Both owned pages use the canonical OneTrust/TCF recipe, including the ignored
variant:

```sh
pnpm v2:post-refusal-cohort -- --policy-provider real --repetitions 1 \
  --fixtures tcf \
  --target-url https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html \
  --owned-ergo-canary
```

The owned-canary switch authorizes only the two exact registered page URLs,
not other ErgoVeritas paths, query variants, runtime assets, or the `www`
hostname. A mismatched fixture/recipe selection fails before browser launch.
The canary manifest permits one reject action only and forbids DOM guessing.

One public target can be calibrated locally only with a per-run exact-host/path
allowlist ID and the real policy provider. The observer re-authorizes the final
URL after redirects before it resolves or clicks anything. Unknown CMPs,
redirects outside the exact authorization, and missing deterministic controls
fail closed.

## Ergo-modeled local timing result

The first repeated cohort used ten runs: two repetitions each of post-refusal
activity, clean TCF refusal, a contradictory TCF signal, immediate Cookiebot,
and a Usercentrics control delayed by 1.2 seconds. All ten reject packets were
ready before the existing three-lane result barrier and therefore requested no
additional initial-report wait.

- Median reject-ready lead: 4.800 seconds.
- Narrowest reject-ready lead: 1.450 seconds.
- Widest reject-ready lead: 9.666 seconds.
- Initial-report join candidates: 10 of 10.
- Late-generation candidates: 0 of 10.

This cohort models the owned ErgoVeritas canary patterns on loopback. It does
not include Lambda cold starts, queueing, S3 transfer, coordinator merge, WC01
materialization, or a live public-site interaction. The baseline policy lane
used the deterministic local link-ranking mode; browser discovery and policy
retrieval still ran through the real scan-core lane.

A second five-run cohort loaded the canonical local OpenAI credential and used
the real Nano policy-link provider. All five reject packets again arrived
before the three-lane barrier with no approved join wait:

- Median reject-ready lead: 6.874 seconds.
- Narrowest reject-ready lead: 5.895 seconds.
- Widest reject-ready lead: 15.676 seconds.
- Initial-report join candidates: 5 of 5.
- Late-generation candidates: 0 of 5.

The retained cohort artifact does not include provider token billing. The run
was bounded to five local cases, and its incremental API spend is conservatively
estimated below $0.25.

## Owned-canary source validation

The owned ErgoVeritas canary sources were exercised from a loopback static
server through the full three-lane cohort with the real Nano policy provider:

- Reject honored: confirmed TCF refusal, zero observations, reject packet ready
  1.500 seconds before the three-lane barrier.
- Reject ignored: confirmed TCF refusal, two observations, reject packet ready
  9.655 seconds before the three-lane barrier.
- Added initial-report wait: zero for both cases.

The sources were then published through the owned ErgoVeritas AWS static-canary
path and exercised once each with the exact-host/path authorization:

- Live Reject honored: confirmed TCF refusal, zero observations, packet ready
  4.816 seconds before the full three-lane barrier.
- Live Reject ignored: confirmed TCF refusal; Google Analytics request at
  +73 ms, `_gid` write at +72 ms, and persisted `_ga`; packet ready 10.306
  seconds before the full three-lane barrier.
- Added initial-report wait: zero for both live cases.

The publication uploaded only the two pages, their runtime script, and the
additive canary manifest change to the existing S3 static-site bucket. The
CloudFront invalidation was limited to the post-refusal prefix and manifest.

The final production-shaped worker function was also executed locally against
the two live owned canaries with S3 and SQS mocked in-process:

- Honored: `confirmed_clean`, zero observations, 9.437-second worker time. The
  clean case intentionally consumed the full eight-second observation window.
- Ignored: `confirmed_observation`, two
  `post_refusal_non_essential_activity` rows plus one
  `pre_consent_storage_not_cleared` row, 0.569-second worker time due to early
  exit.
- Both retained a bounded packet and emitted
  `post_refusal_evidence_ready`. Packet sizes were 2,862 and 5,022 bytes.

These times exclude the coordinator's configured two-second launch offset.

## Production-shaped default-off topology

The cost profile for the optional 3,008 MB reject worker was approved on
August 26, 2026. The implementation remains default-off and undeployed.

When `CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED=1` is present in both the
WC01 dispatch environment and the Lambda runtime, an eligible sharded scan:

1. starts the three required passive lanes immediately;
2. waits 2 seconds before invoking `reject_observation`;
3. cancels that not-yet-started invocation if a completed consent inventory
   has already confirmed that no reject control was observed;
4. never awaits the optional worker at the three-lane readiness barrier;
5. attaches the verified packet to `CanonicalEvidenceBundle.json` only when it
   is already complete at the zero-wait join point; and
6. otherwise relies on the reject worker's independent checksum-bound S3 + SQS
   handoff.

WC01 verifies the late packet's byte size, SHA-256, typed contract, parent scan
identity, refusal status, production-projectable flag, and observation count.
Messages are retained as scan events and bound to the verified base bundle hash
when both halves exist. A verified confirmed packet enters the canonical report
generation path; coverage failures and unconfirmed refusal remain score-neutral.

The Lambda runtime remains restricted to loopback and the two exact owned
ErgoVeritas canary page URLs. The local cohort runner additionally supports one
exact per-run public calibration target. Public allowlist mode is not enabled in
the Lambda handler and was not deployed.

## Fresh owned-canary timing

Five fresh real-provider repetitions per owned live canary produced:

- reject honored: all five packets confirmed clean, contained no observations,
  and were ready 1.875–3.156 seconds before the primary barrier (2.350 second
  median); and
- reject ignored: all five packets confirmed the expected failure, contained
  exactly three expected observations each, and were ready 10.311–12.483 seconds
  before the primary barrier (10.584 second median).

The approved initial-report join wait remained zero in all ten runs.

## Consent-proof-specific timing

The repeated cohort artifact is now version 2 and records reject readiness
against each required lane, not only the latest three-lane barrier. A fresh
ten-run deterministic cohort produced:

- reject packet ready before consent-proof: 4 of 10;
- reject packet ready before the complete three-lane barrier: 10 of 10;
- median reject delta versus consent-proof: +301 ms, with a -6.014 to
  +2.005 second range; and
- median reject lead versus the complete barrier: 4.795 seconds, with a 1.438
  to 9.710 second range.

Five fresh real-provider repetitions per owned live page showed the expected
behavior split:

- reject honored: all five confirmed clean with zero observations; reject
  finished 1.903–2.342 seconds after consent-proof but 1.875–3.156 seconds
  before the complete barrier; and
- reject ignored: all five confirmed with the expected three observations;
  reject finished 5.645–12.483 seconds before consent-proof and 10.311–12.483
  seconds before the complete barrier.

An initial ignored-canary invocation used the local `ignored` recipe instead
of the canary's canonical OneTrust/TCF recipe. It safely returned two neutral
`not_attempted` packets, which exposed a cohort-CLI configuration foot-gun.
Owned-canary authorization is now exact-page scoped and rejects a mismatched
recipe before browser launch.

## Initial public calibration

After the owned-canary and canonical-projection checks passed, the product owner
approved a cooldown override for a small public calibration. The standard
registry and central contact ledger were still used, exact per-run target
authorization remained mandatory, and every contact was persisted under the
idempotent run key `post-refusal-public-2026-08-26-v1`.

- Hotjar redirected to an unrelated Contentsquare host and was excluded before
  browser interaction.
- GEICO's exact OneTrust selector was not present after a 302 ms navigation and
  six-second bounded resolver window. The neutral reject packet was ready at
  8.444 seconds. The containing cohort was not used for primary-lane timing
  because its first CLI invocation did not inherit the configured API key.
- Booking.com completed all three primary lanes in 15.115 seconds. Its neutral
  reject branch found no exact OneTrust reject element, completed at 8.829
  seconds, and was ready 6.286 seconds before the primary result with zero added
  wait.
- A passive OpenAI inspection was allowed only to look for stable CookieYes CMP
  attributes. None were present in that visit, so no action was attempted.

These are exploratory timing observations, not a release or accuracy cohort.
They confirm that public-site variability and regional/CMP presentation can
produce a neutral no-control result even when historical evidence named the CMP.
They do not yet provide a public confirmed-refusal positive case.

## Remaining rollout work

Before production enablement:

- obtain a public positive case with a deterministic named-CMP selector and a
  semantic confirmation witness; unknown or accessibility-only controls remain
  ineligible;
- calibrate whether the current 1.5-second production action-search bound should
  increase, using more than a single positive CMP/site;
- run production-shaped AWS integration timing without deploying the feature,
  including cold start, S3/SQS handoff, and late-generation materialization; and
- complete final review of the feature flag, infrastructure cost guard, and
  operational disable path.

Arbitrary public-site consent interaction remains out of scope. Public
calibration requires an exact per-run allowlist and at most one deterministic
first-layer reject action. No WC01 or scanner production deployment was
performed.
