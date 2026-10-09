# Local A/R retention cohort — release remains blocked

Follow-up: [local quoted privacy and canary corrections](../2026-10-09-ar-quoted-privacy-canary/README.md) resolves the stale canary expectations and recognizes the quoted privacy label. It also corrects the causal diagnosis: the observed extra gate wait is independently tied to the positive-geometry diagnostic flag lifecycle; label recognition alone does not establish a latency saving. The original measurements below remain unchanged.

This is a local diagnostic benchmark of `priority_bounded_action_requests.v1`, not a production deployment, full six-lane scan/report test or internet-wide accuracy estimate. Baseline is the previous working frozen source, not the last deployed revision. Luna reviewed composition, retained screenshots, packet bindings and outcome interpretation; this is model-assisted review, not independent human adjudication.

## Protocol and contact accounting

Canonical registry check passed. Fresh central all-channel history exports succeeded before selection; canonical selection chose ten role-stratified public sites: CNN, Mozilla, Macy’s, Segment, Healthline, Microsoft, Spotify, Geico, Caltech and USA.gov. Owner-approved repeat/cooldown waiver was recorded. Manual SITS hold, blocked/do-not-calibrate states and the repository platform exclusion remained enforced. No blocked/no-go retry, identity/region switching, form submission or deployment occurred.

Five public sites were scheduled baseline-first and five candidate-first, two domains concurrently, with fresh isolated consent/Accept/Reject browser sessions per source/site. ConsentCheckBot HTTP identity, native Chromium navigator, en-IE/Europe-Dublin and local California egress were unchanged; search 13s, terminal 30s, Accept 3s and Reject 8s. The six-lane production topology and post-scan report processing were not exercised. Two separately authorized owned pages checked action semantics; these are outside the public denominator. Owned checks overlapped part of the public run, so local timing is diagnostic only.

Source manifests verify all 1003 baseline files and all 1005 candidate files. Snapshot hashes: baseline `139912b3e8639a982ade09b9e8177f0550f49d48df2b63ada73163099e1245cb`; candidate `f7a8077be901d016f0bffcf30b86d93f8905bb45308ef7b0753a25ca29b405e9`. No runtime changes were made during this benchmark.

Macy’s baseline returned an explicit 403 access-denied no-go. Its remaining candidate visit was skipped, with no replacement. Thus public results are **19 visits / 57 lane contacts / 9 usable paired sites**, not ten passing pairs.

## Public results

| Measure | Baseline | Candidate |
| --- | ---: | ---: |
| Usable site visits | 9 | 9 |
| Observed Accept controls whose action clicked | 2 / 2 | 2 / 2 |
| Observed Reject controls whose action clicked | 1 / 1 | 1 / 1 |
| Confirmed public Accept decisions | 0 | 0 |
| Confirmed public Reject decisions | 0 | 0 |
| Overflowed clicked Accept captures | 1 / 2 | 1 / 2 |
| Overflowed clicked Reject captures | 0 / 1 | 0 / 1 |

A/R/O observations agree across all nine usable baseline/candidate pairs. Segment exposes Accept and a separate Opt-Out privacy control; its Reject action correctly was not attempted. Geico exposes A/R/O and both actions clicked. Seven usable pairs had no eligible first-layer A/R control in these visits; Spotify’s footer “Your Privacy Choices” is a separate privacy control. These are observed sample counts, not a population defect rate or human-adjudicated absence proof.

Geico click plus bounded capture completed in both versions, while consent registration remained unconfirmed. Segment Accept remained unconfirmed and Limited in both. Candidate Segment retained 192 requests out of 205 arrivals, with 13 omissions and five replacements; omissions were classified as eight tracking, four unknown and one known-other request. All loss stayed explicit and non-projectable. Its baseline had 15 omissions from a different live stream. Neither 13 versus 15 nor replacements establish a complete-capture improvement.

Segment’s candidate consent inventory became `partial` while its A/R/O states remained identical. The fuller capture retained an unresolved visible `#truste-show-consent` privacy decision (“Do Not Sell My Personal Information”), preserving the limitation rather than fabricating absence. This also prolonged passive inspection. Paired local visit delta was **median −54 ms, p95 +3344 ms** (nine pairs; at this size p95 is the maximum). The +2s p95 release target was not met. This is not measured Lambda/production latency, and causality is not established by one pair.

All **38 public raw A/R packets** validate; projections use SHA-256 of original packet bytes and exact lane scanId binding. Redirected exact targets are preserved by the packet’s resolution/authorization proof, rather than incorrectly requiring the originally requested URL string to equal the final target.

## Owned checks and harness correction

The initial owned runner keyed output only by hostname/version, so testar2 overwrote testar1’s raw packet/screenshot paths. Unique-contact validation caught the collision before ledger persistence. Original lane summaries preserve all six contacts, but the first testar1 raw packets are explicitly missing and never counted as verified. The surviving testar2 artifacts were copied without altering bytes. Output keys now include exact pathname. After original contacts were centrally persisted and fresh history re-exported, one owner-authorized fresh testar1 verification used a unique directory. No blocked/no-go retry was performed.

The new testar1 raw packets confirm both A/R decisions, retain three post-registration non-essential Accept requests and no qualifying post-refusal requests/observations. The auxiliary form-capture subsection on fresh testar1 remains Limited/window_ended; this action verification does not claim complete form coverage. Testar2 Reject is confirmed with post-refusal activity. Testar2 Accept completes click/capture but stays **unconfirmed**, with no semantic grant witness; its page text and changed cookie do not establish consent.

There are **66 unique attempted lane contacts** overall: 57 public, six initial owned, three fresh owned verification. Forty-two raw action packets validate (38 public, two surviving testar2, two new testar1); the two overwritten initial testar1 packets remain explicitly missing. Initial 63 and replacement three contacts use separate idempotent central-persistence run keys. Only the ten public target rows are merged into the canonical repository ledger; owned target history is centrally persisted and retained in artifact-only ledger candidates.

## Release readiness and next work

The prior 264 focused action tests, 566 contract tests and both typechecks remain applicable to unchanged source. Additional owned-page fixture tests are **4/5 passing**: testar2 expects confirmed Accept from cookie change despite contradictory TCF, whereas current semantic registration leaves it unconfirmed. The same assertion fails **4/5 against the frozen baseline** using the same page fixtures; this predates retention. An initial baseline invocation failed on missing fixture files in the snapshot; the adapted runner points only fixture paths to the repository and imports frozen baseline runtime, without changing snapshot bytes or test expectations. No test was weakened or marked passing.

Release remains blocked by this canary/semantic-policy expectation mismatch and the observed p95 latency gate. Next reconcile the contradiction canary with verified semantic decision policy and investigate Segment’s unresolved privacy-control inspection without promoting uncertainty to verified absence. Do not loosen confirmation, overflow completeness or scoring to force the checks green. No production deployment, full report end-to-end verification or new baseline promotion occurred.

No recurring cost change was introduced by this benchmark. The previous retention estimate remains below $0.50/month per 100,000 affected scans; one-time central bookkeeping for this diagnostic is estimated below $0.10. Product source remains uncommitted locally; this record commits only benchmark evidence summaries and contact bookkeeping.
