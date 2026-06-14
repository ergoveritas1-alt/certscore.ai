# WC01 v2 Scan Lab Follow-up

## Implementation summary

Created an internal admin-only WC01 v2 scan/results lab for locating and visualizing saved repo-local v2 artifacts by URL or domain. The lab is artifact-backed only: it does not run live scans, create scan records, write to the database, call production concern policy, persist normalized concerns, create unified findings, or project customer-facing report/checklist/scoring/regulatory/API/export output.

Follow-up implementation added rudimentary report-shaped behavior that mirrors the production scan page structure without importing or calling the production report pipeline. The page now has a report-style header, sticky section navigation, scoreless internal reviewer summary, candidate-signal cards, vendor/purpose table, grouped evidence preview, coverage/artifact-chain section, and guardrail diagnostics.

## Route created

- `apps/web/app/app/admin/v2-scan-lab/page.tsx`

The route is under the existing `/app/admin` layout and inherits the platform-admin protection there.

## Artifact roots searched

The resolver reads repo-local `artifacts/` roots matching:

- `artifacts/v2-wc01-evidence-preview-*`
- `artifacts/v2-wc01-reviewer-packets-*`
- `artifacts/v2-wc01-shadow-*`
- `artifacts/v2-shadow-projection-*`
- `artifacts/v2-calibration-*`

Calibration bundles are used only as chain/root discovery hints. They are not rendered as evidence-preview content.

## Result sections rendered

The page renders:

- source/query metadata
- report-style internal header
- sticky section navigation
- scoreless internal reviewer summary
- artifact chain availability by cohort/domain
- summary counts for queue items, representative groups, excerpts, refs, unresolved refs, warnings, and sensitive-context items
- production/customer guardrail flags when present
- internal diagnostics for sanitizer warnings and blocked candidates
- internal candidate signal cards
- candidate families overview
- pre-consent tracking
- pre-consent cookie/storage
- session replay / behavioral analytics
- consent / consent-flow signals
- policy/control surface signals
- vendor and purpose summary
- coverage limitations
- evidence preview groups with bounded display-safe excerpts and counts only

## Fail-closed behavior

Matched display artifacts fail closed for:

- unsupported artifact versions
- `productionEligible: true`
- `customerFacingEligible: true`
- top-finding eligibility
- gap eligibility
- forbidden production status mapping
- raw blocked evidence field names
- legal-conclusion wording
- evidence text exceeding the internal display bound

Sanitizer warnings remain internal diagnostics only and do not promote rows.

## Tests run

- `node --import tsx --test apps/web/server/admin/v2-scan-lab-artifacts.test.ts`
- `pnpm --filter @website-signal-risk-scanner/web typecheck`
- wording/raw-field guardrail scan over the new scan-lab source/test/doc paths

All passed.

## Local browser check result

Checked `http://localhost:3000/app/admin/v2-scan-lab?url=cnn.com&profile=consent` in the in-app browser.

Unauthenticated behavior passed: the page redirected to `/login` with the scan-lab URL preserved in `next`.

Authenticated admin visual verification was not completed because the in-app browser did not have a signed-in admin session.

## Guardrail scan result

Ran the wording/raw-field guardrail scan over the new scan-lab source/test/doc paths. No forbidden status mapping, raw blocked field names, or legal-conclusion wording matches were found.

## Explicit non-goals

- no changes to the production scan report page
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
- no customer-facing output
- no production report rows
- no checklist rows
- no executive summaries
- no top findings
- no scoring output
- no regulatory-lens output
- no API/MCP/export output
- no persisted normalized concerns
- no unified findings
- no production concern policy call
- no v2 artifact mapping to production statuses
- no public route
- no database writes
- no production scan creation
- no live scan orchestration from the page

## Recommended next step

Use the scan lab to visually inspect saved v2 artifacts for a handful of URLs. Keep live scan orchestration out of scope until the artifact-backed visualization is useful.
