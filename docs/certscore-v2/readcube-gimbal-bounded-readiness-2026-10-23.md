# CertScore.ai bounded Settings readiness implementation

October 23, 2026. The owner approved local Gimbal label correction, timing
diagnostics and the bounded ReadCube/Gimbal readiness replacement, with live
verification where helpful. Preserve existing checks, budgets and allowance.
No deployment or flag changes. External forms remain excluded.

## Changes

- Gimbal's scoped entrance advances to `onetrust.gimbal_settings.v2`, accepting
  the exact retained native accessible label with “Opens the preference center
  dialog.” Existing approved labels remain accepted. ReadCube's entrance and the
  global action classifier are unchanged; historical evidence is not rewritten.
- The existing diagnostics object may contain `sale_sharing_timing.v1`: effective
  capture allowance; monotonic offsets for browser launch completion, context
  and guard setup completion, navigation start, final commit, readiness result
  and entrance decision; selected entrance kind; and bounded readiness facts.
  Offsets are relative to observer start, not durations or Lambda billing times.
  Fields come from existing operations. Callable GPP presence is diagnostic,
  never proof of a delivered signal or a registered choice. Null means unobserved.
- After full exact-route proof, only these two Settings routes use the new wait.
  It preserves the initial parsed-document GPP/unique-recipe predicate and the
  existing DOMContentLoaded path, and listens for loads of the exact retained
  OneTrust stub and `202609.1.0/otBannerSdk.js` URLs. It requests no script itself.
  No suffix/domain-wide script match, SDK invocation, callback override,
  MutationObserver, polling, fixed sleep or retry is added.
- At most two extra load checkpoints share a 10 ms execution budget. Checks stop
  between native DOM operations when that budget is consumed. A native DOM call
  cannot be interrupted mid-call; an overrun is recorded, discarded as a ready
  result and prevents another checkpoint. Fixtures verify this fail-closed case.
  Foreign/synthetic/frame/shadow script events do not trigger checkpoints.
- The readiness cutoff is the actual observer deadline minus the unchanged
  1,300 ms opening reserve and a 100 ms margin. A late commit stops immediately,
  without inspecting another DOM snapshot. Before DOMContentLoaded, GPP must
  still be callable. After DOMContentLoaded, the existing Settings-opening
  rule remains, while submission independently requires the original GPP proof.
  All listeners/timers are removed at a terminal result; context closure handles
  observer cancellation. Original loader/URL checks run before any action.

Existing native-button precedence, anchor restrictions, geometry, exact labels,
field/form exclusions, two-action cap, three semantic reads, same-session GPP
transition, 250 ms grace/500 ms observation and 32-row/32,000-byte packet limits
remain. An unsupported/readiness-limited attempt remains neutral. No canonical
assessment, finding, scoring, dispatch, Lambda memory or lane count changed.

## Verification and live-check method

Offline fixtures exercise the retained Gimbal label and its prior variant,
script arrival before an unrelated deferred script completes, the two-probe cap,
missing GPP, post-DOMContentLoaded discovery, CPU overrun, foreign sources, late
callbacks, changed documents, cancellation, expired deadlines and listener
cleanup. Handler-like fixtures deduct setup from the 3,000 ms scanner deadline
and retain the observer's 250 ms handoff reserve. Existing action, redirect,
classifier and diagnostic-projection regressions are also checked.

Live verification is limited to one local observer run per original route, with
exclusive attempt receipts preventing reruns, native TLS, the public-network
guard and contact-hold checks. The harness uses a scanner deadline at start +
3,000 ms and the unchanged observer handoff reserve, rather than passing the
5,000 ms worker deadline as the earlier harness did. It invokes no AWS function,
changes no environment flag and creates no production scan/report. Local
hardware/network measurements remain distinct from Lambda performance.

Test logs, source hashes, attempt receipts and bounded evidence packets are in
`artifacts/settings-readiness-implementation-2026-10-23/`.

Verification passed: **55 focused checks plus 200 existing regressions (255
distinct checks)**. Contracts, scan-core and shared typechecks passed. Final
runtime source hashes match those recorded before the live checks.

| Original route | Total local time | Launch complete | Final commit | Readiness cutoff result | Actions |
| --- | --- | --- | --- | --- | --- |
| ReadCube | 1,376 ms | 252 ms | 1,152 ms | 1,351 ms; limited | 0 |
| Gimbal | 1,377 ms | 58 ms | 983 ms | 1,352 ms; limited | 0 |

The effective capture allowances were 2,749 and 2,750 ms. Both retained HTTP 200,
native TLS and their exact approved redirect chains. Neither reached the initial
parsed or DOMContentLoaded checkpoint or an eligible script-load checkpoint
before the cutoff: zero extra probes, with matched-control and GPP-presence facts
unobserved (`null`). They stopped as `settings_readiness_cutoff`, preserving
the required opening and observation reserves. No Settings panel or external
form was opened; no registration was attempted or confirmed. No retry occurred.

Navigation start to final commit consumed 867 ms for ReadCube and 897 ms for
Gimbal, leaving roughly 197 ms and 367 ms respectively before the readiness
cutoff. These offsets do not separate DNS, redirect, server, transfer or parsing
causes. The new mechanism works in deterministic fixtures, but these live checks
do **not** establish recovery or successful opt-out for either site. Faster local
termination is not a measured production performance or compliance improvement.

## Costs and scope

Local tests and local verification add $0 recurring AWS spend. At the prior
planning rate and illustrative 2/169 share of 100,000 monthly scans, 10 ms extra
probe work is about $0.0006/month compute, and one second of additional worker
residence about $0.058/month. The readiness cutoff can instead reduce residence
for late attempts; no measured production savings are claimed. Diagnostics target
less than 500 bytes per affected packet within existing retention/objects; allow
under $0.10/month storage under the prior 30-day/four-copy assumptions. All
increments share the existing $10 inside $50, including prior repairs; traffic,
production prevalence and remaining allowance are not established by local runs.

Keep the existing 3,008 MB Lambda, 3,000 ms scanner, 4,500 ms artifact and
5,000 ms worker deadlines. No new lanes or invocations. New action destinations,
external forms, toggles/generic Save, new state adapters, weaker proof or reserves,
larger workers, deployment and flag changes still need separate authorization.
