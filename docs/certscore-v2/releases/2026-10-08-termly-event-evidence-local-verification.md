# Termly consent-event evidence: local verification

Status: implemented locally; not deployed. This is focused diagnostic verification,
not a completed scanner release gate or a new production report.

## Change

Termly's documented `consent` event supplies an approved `categories` array. The
previous reader expected an undocumented `consentState` member and could miss
confirmation when the synchronous getter remained stale. The canonical reader now
validates the documented complete category list, discards malformed/unknown or
duplicate categories, and requires all five optional flags in getter-only reads.

Accept/Reject event evidence must occur at or after action dispatch. A prior event,
default-denied state, partial map, mixed choice or removed banner cannot independently
confirm the action. Event time is ephemeral and is not persisted as a storage-write
timestamp. Cookies and visitor UUIDs from the event are not retained. Recipe
provenance is versioned; existing retained packets and conclusions are unchanged.

The confirmed Accept path uses the existing masked, safety-reviewed form capture
and canonical packet-to-report projection. No finding or score is inferred from
display context. No lane, retry, capture allowance or deadline was added.

Source: [Termly consent-state and change-event documentation](https://support.termly.io/hc/en-us/articles/30710442081553-Getting-Consent-State-and-Handling-Consent-Changes-with-Termly).

## Fresh live localhost test

The owner explicitly authorized fresh public-site diagnostics without the scan
wait period. Central contact history was exported through the ECS psql one-off
boundary; the canonical selector recorded the authorized cooldown override.

- Target: `https://wethepeoples-republic.org/`.
- Run: `3c3e4448-7344-492d-943f-6f786e2ad5f8`.
- Started: October 8, 2026, 7:23:56 PM America/Los_Angeles
  (`2026-10-09T02:23:56.514Z`).
- ConsentCheckBot HTTP identity with native Chromium navigator identity.
- One Accept and one Reject action in independent fresh contexts; no form submission.
- Accept: confirmed via `cmp_api_state`; complete three-second observation;
  seven structured fields and one masked, moderation-reviewed available image.
  Observer duration 5.124 seconds.
- Reject: confirmed via `cmp_api_state`; complete eight-second observation;
  no qualifying post-refusal observations. Observer duration 10.087 seconds.
- Both original packets passed schema validation; SHA-256-bound shared projections
  and the original verified screenshot are retained locally.
- Central contact persisted idempotently as
  `termly-event-verification-20261008-3c3e4448`; manual ledger candidate retained
  with the diagnostic artifacts for review before another public calibration run.

Artifacts: `artifacts/termly-event-verification-20261008/` contains original packets,
projections, `summary.json`, `form-1.jpeg`, selection and contact receipts.

The historical production packet did not retain the original category-event
payload, so this test does not establish that the event-reader defect was the
sole cause of its unconfirmed Accept. It does demonstrate the corrected path
against the same live target. Local egress is not production EU egress.

## Checks and cost

79 distinct focused tests passed: 33 CMP/reliability/recipe cases, eight existing
action guards, nine API/form projection cases and 29 shared registry cases.
The 33-case set combines the final 14 new tests with the unchanged 19 regression
cases from the completed focused run. Scanner typecheck, registry validation and
`git diff --check` passed. Full preflight/build and release cohort gates remain
required before deployment.

One-off contact export/persistence diagnostic estimate: under $0.05, disclosed
before execution. Screenshot capture uses the previously approved two-image
allowance and existing moderation classifier; no additional recurring budget,
lane or timeout increase was introduced.
