# Post-refusal observation: default-off MVP

Status: implemented and locally verified, default-off, and restricted to
explicit target authorization.

## Purpose

The MVP adds a reject-only fourth browser lane to the production-shaped v2 DAG.
It observes whether a confirmed refusal is honored without introducing a second
report publication or a later report refresh.

```text
consent-proof ───────┐
runtime-evidence ────┼─ one canonical merge, score, persistence, and publication
policy-evidence ─────┤
reject-observation ──┘
```

The three passive lanes start immediately. `reject_observation` starts 500 ms
later in a fresh isolated Chromium context. The coordinator waits for one
terminal outcome from every enabled lane, but the Reject lane may add at most
six seconds beyond the slowest passive lane. Failure, timeout, unsupported CMP,
missing control, and unconfirmed refusal are explicit and score-neutral.

When consent-proof returns a complete first-layer inventory with no Reject, the
coordinator stops accepting Reject-lane output and records `not_applicable`.
Aborting an AWS synchronous invocation is best-effort: already-running Lambda
compute may finish, but its late output has no independent publication path and
cannot reopen the terminal result.

## Evidence and safety gates

The reject observer:

- requires loopback, an owned canary, a calibration allowlist, or an ordinary
  sharded-scan authorization bound to a requested HTTPS URL and that scan's
  identity; ordinary sharded scans then use a bounded passive redirect
  preflight to mint an internal authorization for only the final exact public
  HTTPS URL and the same scan identity;
- uses TCF or a named recipe from the canonical CMP registry;
- never guesses a control from DOM text;
- performs at most one deterministic first-layer Reject or necessary-only
  action;
- treats banner removal as corroboration only;
- emits no finding unless semantic refusal registration is confirmed;
- excludes requests already in flight at the refusal anchor;
- retains bounded metadata and hashes storage values and TC strings;
- strips query values and fragments from retained target URLs while binding the
  exact authorized target through `exactTargetSha256`;
- identifies cookies by exact name/domain/path/partition and web storage by
  exact origin/type/key;
- treats storage as persistent only when that exact identity has the same value
  hash before refusal and in the settled post-refusal snapshot, and only when a
  completed settle window retained the matching persistence observation;
- keeps a changed storage value neutral unless a separate refusal-anchored
  write was retained;
- exits early after a disqualifying non-essential request or write; and
- consumes the canonical vendor resolver rather than a feature-local list.

The initial named-CMP coverage is OneTrust, Cookiebot, and Usercentrics. Unknown
CMPs and unresolved controls fail closed without a click.

The enable flag defaults to the `owned_canary` rollout mode, which permits only
loopback fixtures and the owned ErgoVeritas canary. Ordinary eligible sharded
scans receive target-resolution authorization only when
`CERTSCORE_POST_REFUSAL_REJECT_WORKER_ROLLOUT_MODE=all_eligible` is also set.
The observer follows at most five passive redirects within 1.5 seconds and
checks every hop with the public-network guard. Only the final exact public
HTTPS URL is authorized for interaction, and only for the same scan. The
authorization does not grant interaction with a host generally and cannot be
reused by another scan. Non-sharded scans, unsafe or unverifiable redirect
chains, non-HTTPS public targets, ambiguous recipe matches, and unsupported
CMPs remain neutral.

## Canonical result and scoring

Verified evidence follows the canonical pipeline:

```text
verified post-refusal packet
→ bounded runtime projection
→ normalized concern
→ concern policy
→ unified finding/checklist
→ score and report/API surfaces
```

The canonical finding classes are:

- `post_refusal_non_essential_activity`;
- `pre_consent_storage_not_cleared`; and
- `refusal_signal_contradicts_action`.

Confirmed post-refusal activity or a contradictory TCF signal receives the
canonical post-refusal family deduction. Exact unchanged storage persistence
by itself is a factual review
signal and is score-neutral because stored presence does not establish active
post-refusal use. Coverage status, worker failure, timeout, no Reject, and
unconfirmed refusal never affect score.

Legacy packets without exact storage-identity evidence remain parseable for
additive contract compatibility, but their persistence rows do not enter the
canonical report projection. This avoids upgrading historical name/hostname
matches into exact persistence evidence.

API v2, Pulse, SDK, and hosted MCP consume the same terminal canonical
projection. There is no post-publication polling or partial result patch. The
5 KB response floor prioritizes the canonical post-refusal findings ahead of
pre-consent findings and retains `canonicalFindingsComplete: true` when the
canonical set fits the floor.

## Timing telemetry

`LocalV2DagLambdaShardSummary.json` and the terminal scan event retain a typed
four-lane timing summary with:

- coordinator invocation start and terminal outcome for every lane;
- worker-reported completion and duration when available;
- each outcome's delta from the passive-lane barrier;
- whether Reject finished before the passive barrier;
- Reject-added wait; and
- the terminal join outcome (`joined`, `not_applicable`, `failed`, or
  `timed_out`).

Timeout telemetry is anchored to the absolute six-second deadline. Operational
timing never creates evidence or affects score.

## Local commands

Start the deterministic fixture server:

```sh
pnpm v2:post-refusal-fixtures -- --port 4178
```

Run the production-shaped four-lane Lambda parity harness:

```sh
PLAYWRIGHT_BROWSERS_PATH= TSX_TSCONFIG_PATH=tsconfig.base.json \
node --env-file=/absolute/path/to/apps/web/.env.local --import tsx \
scripts/run-local-v2-dag-lambda-parity.ts \
  --post-refusal --profile standard --no-debug-overrides \
  --target-url http://127.0.0.1:4178/f/post-refusal-onetrust-tcf-honored
```

Use `--post-refusal-worker-mode failure` or
`--post-refusal-worker-mode timeout` for deterministic coordinator failure
tests. The parity harness bypasses configured regional proxies for loopback
fixtures while preserving the Lambda Chromium path.

The smaller observer lab and timing cohort remain available:

```sh
pnpm v2:post-refusal-lab -- --fixture tcfIgnored
pnpm v2:post-refusal-cohort -- --repetitions 2 \
  --fixtures ignored,tcf,contradiction,cookiebot,usercentrics
```

## Four-lane local acceptance results

The final production-shaped local suite used standard-profile passive lanes,
the real configured Nano policy provider, the canonical OneTrust resolver, and
one terminal reconciliation per run.

| Scenario | Terminal outcome | Eligible evidence | Reject delta from passive barrier | Added wait |
|---|---|---:|---:|---:|
| Reject honored | joined, confirmed clean | 0 | -9,979 ms | 1 ms |
| Reject ignored | joined, confirmed observation | 2 | -7,921 ms | 0 ms |
| Complete inventory, no Reject | not applicable | 0 | -207 ms | 0 ms |
| Click not confirmed | joined, unconfirmed | 0 | -6,395 ms | 1 ms |
| Reject worker failure | failed, score-neutral | 0 | -8,449 ms | 0 ms |
| Reject worker timeout | timed out, score-neutral | 0 | +6,000 ms | 5,999 ms |

The ignored fixture retained two independent
`post_refusal_non_essential_activity` observations: a Google Analytics request
and `_gid` cookie write about 60 ms after the confirmed refusal anchor. The
timeout run completed the overall scan normally and joined no Reject evidence.

The first no-Reject run exposed an ordering bug: a neutral `not_attempted`
worker packet returned before consent-proof completed and was initially joined.
The coordinator now lets complete passive no-Reject proof override only
`not_attempted` or `unsupported` results. It never overrides a lane whose action
may already have been dispatched. The corrected fixture rerun produced
`not_applicable` with zero added wait.

These are localhost parity results, not Lambda cold-start or public-site
latency measurements. Earlier owned-canary and authorized public-site
calibration remains useful for CMP coverage, but the six scenarios above are
the acceptance set for the current single-barrier architecture.

## Cost and release state

The optional 3,008 MB Reject worker cost profile was approved on August 26,
2026. The local standard-profile acceptance runs used the configured Nano
provider; their incremental API cost is conservatively below $0.25. No AWS
deployment, production push, or production scan occurred for this acceptance
pass.

Before switching to `all_eligible`, the release summary must record the
expected per-scan and monthly AWS Lambda increase for the current scan volume.
The owned-canary rollout remains the lower-cost validation alternative.
