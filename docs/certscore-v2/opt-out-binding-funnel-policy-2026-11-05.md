# CertScore.ai opt-out binding and funnel verification

Status: priorities 1–3 implemented locally on November 5, 2026. Priority 4
(Luna evaluation) is excluded. No deployment or production flag change.

## Control identity and supported routes

New `ax_backend_dom_binding.v2` observations may retain
`explicit_opt_out_controls.v1` metadata from the same native backend node's
existing `DOM.describeNode` result. The accessible label, reviewed locator,
native tag and document identity remain joined. No extra accessibility-tree or
DOM call is added; the existing 12-node / 50 ms binding limits remain.
Accept and Reject bindings and action lanes are unchanged. Historical v1
bindings do not acquire new locator authority when replayed.

Conditional dispatches opt into `explicit_opt_out_controls.v1`. The bounded
worker uses `onetrust.explicit_sale_share.v3-bound-controls`: reviewed OneTrust
buttons and anchors with the exact `ot-sdk-show-settings` class, with anchors
restricted to raw `href="#"` resolving on the original exact page. External
URLs, other fragments, script URLs, target/download attributes, forms and
ambiguous controls remain excluded. This is not generic link or CMP support.

Reviewed explicit entrance labels may include only the exact suffixes
“, opens the preference center dialog” or “, opens preference center dialog”.
The action worker checks the visible text and accessible name together and
retains their naming source in the document-bound entrance proof. Conflicting
names cannot authorize a click. Distinct native nodes sharing one CSS recipe
remain ambiguous. Navigation after an entrance cannot authorize submission on
a changed document. Existing GPP confirmation and follow-up requirements remain.

ReadCube, Gimbal and infillion holds remain. No external forms, new Settings
recipes, non-GPP state adapters, model calls or scoring changes are introduced.

## Audit stages and provenance

`conditional_opt_out_dispatch.v2` records the scan-bound decision, observed
control, supported route, reason, elapsed time and remaining work allowance.
The verified original manifest and canonical bundle feed the existing artifact
verification event, persisted report generation and bounded audit summary.

The daily audit separately shows control observed, supported route, effective
dispatch, submission, confirmed registration and follow-up capture. Skip reasons
and timing quantities retain their source/version. Configured enablement is
not dispatch; dispatch is not confirmation. Old or incomplete records remain
unavailable. Timing values are reread from retained sources during reconciliation,
so a fabricated zero fails verification rather than silently altering a median.
These are operational audit facts, not new findings or scoring inputs.

All existing limits remain: at least 5,000 ms left to dispatch, 3,000 ms capture,
4,500 ms artifact allowance, 5,000 ms worker limit, existing memory, absolute
coordinator deadline and publication barrier. No retry, wait or visit is added
to determine eligibility. Conditional worker cost remains within the owner's
previously approved additional-lane scope.

## Verification

Logs and receipts are under `outputs/opt-out-coverage-2026-11-05/`.

- 113 contract/audit tests and 176 coordinator regression tests passed.
- 36 browser-backed regression tests passed, including 14 new entrance scenarios:
  native button, descriptive suffix, on-page anchor, external/script/fragment
  links, target/download attributes, form ancestry/attribute, conflicting name,
  duplicates, unprevented navigation and historical anchor exclusion.
- Three verified handoff tests and two source-reconciliation tests passed.
- Web, Lambda and validation-worker TypeScript checks passed.
- Replayed 34 GPC pairs / 68 hash-verified worker sources and 221 daily exports:
  165 reportable scans, 4,125 state comparisons, zero mismatches.
- Replayed 1,842 hash-verified historical canonical bundles: all remained
  unsupported or unverified for this narrow action route. These did not include
  the recent daily cohort's original consent-worker bundles; public projections
  do not substitute for native locator proof.
- Rechecked the three retained public diagnostic consent packets. Webcrawler
  stays eligible; Evernote's historical AX binding cannot gain missing metadata;
  Taboola remains unsupported. Its consentmanager provider has no new recipe.
- Browser preview of the frozen 24-hour cohort showed the new stages and timing
  rows, with unavailable values rather than zeros for all 165 historical
  reportable scans. The two Los Angeles calendar columns are a partial-day split
  of that one retained 24-hour window, not two complete daily inventories.

Local fixtures demonstrated successful submissions and confirmation. This work
makes no claim of successful public-site opt-out or increased population coverage.
No new public visits, AWS invocations, historical rewrites, model calls or
production changes occurred in this follow-up. The next verification target is
bounded public-site success on the newly supported OneTrust controls, followed
by ranking unsupported CMP routes from the measured funnel.

## Cost

Local work enables $0 recurring spend. The added bounded metadata is estimated
below $1/month at 100,000 scans and 30-day retention; it reuses existing artifacts,
reads and audit queries. This is a storage estimate, not a measured bill. There
are no additional model calls or discovery visits. More eligible conditional
workers may use the previously approved extra-lane allowance; no worker size,
time cap or capture budget increased.

The subsequent [live verification](opt-out-live-verification-2026-11-05.md)
identified and fixed exact OneTrust banner-ID binding and native opt-out geometry
projection before release. Two post-fix sites dispatched successfully but neither
submitted; readiness inside the existing action window is the next priority.
