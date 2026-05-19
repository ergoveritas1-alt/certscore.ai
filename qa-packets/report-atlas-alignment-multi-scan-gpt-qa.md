# CertScore Report / Atlas Alignment QA Packet

Audit date: 2026-05-18

Scope: public scan report rendering compared against the approved findings atlas.

Production report URLs audited:

- https://certscore.ai/scan/f7ad3f5f-4d9d-4edb-b211-5f21b8c507f0
- https://certscore.ai/scan/104eedc1-6cca-40a8-bbb7-fbb81292afad
- https://certscore.ai/scan/5d757524-07d6-460e-b728-b13de49bbc22
- https://certscore.ai/scan/6b3ab97e-0846-4cf7-8f8c-5acaeb624c52

Reference atlas:

- https://certscore.ai/guides/findings
- https://certscore.ai/guides/findings/[findingId]
- WC01 local source on current `main`:
  - `apps/web/lib/marketing/finding-atlas.ts`
  - `apps/web/lib/marketing/finding-reference-links.ts`
  - `apps/web/lib/scans/finding-registry.ts`
  - `apps/web/components/scans/finding-card.tsx`
  - `apps/web/components/scans/shared-scan-detail-view.tsx`

Important implementation boundary:

- WS01 is responsible for observed runtime signal identification, evidence capture, and logging.
- WC01 must consume evidence only through: observed evidence -> normalized concern -> concern policy -> unified finding -> executive/regulatory projection.
- Do not add synthetic evidence, display-layer promotion, repair-based findings, raw signal shortcuts, one-off surfacing paths, or new evidence paths.
- Executive-summary/top-finding selection may rank, allowlist, suppress, or group already-projected findings, but must not create, upgrade, or infer findings from raw signals or display-only context.
- If a valid signal is missing, defer to upstream WS01 signal capture or WC01 concern/policy mapping work. Do not patch it in the report renderer.

## A. Executive Summary

Safe to deploy as-is: no for report-layer polish.

The approved atlas is live and legally/product-safe, but public scan reports still expose older report/registry wording and raw compact JSON structures that are not aligned with the atlas standard.

Blocking public-safety issues:

- Expanded public JSON exposes internal fields such as `defaultSurfacePriority`, `legalRelevance`, `cipaPenRegisterTheorySupport`, `gdprEprivacyConsentSupport`, `cpraSharingSupport`, and `ftcDarkPatternOrDeceptionSupport`.
- Expanded public JSON exposes full URLs with query strings and identifier-like query values.
- Public report remediation uses directive labels and copy such as `HOW TO FIX`, `SUGGESTED FIX`, “Delay…”, “Prevent…”, “remove the vendor”, and “Block…”.
- Public report copy includes “prove” in limitation/detail text.

High-priority report/atlas consistency issues:

- Several report titles do not align with approved atlas public titles.
- Several report criticality badges differ from atlas criticality without clearly separating “Scan priority” from “Reference criticality.”
- Fingerprinting report cards use generic consent/tracking surfacing language instead of fingerprinting-specific review posture.
- Accessibility report copy sometimes uses stronger WCAG violation wording than the atlas.

Deferred items:

- If a report needs a finding that was not projected through the canonical unified finding pipeline, defer to WS01 observed signal capture or WC01 concern/policy mapping. Do not create it in the report display layer.

## B. Findings Surfaced Across Reports

| Scan URL | Site/domain | Surface area | findingId | Report title | Atlas title | Report criticality/priority | Atlas criticality | Report confidence label | Atlas confidence/evidence posture | Atlas link present? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/scan/f7ad3f5f-4d9d-4edb-b211-5f21b8c507f0` | nytimes.com | top, regulatory, detail | `pre_consent_tracking_detected` / `preconsent_tracking` | Third-party tracking observed before recorded consent | Third-party tracking observed before recorded consent | critical/top or high/detail | high | strong/high | runtime evidence; consent timing and non-essential request/storage anchors | yes | Criticality label differs on top card vs atlas. |
| `/scan/f7ad3f5f-4d9d-4edb-b211-5f21b8c507f0` | nytimes.com | top, regulatory | `third_party_cookie_pre_consent` | Tracking cookies set before consent | Third-party cookie observed before consent | high | high | strong | runtime cookie/storage timing artifact | yes | Old title and directive remediation. |
| `/scan/f7ad3f5f-4d9d-4edb-b211-5f21b8c507f0` | nytimes.com | top, detail | `rtb_cookie_sync_observed` | RTB cookie sync observed / RTB and identity-sync activity observed | RTB cookie sync observed | high | high | strong/high | network sync/match/redirect review signal | yes | Detailed review title should align or be clearly separate. |
| `/scan/f7ad3f5f-4d9d-4edb-b211-5f21b8c507f0` | nytimes.com | top/detail | `fingerprinting_related_signals_observed` / `fingerprinting_observed` | Fingerprinting-related signals observed / Fingerprinting observed | Fingerprinting-related browser/device signals observed or Probable browser/device fingerprinting review signal | high | high or critical | moderate | browser/device signal review; no identity determination | mixed | Do not infer tier in display layer. Preserve projected finding identity. |
| `/scan/104eedc1-6cca-40a8-bbb7-fbb81292afad` | latimes.com | detail | `preconsent_tracking` | Third-party tracking observed before recorded consent | Third-party tracking observed before recorded consent | high | high | high | runtime consent-timing review | yes | Full query strings exposed in JSON. |
| `/scan/104eedc1-6cca-40a8-bbb7-fbb81292afad` | latimes.com | detail | `fingerprinting_observed` | Fingerprinting observed | Probable browser/device fingerprinting review signal | high | critical | moderate | probable fingerprinting review signal if already projected as probable | yes | Title/criticality mismatch; confidence copy not family-aware. |
| `/scan/104eedc1-6cca-40a8-bbb7-fbb81292afad` | latimes.com | top/detail | `semantic_labeling_accessibility_issue` | Semantic labeling accessibility issue | Semantic labeling accessibility issue | medium | medium | high | retained automated accessibility evidence; manual review needed | yes | Report copy uses stronger “confirmed WCAG rule violations” phrasing. |
| `/scan/5d757524-07d6-460e-b728-b13de49bbc22` | fandango.com | top/detail | `keyboard_navigation_accessibility_issue` | Keyboard navigation accessibility issue | Keyboard navigation accessibility issue | high | medium | high | retained automated keyboard/focus evidence; manual review needed | yes | Criticality mismatch unless labeled as scan priority. |
| `/scan/5d757524-07d6-460e-b728-b13de49bbc22` | fandango.com | detail | `preconsent_tracking` | Third-party tracking observed before recorded consent | Third-party tracking observed before recorded consent | high | high | high | runtime consent-timing review | yes | Full query strings exposed in JSON. |
| `/scan/5d757524-07d6-460e-b728-b13de49bbc22` | fandango.com | top/detail | `visual_contrast_accessibility_issue` | Visual contrast accessibility issue | Visual contrast accessibility issue | high | medium | high | retained automated contrast evidence; manual review needed | yes | Criticality mismatch unless labeled as scan priority. |
| `/scan/5d757524-07d6-460e-b728-b13de49bbc22` | fandango.com | detail | `fingerprinting_observed` | Fingerprinting observed | Probable browser/device fingerprinting review signal | high | critical | moderate | probable fingerprinting review signal if already projected as probable | yes | Title/criticality mismatch. |
| `/scan/5d757524-07d6-460e-b728-b13de49bbc22` | fandango.com | detail | `semantic_labeling_accessibility_issue` | Semantic labeling accessibility issue | Semantic labeling accessibility issue | medium | medium | high | retained automated semantic evidence; manual review needed | yes | Wording should avoid WCAG non-conformance determination. |
| `/scan/6b3ab97e-0846-4cf7-8f8c-5acaeb624c52` | certscore.ai | top/detail | `visual_contrast_accessibility_issue` | Visual contrast accessibility issue | Visual contrast accessibility issue | high | medium | high | retained automated contrast evidence; manual review needed | yes | Criticality mismatch unless labeled as scan priority. |
| `/scan/6b3ab97e-0846-4cf7-8f8c-5acaeb624c52` | certscore.ai | detail | `fingerprinting_observed` | Fingerprinting observed | Probable browser/device fingerprinting review signal | high | critical | moderate | probable fingerprinting review signal if already projected as probable | yes | Title/criticality mismatch. |
| `/scan/6b3ab97e-0846-4cf7-8f8c-5acaeb624c52` | certscore.ai | suppressed detail | `preconsent_tracking` | Third-party tracking observed before recorded consent | Third-party tracking observed before recorded consent | medium/audit-only/suppressed | high | moderate | audit-only/incomplete retained runtime evidence | yes | If not a promoted finding, report should explain “Scan priority” vs atlas criticality. |

Unmapped findings observed:

- `policy_clarity_risk`
- `bounded_key_page_discovery_unresolved`
- `cookie_policy_structurally_obstructed`
- `weak_cookie_security_attributes`
- `do_not_sell_sharing_disclosure_conflict`
- `minors_or_age_gated_collection_context`
- `rule_only_policy_row_present`
- `aria_issues`
- Positive/support surfaces such as `privacy_policy_present`, `terms_of_service_present`, `gpc_disclosure_present`, `privacy_contact_path_present`, `privacy_rights_path_present`, `tracking_technologies_disclosure_present`, `targeted_advertising_disclosure_present`

For unmapped findings, do not create broken atlas links. Use fallback copy:

> Policy review signal. Reference page not yet available.

## C. Issue Table

| Severity | Scan URL | findingId | Location | Exact current text or JSON field | Issue | Recommended replacement or implementation note | Atlas reference |
|---|---|---|---|---|---|---|---|
| blocking | all | multiple | evidence JSON | `defaultSurfacePriority` | Internal ranking field exposed | Strip from public compact report JSON | all atlas pages |
| blocking | all | multiple | evidence JSON | `legalRelevance`, `cipaPenRegisterTheorySupport`, `gdprEprivacyConsentSupport`, `cpraSharingSupport`, `ftcDarkPatternOrDeceptionSupport` | Internal projection/support fields exposed | Strip from public JSON; retain only public-facing review context | all atlas pages |
| blocking | nytimes, latimes, fandango | `preconsent_tracking`, `third_party_cookie_pre_consent`, `rtb_cookie_sync_observed` | evidence JSON | full URLs with `?` query strings | Query values and identifier-like values exposed | Redact to origin/path, `queryRedacted: true`, query keys only | runtime tracking atlas pages |
| blocking | nytimes, latimes, certscore | `preconsent_tracking` | limitation/detail | “The retained evidence does not yet prove the request sequence happened before a clear consent choice.” | Prohibited “prove” framing | “The retained evidence does not yet fully support the request sequence before a clear consent choice.” | `pre_consent_tracking_detected` |
| high | all | multiple | card section label | `HOW TO FIX`, `SUGGESTED FIX` | Too directive and not atlas-aligned | `Review and remediation starting points` | all atlas pages |
| high | nytimes | `third_party_cookie_pre_consent` | title | “Tracking cookies set before consent” | Old title | “Third-party cookie observed before consent” | `/guides/findings/third_party_cookie_pre_consent` |
| high | nytimes | `third_party_cookie_pre_consent` | remediation | “Prevent non-essential tracking cookie writes before consent or remove the vendor.” | Directive; implies known tracking purpose | “Teams commonly review whether third-party cookie or storage writes are gated until consent state is available, and manually confirm purpose, necessity, exemption status, and vendor configuration.” | `/guides/findings/third_party_cookie_pre_consent` |
| high | all target reports | `preconsent_tracking` | remediation | “Block non-essential trackers until consent is captured...” | Directive; “captured” framing | “Teams commonly review whether non-essential trackers are gated until the intended consent state is available, then compare runtime evidence before and after changes.” | `/guides/findings/pre_consent_tracking_detected` |
| high | all target reports where present | `fingerprinting_observed` | title | “Fingerprinting observed” | Sounds conclusive and not atlas-aligned | Use mapped atlas title only for already-projected finding ID. Do not infer probable vs related in renderer. | fingerprinting atlas pages |
| high | all target reports where present | `fingerprinting_observed` | confidence/surfacing text | `family.consent_tracking.default`, “Consent and tracking findings...” | Wrong family-specific tooltip/context | Use fingerprinting-specific confidence/context copy without identity or persistent fingerprint determination | fingerprinting atlas pages |
| high | latimes/fandango/certscore | accessibility findings | copy | “confirmed distinct WCAG rule violations” | Implies conformance/non-conformance determination | “retained automated WCAG-oriented rule examples” | accessibility atlas pages |
| high | fandango/certscore | `visual_contrast_accessibility_issue`, `keyboard_navigation_accessibility_issue` | criticality | report high vs atlas medium | Same label conflicts with atlas | Use atlas criticality, or label report value as `Scan priority` and separately show `Reference criticality` | accessibility atlas pages |
| medium | nytimes | `third_party_cookie_pre_consent` | evidence role | related runtime requests show `preConsent: false`, `timingStatus: unknown` near pre-consent cookie evidence | Can look contradictory | Add note: “Related requests provide vendor or endpoint context and may not be the artifact that supports the pre-consent timing finding.” | `/guides/findings/third_party_cookie_pre_consent` |
| medium | all | regulatory JSON | `preconsent_violation_count` | Field name overclaims | Rename public field to `preConsentSignalCount` or omit from public JSON | runtime tracking atlas pages |
| polish | all | unmapped findings | atlas link/copy | no consistent fallback | Missing reference page posture | “Policy review signal. Reference page not yet available.” | n/a |

## D. Sanitization Findings

Public expanded evidence JSON exposed URL/query examples including:

- `https://gum.criteo.com/sid/json?origin=prebid&topUrl=...&domain=...&gpp_sid=`
- `https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/.../pubads_impl.js?cb=...`
- `https://www.googletagmanager.com/gtm.js?id=GTM-...&gtm_auth=...&gtm_preview=...`
- `https://warp.media.net/js/tags/clientag.js?cid=...&dn=...&ysection=...&version=...`
- `https://sb.scorecardresearch.com/b?c1=...&cs_fpid=...`
- `https://edge.platform.latimes.com/v1/personalize?meterKey=...&pxlId=...&exp=...`

Public JSON also exposed internal/support fields:

- `defaultSurfacePriority`
- `legalRelevance`
- `cipaPenRegisterTheorySupport`
- `gdprEprivacyConsentSupport`
- `cpraSharingSupport`
- `ftcDarkPatternOrDeceptionSupport`
- `family.consent_tracking.default`
- `evidence.preconsent.confirmed_when_validation_and_runtime_artifacts`
- `evidence.consent_behavior.review_runtime_without_effect_evidence`

Recommended public URL shape:

```json
{
  "origin": "https://warp.media.net",
  "path": "/js/tags/clientag.js",
  "queryRedacted": true,
  "queryKeysSample": ["cid", "dn", "ysection", "version"]
}
```

Recommended string fallback:

```text
https://warp.media.net/js/tags/clientag.js [query_redacted=true]
```

## E. Tests To Add Or Update

- Report cards use atlas public title for atlas-mapped findings.
- Report cards use atlas criticality for atlas-mapped findings, or clearly distinguish `Scan priority` from `Reference criticality`.
- Public report JSON strips internal projection/support fields.
- Public report URL evidence redacts query values and preserves only origin/path/query key names.
- `third_party_cookie_pre_consent` report title aligns to “Third-party cookie observed before consent.”
- `fingerprinting_observed` report title does not render as “Fingerprinting observed” when linked to atlas reference pages.
- Accessibility report copy does not state “WCAG rule violations” as a determination.
- Family-aware confidence/evidence tooltips render for accessibility, runtime privacy/tracking, consent UI, fingerprinting, session replay/sensitive surfaces, and CPRA/privacy choice.
- Session replay report copy does not imply active recording, keystroke capture, screenshot capture, sensitive-value capture, user communications interception, or recording retention.
- Unmapped findings use fallback copy and do not render broken atlas links.
- No literal `undefined`.
- Public expanded JSON/evidence panels are collapsed by default.

Validation commands used during audit:

```bash
node --import tsx --test apps/web/lib/marketing/finding-atlas.test.ts
node --import tsx --test apps/web/lib/marketing/sample-finding-json.test.ts
pnpm --filter @website-signal-risk-scanner/web typecheck
git diff --check
node --import tsx --test apps/web/lib/scans/report-surfacing-presentation.test.ts
node --import tsx --test apps/web/lib/scans/compact-evidence-json.test.ts apps/web/lib/scans/sanitized-network-evidence.test.ts apps/web/lib/scans/report-signal-values.test.ts
```

Known report-test issue observed during audit:

- `node --import tsx --test apps/web/lib/scans/scan-report-unified-findings.test.ts` currently fails one assertion expecting `surface` but receiving `undefined`.
- Combined `shared-scan-detail-view.test.tsx` run also fails module resolution for `@website-signal-risk-scanner/shared/constants/queue`.

## F. Codex Implementation Prompt

You are implementing a report-layer alignment fix for CertScore public scan reports, based on the approved findings atlas and this QA packet.

Canonical pipeline constraint:

- Do not change WS01 scanner evidence collection.
- Do not change WC01 gates.
- Do not change scan promotion logic.
- Do not change executive projection logic.
- Do not change regulatory projection logic.
- Do not add raw-signal shortcuts.
- Do not add display-layer promotion.
- Do not add repair-based findings.
- Do not add synthetic evidence paths.
- Do not add new evidence paths.
- Do not change finding IDs.
- WC01 must consume evidence only through normalized concern -> concern policy -> unified finding -> executive/regulatory projection.
- Executive-summary/top-finding selection may rank, allowlist, suppress, or group already-projected findings, but must not create, upgrade, or infer findings from raw signals or display-only context.
- If a valid signal is missing, defer to upstream WS01 observed signal capture or WC01 concern/policy mapping. Do not patch it in the report renderer.

### Blocking public-safety fixes

1. Add a public compact report JSON sanitizer for scan report expanded evidence panels.
   - Strip internal fields:
     - `defaultSurfacePriority`
     - `legalRelevance`
     - `cipaPenRegisterTheorySupport`
     - `gdprEprivacyConsentSupport`
     - `cpraSharingSupport`
     - `ftcDarkPatternOrDeceptionSupport`
     - normalized concern IDs
     - concern policy IDs
     - internal rule IDs / policy IDs where not intentionally public accessibility rule labels
     - internal projection/support fields such as `family.*` and `evidence.*` policy lane identifiers
   - Preserve public-safe counts, public labels, public finding IDs, and redacted evidence anchors.

2. Redact URL-like evidence in public report JSON and visible detail.
   - Do not expose full query strings, query values, cookie values, identifiers, payloads, raw DOM, screenshots, or user-entered values.
   - Preferred object shape:
     ```json
     {
       "origin": "https://example.vendor",
       "path": "/collect",
       "queryRedacted": true,
       "queryKeysSample": ["key1", "key2"]
     }
     ```
   - Preferred string fallback:
     `https://example.vendor/collect [query_redacted=true]`

3. Replace public report labels:
   - `HOW TO FIX` -> `Review and remediation starting points`
   - `SUGGESTED FIX` -> `Review and remediation starting points`

4. Remove prohibited proof/overclaiming language from public report copy.
   - Replace “The retained evidence does not yet prove the request sequence happened before a clear consent choice.”
   - Use: “The retained evidence does not yet fully support the request sequence before a clear consent choice.”

5. Replace directive remediation wording with atlas-aligned hedged language.
   - Avoid “Block,” “Prevent,” “remove the vendor,” “ensure compliance,” “must,” “violation,” “illegal,” and “non-compliant.”
   - Use “Teams commonly review…”, “may need review…”, “can help…”, and “manual review should confirm…”.

### Report / atlas consistency fixes

1. For atlas-mapped report findings, render the approved atlas public title where the report is presenting a finding reference link.
   - `third_party_cookie_pre_consent`: “Third-party cookie observed before consent”
   - `session_recording_services_detected`: “Session replay service signal observed”
   - `fingerprinting_related_signals_observed`: “Fingerprinting-related browser/device signals observed”
   - `cross_domain_identifier_sharing_observed`: “Identifier-like values observed across domains”
   - `cpra_cba_opt_out_missing`: “CPRA / privacy choice opt-out review signal”

2. Preserve existing projected finding IDs and aliases.
   - Only map report aliases to atlas pages when the alias is already known to represent that projected unified finding.
   - Do not infer probable vs related fingerprinting from display text, raw evidence, or report-layer context.

3. Align public report criticality for atlas-mapped findings.
   - Preferred: public report badge uses atlas criticality.
   - Alternative: if report-specific priority is intentionally different, label it as `Scan priority` and separately show `Reference criticality`.
   - Do not use the same `criticality` or `severity` label for both without explanation.

4. Add family-aware confidence/evidence tooltips.
   - Accessibility: retained automated accessibility evidence such as rule ID, affected selector, page context, impact label, and reviewer context.
   - Runtime privacy/tracking: retained runtime evidence such as timing, classified request/storage artifacts, vendor/category context, and coverage signals.
   - Consent UI: retained consent-surface observations such as controls, labels, path depth, overlays, or interaction-state context.
   - Fingerprinting: retained browser/device signal context without determining personal identity, identity resolution, persistent fingerprint creation, user singling-out, or a complete identity graph.
   - Session replay/sensitive surfaces: retained runtime/page-surface evidence without determining keystroke capture, screenshot capture, sensitive-value capture, or recording retention.
   - CPRA/privacy choice: retained public-surface and runtime context without determining CPRA applicability, sale/share status, opt-out sufficiency, GPC handling, or compliance status.

5. Add or verify `third_party_cookie_pre_consent` evidence-role clarity.
   - Cookie/storage timing artifact supporting pre-consent timing should be marked finding-supporting.
   - Related runtime requests should be marked related context only.
   - Add visible note:
     “Related requests provide vendor or endpoint context and may not be the artifact that supports the pre-consent timing finding.”

6. For unmapped findings, do not create broken atlas links.
   - Use fallback copy:
     “Policy review signal. Reference page not yet available.”

### Optional polish

1. Rename public detailed-review JSON labels from “payloadScope” and “detailed_review_summary” to more user-facing language if low-risk.
2. Reduce duplicated evidence JSON blocks when the same finding appears in top findings, regulatory lenses, and analyst detail.
3. Add a short report-level note explaining:
   - Atlas criticality is reference priority.
   - Scan priority may reflect page-specific evidence and surfacing context if displayed separately.

### Deferred scanner / evidence-pipeline work

1. If a valid signal is missing from reports, do not synthesize it in WC01 display code.
2. If runtime evidence needs better request initiator chains, cookie read/access events, storage read events, complete redirect-chain capture, backend preference-state verification, screenshot analysis, replay status, or user-level linkage analysis, defer to WS01 or to explicit upstream retained-evidence enrichment.
3. If a report finding should be promoted or suppressed differently, update normalized concern and concern policy mapping rather than adding a display-layer promotion path.

### Required tests

Add or update tests for:

- Atlas title alignment for report cards and detailed review findings.
- Public report criticality alignment or explicit scan-priority/reference-criticality labeling.
- Public report query-string redaction.
- Removal of internal projection/support fields from public JSON.
- Family-aware confidence tooltips.
- Session replay wording safety.
- Accessibility copy avoiding WCAG conformance/non-conformance determination.
- Unmapped finding fallback.
- No broken atlas links.
- No literal `undefined`.
- Expanded JSON/evidence panels collapsed by default.

Run:

```bash
node --import tsx --test apps/web/lib/marketing/finding-atlas.test.ts
node --import tsx --test apps/web/lib/marketing/sample-finding-json.test.ts
pnpm --filter @website-signal-risk-scanner/web typecheck
git diff --check
```

Also run report-specific tests covering scan report rendering, compact evidence JSON, report surfacing presentation, sanitized network evidence, and any updated scan report components.
