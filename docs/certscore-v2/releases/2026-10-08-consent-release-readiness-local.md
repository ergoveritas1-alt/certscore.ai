# Consent release readiness: localhost verification

Status: local changes and verification only; no deployment or production rescan.

## Final fixes

- Termly uses its documented category event and dispatch-bound freshness; partial,
  stale or malformed state cannot confirm a choice.
- The complete canonical CMP recipe registry is retained, including Transcend.
  Transcend reads synchronous local consent state without invoking `airgap.sync()`.
- Finnish Cookiebot Reject uses the canonical, consent-context-bound label.
- Owner-approved `bounded_transparent_control_settling.v1` allows one canonical,
  uniquely resolved Accept/Reject control to settle from opacity zero for at most
  one second, inside the original search deadline. Hidden/inert/disabled controls,
  weak or conflicting labels, duplicate controls, cancellation, target drift and
  expiry still fail closed. Both observers then re-resolve the control, refresh
  their baseline and rebuild complete dispatch proof. Settling never establishes
  semantic consent registration.
- Local Lambda mirrors now retain the original Accept packet at its lane path.
  Previously the report listed a verified screenshot, but its image endpoint could
  not find that optional packet in the local mirror. Both mirror implementations
  preserve exact bytes, checksums and sizes. Production continues its existing
  direct verified-S3 read; no image validation or withholding rule was relaxed.
- Full preflight bootstraps package exports before clean-checkout checks. Cached
  package outputs are reused by the subsequent application build. The new opacity
  and local image-handoff regressions are included in the preflight checks.

## Fresh complete local scans

The real localhost intake, six-lane Lambda simulator, local artifact handoff,
database persistence and report publication ran with ConsentCheckBot identity.
Central contact history preceded canonical target selection; the owner's cooldown
waiver was recorded. No form was submitted. Local egress is California, despite
EU-DE scan configuration; these results do not establish production EU behavior.

| Target | Local report ID | Accept | Reject | Retained forms |
| --- | --- | --- | --- | --- |
| mojohost.com | `862e1057-ca32-4eaa-a00e-09c227eda36e` | Confirmed | Confirmed; unchanged storage is neutral review | None retained; coverage limited |
| aalto.fi | `784c7795-4295-4c1b-b91d-2db7d6e194d3` | Confirmed | Confirmed; full clean window | None retained; post-Accept coverage limited |
| mailerlite.com | `ff5ca748-27be-4ba2-b781-2c7530231787` | Confirmed | Withheld: privacy opt-out is not cookie refusal | One baseline field and available masked image |
| wethepeoples-republic.org | `2c4aa011-1712-47a4-a81c-e4b0b30f1511` | Confirmed via Termly event | Confirmed; full clean window | One seven-field baseline observation and one seven-field post-Accept observation, both imaged |

The Termly report's total of two counts phase-specific observations; it does not
establish two distinct physical forms. Its separate structured post-Accept capture
is limited, while the seven-field image inventory is retained and verified.
The original packet was re-mirrored after fixing the local handoff, without a new
site contact or report regeneration. Its image endpoint returned JPEG/200, and
the browser popup visibly loaded the masked seven-field form.

Persisted report, API v2 scan-resource and MCP summary projections agree on scores
(74, 92, 79, 87), form summaries and deduction explanations for all four scans.
Each has exactly one terminal result event and unified-finding derivation event.
This verifies the shared projection builders; it is not an authenticated external
API/MCP transport test or proof that mutable presentation metadata never changes.

Latest retained projection timestamps were 7, 4, 5 and 3 seconds after result
receipt, with intake-to-projection totals of approximately 23.4, 27.8, 28.1 and
16.2 seconds. These include local simulator bookkeeping and are not production
latency measurements. Scanner completion time alone is not final-report latency.

## Remaining limitation

Cime's OneTrust configuration exposes 21 groups while the current hidden preference
center and receipt expose four. There is no authoritative current-purpose universe
binding those four to the complete configuration. Registration remains unconfirmed;
completed clicks and bounded after-click facts remain retained. Neither missing
confirmation nor partial category data creates a registration-based deduction.
Do not claim complete OneTrust confirmation coverage or infer it from banner
removal, receipt subsets or UI absence. The opacity fix is fixture-verified;
HubSpot has not been revisited after that fix.

## Verification and cost

- 16 observer recovery/negative fixtures and 24 focused opacity/deadline safety
  fixtures passed.
- 46 worker, local mirror and screenshot route boundary regressions passed.
- The publication gate, including the new mirror test, passed (five tests).
- Final full release preflight passed with the opacity changes. The final workspace
  build and standalone typecheck each passed all 19 tasks. The new local mirror
  test's S3 mock was corrected to satisfy both SDK installations; its publication
  gate and the full workspace typecheck passed again afterward.
  Build and typecheck must run sequentially in this isolated checkout: concurrent
  execution can delete Next.js generated type files while TypeScript reads them.
- Contact persistence is idempotent under `local-consent-release-readiness-20261008`
  (four complete scans and two bounded Cime diagnostics). The generated ledger
  candidate and sanitized report comparison are retained with the run artifacts.
- Owner approved the settling estimate of up to **$20/month at 100,000 affected
  scans**. It does not apply an unconditional wait to all scans. No lane, retry,
  timeout extension, screenshot allowance or model call was added by settling.
- Local mirror and clean-checkout build changes add **$0 recurring production
  cost**. One-off contact bookkeeping and existing diagnostic model use were
  disclosed as **under $0.50**. No new production capacity or retention was added.

Artifacts: `artifacts/local-consent-release-readiness-20261008/`. Original broader
observer cohort: `docs/certscore-v2/calibration-runs/2026-10-08-local-consent-paths/`.
