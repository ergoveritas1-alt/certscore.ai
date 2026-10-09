# Local passive consent and challenge fixes

October 9, 2026. Local implementation and deterministic verification only. No deployment, push, public-site contact, retry, new browser lane, model call, timeout extension or form submission. Target remains excluded from public calibration; its retained evidence was inspected without revisiting it.

## Corrected behavior

- An incomplete positive control inventory could be replaced by a completed empty inventory from another channel. Recapture now preserves positively visible controls when both observations have the same URL and verified loader identity. It keeps the earlier partial status; it does not convert partial coverage to complete or override later explicit geometry visibility reconciliation. Navigation drift and unverified visibility do not qualify.
- The frame-access browser function could reference a TypeScript serialization helper absent in the page. Its swallowed exception left an apparently loaded HTTP-200 result with no text. The existing read now uses self-contained browser JavaScript. A failed main-document read is unknown; independently known HTTP access/challenge/timeout results survive it. Child-frame text cannot substitute for missing main-document text.
- A healthy underlying page could hide a blocking human-verification iframe from the canonical no-go assessment. The existing frame reads now retain bounded `blocking_frame_challenge.v1` proof only for a unique direct child with an exact live URL match, at least 80% viewport coverage, sufficient composed opacity, at least four of five foreground hit tests, and explicit human-verification instructions. Small, hidden, covered and ambiguous embedded CAPTCHA widgets do not qualify.
- The canonical no-go path requires a same-document representative pre-consent image, matching URL/loader, proof captured within two seconds after that image, and no later representative image. Placeholder, withheld, stale, mismatched and post-consent imagery/proof fail closed. This produces a not-testable access outcome, not a consent gap or score deduction.
- The first retained-file assertion caught a provisional proof pointing to a geometry file that a timed-out task had not written. Publication now requires reading that existing file and verifying its document and exact proof fields. Missing, malformed or mismatched contents omit the proof. This adds no artifact write or upload. The full local scanner test checks both the geometry file contents and actual screenshot bytes.

Retained challenge text contains only the matched instruction, with URLs, email addresses and long tokens redacted. Frame URL query, fragment and credentials are removed after exact live binding. The contract field is optional; old records are not upgraded or reinterpreted.

## What the replay establishes

`artifacts/ar-passive-challenge-fixes-20261009/recapture-replay.mts` compares the frozen earlier helper and the current helper on identical synthetic channel-transition inputs. It uses the final retained Fandango privacy-control identity, then explicitly constructs partial positive and completed empty states. The original intermediate observations were not retained, so this is **not an exact replay of the motivating visit**.

| Synthetic input | Earlier helper | Current helper |
| --- | --- | --- |
| Same document, positively visible control | Drops the one control; complete empty | Preserves the one control; partial |
| Different loader | No retained old control | No retained old control |
| Visibility unverified | No retained control | No retained control |

That control is “Your Privacy Choices,” a privacy opt-out control. Preserving it does not reclassify it as Accept or Reject. The replay measures no latency and establishes no live-site accuracy rate.

## Verification and release decision

The focused suite covers actual local Chromium widgets, main-read failure, retained-file binding, full scanner no-go propagation, recapture, same-URL child-frame reloads and existing scan-no-go cases. Logs and source hashes are under `artifacts/ar-passive-challenge-fixes-20261009/`. Failed intermediate logs are retained alongside repaired results; use the final verification summary to identify the latest checks.

Final results: **79/79 focused regressions passed**, scanner and web typechecks passed, legacy saved-bundle contract fixture passed, synthetic prior/current replay passed, and `git diff --check` passed. Luna reviewed the retained-evidence binding and benchmark interpretation; this is model-assisted review, not independent human adjudication.

The earlier [full-flow benchmark](../2026-10-09-ar-fullflow-readiness/README.md) remains failed: nine usable live pairs, median +85ms, nearest-rank p95/max +6407ms against a +2000ms budget. Fandango and MSNBC remain unexplained pairwise wall-time outliers. Their different early inventories/gate checkpoints do not establish that a specific source change caused the delay. These local correctness fixes do not establish that the delays are resolved. The old frozen baseline remains unchanged, and this source state has not been promoted as a benchmark baseline.

No release preflight or production verification is claimed. Deployment remains held pending the latency gate and remaining release checks.

## Cost and scope

Estimated incremental recurring compute and small retained metadata: approximately **$0.50/month at 100,000 scans**, below the repository's $1 approval threshold. This estimate assumes at most roughly 100ms aggregate additional worker CPU per scan at 3GB, plus bounded metadata in existing artifacts; it is a planning estimate, not a fleet measurement or hard upper bound. The geometry checks run only in the main document and reuse existing frame evaluations and deadlines. No new paid API call, browser lane, network request, screenshot, artifact-upload operation or capacity is added. No AWS cost was incurred by these local fixtures. Reassess cost before rollout if measured aggregate work exceeds that assumption.

Existing unrelated product changes remain preserved. No commit, branch cleanup or deployment was performed for this local-only fix cycle.
