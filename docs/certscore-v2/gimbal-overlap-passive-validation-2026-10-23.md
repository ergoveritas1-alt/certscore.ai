# CertScore.ai Gimbal setup-overlap passive validation

October 23, 2026. The owner approved exactly one bounded passive original-route
visit with zero SDK calls or actions. That authorization is consumed. There was
no retry, deployment, flag change, AWS invocation or external-form visit.

## Result

**The overlap executed as intended; Gimbal readiness recovery was not observed.**
The exact `https://gimbal.com/` → `https://infillion.com/` 301 route, native TLS,
final HTTP 200 and unchanged final document loader were verified. At the one
snapshot, the page remained `loading` and the own `window.OneTrust` global was
absent. The descriptor reader stopped at `root_unavailable` without calling any
SDK method. Neither exact script URL had usable completed Resource Timing;
these remain unknown, not proof of missing or blocked script requests.

| Operation | Start / completion, ms from capture start |
| --- | ---: |
| Chromium launched | completion 425 |
| Isolated context created | completion 428 |
| Blank-page creation | 428 / 529 |
| HTTP identity guard installation | 429 / 429 |
| Public-network guard installation | 429 / 430 |
| Setup barrier complete | 529 |
| Original-route navigation / final commit | 531 / 1,298 |
| Snapshot / binding verification | 2,603 / 2,614 |
| Cleanup complete | 2,640 |

The guard-installation interval occurred while blank-page creation was pending.
Navigation started only after the setup barrier and the remaining navigation/
CDP redirect guards. The snapshot took approximately 0.1 ms. Capture and cleanup
finished within the 2,750 ms allowance; there were zero SDK calls and actions.
The snapshot began 1,305 ms after commit. This passive visit did not execute the
action readiness helper, open Settings, read GPP or test opt-out registration.

The two installers together occupied roughly 1 ms at the host timer's
millisecond resolution, during approximately 101 ms of page creation. This is
evidence of concurrency, not a controlled measurement of saved latency. There
was no paired serial control visit. The previous separate passive run had a
177 ms launch-to-navigation interval versus 106 ms here; its larger difference
cannot be attributed to this overlap. Network, launch and page timings vary.
No production Lambda performance conclusion follows from this local result.

Final commit left about 52 ms before the nominal 1,350 ms action-readiness
cutoff. The later passive snapshot still lacked the global. These observations
do not establish action readiness at the earlier cutoff or permanent SDK
absence. Flag changes would not address the demonstrated initialization gap;
keep rollout inactive pending separately authorized work.

## Method and verification

`artifacts/gimbal-overlap-validation-2026-10-23/live-overlap.ts` reuses the exact
tested `createGimbalPageWithGuards` helper and Gimbal-only selection predicate.
A local adapter forwards the same page-creation/context-close operations while
recording their host timestamps; installer timestamps wrap the existing
installers. It adds no page, context, resource request or browser evaluation.
The existing diagnostic's network abort signal remains in place.

The harness preserves source-contract preflight, public-network/contact-hold
checks, native TLS, service-worker exclusion, blocked extra windows/subframe
navigation, exact original-route authorization and before/after loader checks.
An exclusive receipt is written before launch. It preserves the same single
deadline-minus-150 ms snapshot, 10 ms cooperative processing limit, 2,048-byte
snapshot cap, 32,000-byte packet cap and bounded cleanup. No SDK accessor or
method is invoked; Resource Timing reads remain observational browser APIs.

Before the visit, **48 offline checks passed** for setup/observer behavior and
the availability snapshot; the harness typecheck passed. The runtime helper,
observer, availability reader and bounds helper were verified against the
previous retained source hashes and remained unchanged after the visit.
No scanner runtime code was edited in this validation round.

Artifacts include the one-use attempt receipt, visit packet, phase timings,
preflight test/typecheck logs, source hashes and final `verification.json`.
The completed scan packet is diagnostic evidence only; it does not create a
customer scan report, finding or score effect.

## Budgets and further approval

Current Lambda memory, lane topology, scan budgets and the shared $10/month
inside $50 allowance are unchanged. This local visit made no AWS invocation and
adds **$0 recurring AWS cost**.

No further approval is needed for the completed validation. Any additional
public visit, category/SDK read, privacy action, wider lookup, budget change,
deployment or canary activation requires separate explicit authorization.
External forms remain excluded. This result does not justify broader flags,
longer waits or a non-GPP action adapter.
