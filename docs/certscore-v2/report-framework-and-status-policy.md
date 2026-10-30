# CertScore.ai report framework and status presentation

Owner-authorized local implementation, October 29, 2026. No deployment or flag
change. This policy changes presentation over canonical projected evidence; it
does not change findings, proof requirements, scoring, capture or historical
workpapers. No provisioned infrastructure or paid API usage is added. Current local recurring
cost is **$0**. If later deployed, optional presentation metadata adds at most a
few dozen bytes per export: conservatively **under $0.01/month at 100,000
exports**, before savings from scoped-out panels. This falls within the existing
below-$1 pre-approval; budgets are unchanged.

## Framework scope

- The selected report focus controls presentation independently of scan region.
  An explicit focus survives focused evidence API selection and pagination.
- GPC and California privacy-choice assessments appear in CCPA/CPRA reports.
  They do not appear as GDPR/ePrivacy panels, findings or missing-evidence cards.
- GDPR Transparency assessments and known EU-only regulatory findings remain in
  the EU view. The California view uses its California assessments and coverage.
- Shared factual projections—controls, CMP inventories, cookies and requests,
  forms, transport, accessibility and technology—remain available. A shared fact
  does not acquire a jurisdiction-specific legal conclusion through display code.
- Known framework-specific identities are selected using the existing regulatory
  review catalog. Unknown identities receive no invented legal attribution.
- All original evidence and both posture scores remain in the canonical
  workpaper. Display exports are intentionally scoped; historical exports and
  stored assessments are not rewritten.

`apps/web/lib/scans/report-framework-scope.ts` supplies the section/row scope and
read-only report view. `regulatory-review-catalog.ts` supplies finding relevance
and ranking, including historical EU refusal-finding aliases. Shared request
and control evidence remains available; a historical EU refusal finding does not
replace California’s separately qualified collection assessment. Selection happens
before framework-specific prioritization.

## Status labels

`apps/web/lib/scans/report-status-presentation.ts` is the customer-label source:

| Existing state/label | Customer label | Meaning |
| --- | --- | --- |
| Needs review / Review recommended / former Review findings | Review | Existing findings or review signals need attention; supporting text preserves the qualification. |
| Manual review | Manual check | An automated check was inconclusive; this is not a confirmed failure. |
| Observed | Observed | Evidence was observed; no blanket compliance pass. |
| Potential gap | Potential gap | Existing qualification is preserved. |
| Limited | Limited | Evidence coverage remains limited. |

Unknown statuses remain unchanged. A label never creates a finding, legal
conclusion, pass or deduction. Positive automated failures remain distinct from
inconclusive checks. A section containing both gets Review, while each manual
row still says Manual check. Missing/unevaluable results stay Limited.

Web badges, detailed-evidence displays, native PDF status fields and the local v2
PDF use this policy. The local renderer receives the label and follow-up
description maps from TypeScript; it does not maintain a second Python alias map.

## Export and client contracts

Raw assessment fields and the historical individual accessibility-row `status`
remain intact. Customer `displayStatus` carries the canonical label. Section
`displayStatus` now supports Manual check. Optional `counts.manual` separates
inconclusive checks from finding-review counts; `counts.checks` keeps the same
denominator. For zero failures and two review rules: checks=2, review=0, manual=2.
These are display counts and never scoring inputs.

SDK types and OpenAPI are generated from the runtime schema using
`scripts/sync-detailed-evidence-contract.ts`. The SDK/OpenAPI updates are included
locally; publication and deployment remain unauthorized. The native California
PDF selects the existing California score rather than displaying the EU score in
its main graphic. No score is recomputed and no EU fallback supplies a missing
California score.

## Validation and release gate

`pnpm test:report-presentation` covers both focuses, cross-region switching,
positive GPC retention in California, its exclusion from EU views, direct and
legacy card routes, API selection, raw evidence/score invariance, manual-only and
mixed accessibility results, native PDFs and preview-model parity. Fast and full
preflight select this gate for web, contract and PDF changes.

The local v2 design preview remains limited to GDPR/ePrivacy starting-page
reports. California production-renderer code is validated locally; a California
v2 design preview has not been added by this work.

Run evidence and exact file hashes are recorded under
`artifacts/report-presentation-canonical-2026-10-29/`. No live scans, public-site
requests, paid API calls, AWS invocations, deployments or historical rewrites.

Local validation: 118 report-presentation tests, 339 highlights tests, 33 API
contract tests, 41 SDK tests, 18 preflight-selection tests and 25 report-export
tests passed. Web and SDK typechecks and generated-contract synchronization
passed. All seven PDF validation cases passed; the 17-page v2 preview and native
EU/California summaries were visually reviewed. Shared transport observations
remain available in California independently of EU-specific legal conclusions.
