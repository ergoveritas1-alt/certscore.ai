# Scan/report reliability release — September 6, 2026

The product owner authorized committing and deploying the accumulated changes
since the preceding deployment. This record describes the checked release and
promotion order; actual deployment outcomes must be verified from AWS and the
linked GitHub Actions runs, not inferred from this document.

## Scope

- Versioned structured consent evidence, bounded Accept/Reject activation and
  after-click capture, semantic decision verification, and canonical scoring.
- Registered BST contextual activation, including both published control shapes;
  acknowledgment remains distinct from verified consent.
- GPC delivery/coverage/response v2, worker identity and failure containment.
- Runtime-graph simulator forwarding, canonical vendor/service attribution and
  purpose, iframe inventory, consolidated service evidence, sorting and report UX.
- Matching API, SDK type and hosted MCP reader contracts. No npm package or
  plugin-directory publication is included.

## Pre-release verification

- `preflight:all` passed against the previous live web revision.
- All 19 workspace typechecks passed; 18 non-web builds passed. The initial web
  build exhausted the heap with the stale local Next.js 15.5.12 installation.
  A clean frozen-lockfile build using the declared Next.js 15.5.23 passed,
  including all 193 static pages and build tracing, at the unchanged 6 GiB limit.
- Additional report/projection checks: 322 passed; vendor registry: 149 passed;
  focused action/browser checks: 67 passed. Suites overlap with the preflight;
  these counts must not be summed as unique test cases.
- API contracts, SDK, MCP authentication, MCP core and HTTP tests/builds/typechecks
  passed. Deployment topology, calibration registry and diff-whitespace checks
  passed. No dependency, capacity or feature-rollout change was needed.
- Verification used deterministic browser fixtures and retained evidence.
  Deployment verification remains read-only; no new public scan was initiated.

## Ordered promotion and rollback baseline

1. Hosted MCP reader, then public web/materializer and validation readers.
2. Build the scanner image once, reusing the existing runtime base; replicate
   and promote the same immutable digest to Frankfurt, Ireland and California.
3. Verify workflow success, ECS health, live source revision, regional Lambda
   digest/source parity, configuration preservation and public health endpoints.

Before promotion, public web served
`aa9735ca9714079df2896333d4d37c8b0db14cfa` from
`certscore-web-certscore:559`; materializer used
`certscore-web-certscore-materializer:122`. Hosted MCP used
`certscore-web-mcp:106`; validation used `certscore-validation-worker:456`, both
at `97f83b429097d78f84bf0608f23aecdde42b5560`. All three scanner regions used
`sha256:35ac9f88d97bcd95dcb03f4855de5e6f55408e0aaa672216da4c82b70dac9b1a`.
If rollback is necessary, stop new writers before reverting readers; do not
revert readers while new-version evidence is still being produced.

Current capacity, enabled action lanes and graph settings are preserved. Routine
deployment/read-only verification is estimated below $1 in transient AWS charges;
the previously approved bounded capture costs are unchanged.

## Existing local calibration contact

The owner-requested local scan `19f45b8a-a4b9-470f-bd5f-3ed80d23b20e` preceded
the final BST activation fix. Its central contact record was already persisted
under `owner-pferdeklinik-local-20260906-0512`. The reviewed run-specific ledger
candidate below is retained for audit, not merged into the rotating-target
registry: this exact owner-selected URL is not a registered rotating target.
Its old report is not evidence of the newly deployed action behavior.

```json
{
  "ledgerVersion": "certscore.scan_quality_calibration_ledger.1",
  "updatedAt": "2026-09-06T05:18:50.281Z",
  "entries": {
    "https://www.pferdeklinik-roentorf.de/kontakt-anfahrt/": {
      "url": "https://www.pferdeklinik-roentorf.de/kontakt-anfahrt/",
      "state": "cooldown",
      "lastContactAt": "2026-09-06T05:12:26.427Z",
      "lastContactSource": "calibration",
      "lastOutcome": "completed",
      "cooldownUntil": "2026-10-04T05:12:26.427Z",
      "consecutiveNoGoCount": 0,
      "lastNoGoReasons": []
    }
  }
}
```
