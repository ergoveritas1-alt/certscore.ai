# Bounded CMP inspection production release

Owner request: deploy the remaining CMP scanner changes within the previously
approved latency and cost budgets, then verify a fresh SITS production report.

## Scope

- Enable the existing, separately isolated CMP Options inspection worker through
  the canonical three-region Lambda deployment helper. One uniquely resolved
  Options action only; no setting changes, Save, retries, or model calls.
- Keep the worker's memory-adjusted 56 GB-second envelope (17 seconds of inspection
  plus a two-second setup/retention allowance at 3008 MB). The independent worker
  runs alongside existing checks. The coordinator admits a completed verified
  packet only by its existing publication barrier; it adds no preference tail
  wait and never refreshes a published result with late evidence.
- Include the previously approved memory-adjusted prominence settling allowance:
  at most 3 seconds, within the existing consent-proof deadline and 7.5 GB-seconds.
- Reuse existing navigation/search deadlines for Borlabs readiness. Bound retained
  diagnostics without changing resolver inputs. Retain cookie expiry in existing
  action snapshots; no new storage reads.
- Verify packet bytes, scan/target/dispatch identity, and document-bound capture
  before canonical assessment, persistence, normalized concern/policy and report
  projection. New CMP criteria remain score-neutral. Existing scoring stays intact.

## Cost

At 100,000 scans/month, the conservative preference compute estimate is $93.34,
with invocation and bounded artifact overhead below $5, within the approved
$100/month ceiling. Prominence settling is at most $12.50 compute/month within the
separately approved $15/month allowance. No additional provisioned capacity,
Lambda memory, model usage, retries, or retention periods are introduced.

## Verification scope

Use SITS's retained resolved starting page, `https://sits.com/en/`, for the fresh
scan. Preference authorization remains bound to an exact URL; it does not
silently authorize a redirect destination. The public input `https://sits.com/`
previously resolved to that English page in production. General preference
redirect support is outside this release and remains explicitly limited.

Regression coverage includes one Options click/no Save, delayed and shadow-root
Borlabs UI, ambiguous controls, partial captures, diagnostics bounds, paired
prominence proof, score-neutral canonical projection, and coordinator checksum,
target binding, hanging worker and no-tail publication cases. Deployment timings,
exact revisions and fresh scan results are recorded in the release artifacts.

## Fresh production verification follow-up

Scan `a68a5b3b-df92-429a-bbef-975aa2fdddf0` retained a completed Options
inspection: 11.103 seconds in the observer and 13.905 seconds including dispatch,
finishing 3.945 seconds before the passive barrier. It captured three selectable
categories, all 11 configured services, and 36 cookie declarations. The scanner
packet is bound to release `f40383de9b8bd4430f529ad2b79eab5ad95ad3e6`.

Verification exposed an omitted WC01 materiality-policy dependency in the first
release. The follow-up includes the previously approved materiality evaluator
and its normalized-concern/policy integration. It retains the same evidence,
keeps styling-only comparisons score-neutral, and does not change the scanner.
The retained SITS dimensions (Accept 528×45, Reject 528×49) remain below the
material review threshold. Canonical report reprojection is scoped to this one
fresh scan, with no new site visit or model work.
