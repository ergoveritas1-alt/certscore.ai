# Automated accessibility operations

The October 9, 2026 implementation adds a required, bounded axe-core 4.11.3 audit to the existing baseline runtime-evidence lane. This describes the implementation; it does not establish that a revision has been deployed. Historical scans without the versioned audit remain unchanged.

## Capture and completion

The worker freezes privacy network, cookie/storage, form and GPC-comparison observations before injecting the locally bundled engine into the existing page. It tests the starting page's rendered content with WCAG 2.0/2.1/2.2 A/AA tags. There is no additional lane, browser session, navigation, consent click, screenshot, CDN request or model call.

Every eligible baseline runtime run attempts the audit. Its separate ceiling is eight seconds, within the existing parent worker/Lambda safety deadlines. A terminal result is required before the existing coordinator merges and publishes once. Timeouts, cancellation, blocked pages, changing documents, unavailable frames and unevaluable rules are explicit limitations. `completed` means the configured automated audit completed; it does not mean there were zero failures or establish WCAG/ADA conformance. `limited`, `failed` and `not_testable` cannot produce a clean result. A completed scan with a limited audit is exposed as `completed_limited` through Pulse and API v2.

The retained `CanonicalEvidenceBundle.accessibilityAudit` contains engine/version, scan and runtime-lane identity, document URL/loader binding, timestamps, evaluated rule IDs, concrete violations, separate review items and limitations. Evidence is capped at 256 KiB; overflow returns limited coverage. Examples are bounded to five nodes per rule; HTML retains tag/attribute structure without text or attribute values. No accessibility score is fabricated.

## Canonical projection

Original artifact bytes must pass the existing SHA-256 verification before materialization. The audit must match the scan, independent runtime document snapshot, reportable target and capture interval. Failed binding clears rule results and retains limited coverage. Malformed or unverified required evidence blocks publication.

Verified audit -> persisted typed accessibility projection -> normalized accessibility concerns -> existing concern policy -> unified findings -> report/Pulse/API/MCP.

The typed projection is retained in the checksum-verified report projection payload. Compatibility `accessibilityRuleExamples` and counts are derived from it; the new path does not rely on writes to the legacy `scan_accessibility_rule_examples` table. Existing representative-example policies determine which rule families become findings. All retained rule violations, including rules outside those families, remain available in accessibility evidence. Review items never become observed failures. This change adds no ADA legal conclusion, separate regulatory score or scoring deduction.

## Customer and operator retrieval

### October 10 evidence binding and rule projection review

New materializations select the latest pre-consent runtime-owned document proof
for accessibility, independently of the consent lane's report URL. Exact URL,
loader token, scan identity, retained-source checksum and audit interval checks
remain required. Session-bearing URLs are not stripped or equated. Empty runtime
proof cannot borrow consent evidence; auxiliary navigation and non-reportable
runtime visits remain excluded. Failed/not-testable observations retain their
original coverage status and never expose clean or zero-failure counts.

The seven rule types found outside the existing finding taxonomy in the retained
audit cohort were reviewed as follows. All remain available as retained rule
evidence, regardless of finding eligibility:

| Rule | Canonical treatment |
| --- | --- |
| `input-image-alt` | Text alternative finding, through normalized concerns and existing policy. |
| `aria-prohibited-attr` | Semantic labeling/ARIA finding, requiring concrete representative node proof. |
| `aria-required-children` | Semantic labeling/ARIA finding with the same evidence requirement. |
| `link-in-text-block` | Visual contrast/color distinction family; rule-specific guidance preserves WCAG use-of-color semantics rather than calling it a text/background contrast failure. |
| `html-has-lang` | Existing document-metadata support-only policy; not promoted to a control-labeling or priority finding. |
| `target-size` | Evidence-only: pointer target sizing needs a separate reviewed finding family and exception handling; it is not a keyboard-navigation failure. |
| `meta-viewport` | Evidence-only: zoom/viewport restrictions need a separate reviewed finding family; they are not a contrast failure. |

This review changes no scoring weight, legal conclusion or manual-review
requirement. Historical persisted projections are not rewritten.

- Scan resources and MCP scan bundles expose `accessibilityAudit`: required status, engine/version, duration, failed rules, affected element instances (summed across rules, not unique DOM elements) and review counts. Unavailable results have null counts, never an invented zero.
- The report shows automated accessibility status and retained failing rules/elements.
- API: `GET /api/v2/scans/<scanId>/report-evidence?section=accessibility` returns retained rule evidence using the existing authorization and cursor protocol.
- MCP: `certscore_get_report_evidence_page` with `scanId` and `section: accessibility` retrieves the same evidence. Existing finding-list tools include eligible canonical accessibility findings.

To diagnose missing results, inspect the checksum-verified canonical bundle's `accessibilityAudit` and `accessibilityAudit` module timing first, then its persisted projection, normalized concerns and unified findings. An empty legacy examples table is not evidence that this new audit did not run. Historical scans are not backfilled or silently rescanned. Production inspection remains read-only through the approved AWS operational paths; new scans require explicit authorization.

## Latency and cost

The owner requested implementation after reviewing the October 8 evidence and cost proposal. Expected planning increment at 100,000 scans/month is approximately $5–$15 for runtime-worker compute if audits average one to three seconds, plus coordinator waiting and bounded evidence storage. This is an estimate, not measured Lambda usage or a cap. The [AWS Frankfurt public price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/eu-central-1/index.json), checked October 9, lists first-tier x86 duration at $0.0000166667/GB-second. Production scanner Lambdas use x86_64 with 3008 MiB (2.9375 GiB). At the eight-second ceiling, runtime-worker compute alone would be approximately $39/100,000 scans; coordinator and storage costs are additional. The owner explicitly approved this corrected estimate on October 9, 2026. No paid accessibility service or model usage is added. A spare-time-only alternative was rejected because it could skip the audit.

Historical modeling across 42 recent completed exports estimated that a fixed one/two/three/five/eight-second audit would extend the passive barrier on 7/7/8/12/18 scans respectively. Those are conditional projections, not measured production audit timings. Local fixtures verify engine behavior; deployment should retain the existing lane timing telemetry and measure a fresh cohort before making a customer latency guarantee. Existing parent deadlines remain unchanged, so pathological pages can return explicitly limited coverage.
