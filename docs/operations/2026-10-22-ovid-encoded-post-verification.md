# CertScore.ai Ovid encoded POST verification — October 22, 2026

Source release: `a44323c4d825bfd6f47300229c05fc8c6734c1c4`.
Exact tested tree: `c65da6e4203baa4f0e1a4907f5e02d1ebb283355`.

The endpoint-specific LinkedIn website-action decoder now inspects bounded
base64/gzip JSON without retaining raw event text or identifier values. It
preserves the existing encoded/decoded 32 KiB limit, shared 128-field allowance,
48 inspection slots, 32 California proof rows, observation windows and scoring
policy. No Options panels, new lane, model call, capacity or retention increase.
Estimated incremental bounded decode/metadata cost is below $0.50/month at
100,000 scans.

## Checks and deployment

The complete exact-tree clean-checkout preflight passed: 3,639 tests, 3,638
passed, zero failed and one existing environment-gated skip. All 19 workspace
build targets passed at the existing heap limit. The focused decoder, real
Chromium Request/header binding, request qualification and canonical scoring
suite passed all 16 tests.

An initial build in the long-lived checkout exhausted its heap. The first clean
run encountered large wall-clock pauses and timing-test failures. The final full
clean gate passed with command-scoped idle-sleep inhibition; no gate was waived
and no scan budget was changed.

- [Web/materializer AWS deployment](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39751668247)
- [Validation AWS deployment](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39751736287)

Both consumers succeeded before scanner promotion. The scanner image was built
once, reused the existing runtime base and was replicated to all three regions:

`sha256:0a44db09370372d153bb5f1449036dba93ddb301a11e04c1d4f37607d0a8ae71`.

The deployment helper completed promotion, regional parity and regional bot-auth
checks, then its final read-only verification failed with an expired AWS request
signature after a long wall-clock pause. A fresh independent verification
succeeded: live web reports this release and `ecs-fargate`, all six scanner
functions are active on the expected digest, all four ECS services are stable,
and capacity/memory/timeout settings match the baseline. Hosted MCP was unchanged.
The wall-clock pauses make this run unsuitable as a deployment-speed benchmark.

## One fresh Ovid scan

Fresh scan: `c6ac965b-d1d7-4c39-ab3b-362f0923d929`.
Original source visit: `8118e1ec-e4c1-41b4-a0fa-5992a44f3677`.

The owner-authorized single rerun retained California routing, standard profile
and five-page maximum. A fresh central contact export and the canonical selector
recorded the one-run cooldown exception. The separate panel-opening sale/sharing
lane was disabled for this run. No retry or Options/Manage action occurred.

The visit completed and its report became ready. All three retained artifact
hashes and the HTTP-200 report export were verified. Re-derived California
post-Reject assessment and canonical score matched persisted/exported values.

| Evidence/result | Verified value |
| --- | --- |
| LinkedIn `/wa/` POST | HTTP 204, 49 ms after Reject |
| Body | Complete, `base64_gzip`, `linkedin_wa_json` |
| Headers | Complete |
| Proof policy | `bounded_ca_request_proof.v2` |
| Qualifying advertising identifiers in that proof | None |
| Additional California post-Reject recipients/points | 0 / 0 |
| Existing California GPC deduction | 15 points |
| Existing EU Reject deduction | 20 points, LinkedIn and Google |
| Resulting EU / CA scores | 64 / 85 |

The EU canonical score input includes `post_reject_click_tracking`. Removing
only the California Reject finding from the same fresh score still yields CA 85;
shared-recipient GPC deduplication and all other findings remain unchanged. The
second retained non-essential request is ordinary Google Analytics collection;
its presence does not establish California sale/sharing qualification. Complete
decoding is not proof that a refusal was honored, and remaining unknowns were
not converted into passes.

The internal 47-scan release review now explicitly shows GPC CA points and EU
Reject points. That historical cohort contains 11 scans with GPC deductions and
three with EU Reject deductions (SITS 20, Ovid 20, Empires & Puzzles 15). Its
zero-additional-CA result concerned post-Reject qualification only. No historical
customer report was rewritten and no deduction explanations were added to
customer reports.

Detailed local receipts and the fresh owner review are retained in
`artifacts/ovid-post-body-fix-2026-10-22/`.
