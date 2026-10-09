# Local semantic checkpoint retention

October 9, 2026. Local implementation and deterministic verification only. No public-site contact, fresh public scan, deployment, push or baseline promotion.

## Finding and change

The adaptive consent gate bounds an aggregate semantic read to its existing 500–750ms allowance. That read can finish a canonical rapid or accessibility inventory, then stall during later DOM/text/toggle enrichment. Previously, an aggregate timeout returned the observation from before the read, discarding those completed positive channels. A later checkpoint could rediscover the same controls.

The bounded read now retains completed positive channels before later enrichment. Retention requires positively visible controls, the same exact document URL and verified loader identity, and completion before the original deadline. Mixed hidden or visibility-unverified controls are filtered out; typed A/R/O flags and choice labels come only from the retained visible controls. Stale initial observations and navigation/reload drift clear the fallback. Closing the checkpoint prevents late callbacks from changing the result.

A timeout still produces incomplete/partial coverage. It does not establish missing-control absence, complete inspection, action registration, or score effects. A normally completed read keeps its existing output. This changes upstream observation retention, not report-layer interpretation.

No browser operation, request, screenshot, lane, retry, model call, timeout extension, gate schedule change or extra publication was added. The existing full enrichment continues to use its existing bounded operation; callback retention does not add a second read.

## Retained timing context

The earlier Fandango candidate had an initial empty inventory, a timed-out post-settle recapture, a timed-out semantic checkpoint around the 12-second gate, and a later completed positive semantic read around the 18-second gate before exiting around 22 seconds. MSNBC had repeated timed-out semantic reads and later retained a privacy opt-out control during final recapture. These observations identify a plausible evidence-loss mechanism; they do not prove this mechanism caused either live wall-time outlier or establish time saved by this fix. A privacy opt-out control is not reclassified as Accept or Reject.

## Verification

Final logs and exact changed-source hashes are in `artifacts/ar-semantic-checkpoint-retention-20261009/verification.json`.

- **54/54 focused regression tests passed**, including seven new checkpoint-retention tests.
- Scanner typecheck passed, and `git diff --check` passed.
- Actual local Chromium tests demonstrate completed inventory arriving before deliberately stalled later enrichment, and parity of controls/toggles when the full read completes.
- Deterministic retention tests cover partial output, initial and later document drift, hidden/unverified controls, negative observations, expired deadlines, closed callbacks and input immutability.
- Existing gate, recapture, paired geometry, DOM context, frame deadline and document-bound capture regressions passed in the same run.
- Luna's final read-only review found no remaining local evidence-safety blocker. This is model-assisted review, not independent human adjudication.

This is compositional local proof of callback delivery and bounded fallback behavior. It is not a fresh live-site timing result or a production readiness claim. Intermediate failed logs are retained; `regressions-verified.log` and `typecheck-verified.log` identify the final successful checks.

## Release decision and cost

The earlier [full-flow benchmark](../2026-10-09-ar-fullflow-readiness/README.md) remains failed: nine usable live pairs, median +85ms and nearest-rank p95/max +6407ms against a +2000ms budget. The frozen baseline and candidate snapshots remain unchanged. This local source state has not been promoted as a benchmark baseline. Deployment remains held pending a fresh rotating paired benchmark and remaining release checks; public target eligibility and contact history must be checked through the canonical calibration process before any new contacts.

Estimated incremental bounded metadata cost is **below $0.01/month at 100,000 scans**; no added browser operations or paid service calls. This is a planning estimate, not a fleet measurement. It is below the repository approval threshold and was disclosed while proceeding. No AWS cost was incurred by these local fixtures. Existing unrelated work remains preserved.
