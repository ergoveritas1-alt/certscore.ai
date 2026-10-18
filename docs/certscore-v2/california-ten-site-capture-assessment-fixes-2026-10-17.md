# CertScore.ai local California capture and assessment fixes — October 17, 2026

Status: local implementation and retained-evidence verification. No deployment.

## Implemented

- Native accessibility consent controls keep exact URL/source/loader binding. Stale native controls are discarded upstream with incomplete/document-mismatch coverage; same-loader URL transitions cannot merge incompatible packets. The verifier remains strict. Validation diagnostics retain only allowlisted paths and invariant names.
- Supporting policy selection rejects a retained navigation-only body with no substantive privacy signals. The already-selected California supplement may use the existing one-hop early-fetch slot from a substantive policy document; candidate count, concurrency and deadlines are unchanged.
- Rendered notice capture passively includes bounded, ARIA-bound collapsed sections and native details inside the owning content region. It does not click, submit, navigate, fetch additional documents or retain arbitrary hidden templates. Substantive legal privacy-choice sections remain distinct from an interactive consent banner.
- Rights interpretation recognizes short entries under an explicit consumer-rights grant, explicit “may not discriminate” wording and California nondiscrimination grants. Original clause offsets and hashes remain retained. Oregon/Colorado and GDPR/PIPL audiences are kept separate; incomplete capture cannot establish missing rights. New materializations carry `rights_section_context.v2`.
- Collection endpoint policy v4 distinguishes Google `gen_204` measurement support and an OpenX `pd` HTML bootstrap document from qualifying collection. Explicit visitor-ID collection and subsequent sync endpoints remain separately assessable. Meta limited-data-use is retained as a qualifier, not proof that GPC is honored. The recipient schedule, deduplication and 47-point cap are unchanged.
- CMP preferences v14 captures live controls before optional loaded configuration; early exits still preserve available declarations inside the original allowance. Existing v13 packets remain accepted.
- The existing local headed fallback now carries accessibility/basic CMP configuration. Axe child communication uses a 750 ms bound inside the existing eight-second audit and explicitly enables the coverage-only `frame-tested` check. It preserves default WCAG rule enablement. The existing menu probe retains exact selected trigger identity/name and expanded state. No new menu or browser run.

## Retained cohort results

Nine original bundles and manifests were checksum-verified and preserved byte-for-byte. Independent copies were requalified and passed through the canonical publisher into the local development database. This is reassessment of original evidence, not a fresh scan. No Sol text or model review label became scanner evidence.

| Domain | CA before | CA after | Main change |
| --- | ---: | ---: | --- |
| Home Depot | 100 | 100 | Four rights disclosures recognized |
| Notion | 97 | 97 | Four rights disclosures recognized from retained short list |
| GEICO | 65 | 65 | Three qualifying recipients preserved, including restricted-use context |
| Fandango | Unavailable | Unavailable | Failed original capture not reconstructed |
| NW Natural | 59 | 59 | Oregon-only rights and operative correction excerpt retained |
| Weather.com | 68 | 93 | Telemetry/bootstrap no longer counted as qualifying collection; WCAG effects preserved |
| Georgia Tech | 84 | 84 | GDPR/PIPL rights no longer treated as general consumer grants |
| Fidelity | 100 | 100 | Four rights disclosures recognized |
| WorkMarket | 100 | 100 | Existing positive rights and neutral evidence preserved |
| NIH | Unavailable | Unavailable | Original policy HTTP403 remains limited; no bypass |

EU scores are unchanged across all nine replayable reports. Full comparison, original/derived hashes, report links and validation logs are in `artifacts/ca-ten-site-review-2026-10-17/after/`.

## Verification and remaining work

Focused contract, endpoint, capture, CMP, accessibility, scoring, notice matching and canonical consent boundary regressions pass. Core and web typechecks and `git diff --check` pass. A screenshot timing test now accepts a successful bounded compatibility capture as recovered while retaining all real-image/control-proof assertions; it does not accept failed or placeholder capture.

Fresh verification of Fandango finalization, Weather collapsed notice text, Home Depot audit/notice prioritization and Fidelity's headed audit requires the requested four-site cooldown exception. No fresh contact was made during this implementation without that exception. R7 entity/processing applicability calibration and industry-estimate correction remain a separate follow-up: no automatic exemption, legal applicability claim, new weight or guessed benchmark is introduced here.

## Cost estimate

Estimated incremental recurring compute and bounded retained diagnostic/text storage: below $0.50/month at 100,000 scans, pre-approved under the repository's $1 threshold. Existing browser invocations, candidate counts, deadlines and model calls are reused. Passive parsing/coverage checks add small bounded work; no latency improvement is claimed from retained replay. Fresh verification, if approved, is estimated below $0.40 one-time. Estimates are not measured billing.
