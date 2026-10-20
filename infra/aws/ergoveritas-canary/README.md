# ErgoVeritas privacy and accessibility canaries

## Test 1 PDF showcase

`test1.html` retains the original first-layer controls, six cookie signatures,
six initial tracker requests, canvas/audio fingerprinting and intentionally
ineffective Reject behavior. Its linked `test1-privacy-policy.html` describes
that behavior, rather than claiming effective consent enforcement. The existing
owned/synthetic disclosure stays in place. No report evidence or scoring rules
are overridden.

The policy provides nine independently testable transparency topics: controller
contact, purposes, legal basis, recipients, retention, rights, transfers,
supervisory-authority complaints and automated decision-making. A reserved
example contact is explicitly non-deliverable; no DPO appointment is claimed.
Observed disclosure text is not verification of legal adequacy or real rights
fulfilment. Local canonical concern-policy/checklist tests assert all nine rows;
publication still needs a fresh scan to establish the actual report result.

The page also has three deliberate, rendered WCAG defects (`image-alt`, `label`
and `button-name`), plus a five-field enquiry form requesting name, email,
telephone, postal code and message. Fields are empty and for invented data only.
The preview does not read or serialize values. A submit guard and independent
`form-action 'none'` CSP prevent submission, including direct native submission
with JavaScript disabled. The existing analytics runtime must not receive form
values. No CRM, email, authentication or payment integration is added.

One off-screen outbound link targets reserved `promotion.example`. It is not
automatically followed. The existing integrity capture must retain its domain,
concealment method and code proof; the fixture does not assert compromise.

Validation:

```bash
pnpm --filter @certscore/scan-core exec tsx --tsconfig ../../tsconfig.base.json --test src/ergoveritas-test1-canary.test.ts
pnpm exec tsx --tsconfig tsconfig.base.json --test apps/web/lib/scans/ergoveritas-test1-transparency.test.ts
bash scripts/deploy-ergoveritas-test1-canary.sh
```

The last command is a dry run. After owner authorization, use an isolated clean,
committed checkout and `--apply`. The helper verifies the existing AWS account,
S3 region/versioning, CloudFront origin and unchanged shared runtime, uploads
only the policy and starting page, invalidates only those paths and verifies
both public hosts byte-for-byte. It prints the previous starting-page S3 version
for rollback. It does not deploy CertScore.ai or any scanner.

Estimated incremental static serving/storage at current canary traffic is below
$0.10/month; no service, scheduled scan, browser lane or model call is added.
One-time publication/verification is estimated below $0.05. A requested fresh
scan uses the existing canonical pipeline and ordinary bounded review budget.

## Test 2 privacy choices

`test2.html` is an owned, synthetic scanner fixture for GPC, Do Not Sell/Share,
privacy choices, cookie settings, and notice evidence. It keeps the existing
`certscore-review-canary.js` runtime unchanged. The checked-in copy must match
the live shared runtime before these assets are published.

On a fresh visit, the page writes six optional first-party test cookies and
loads six third-party requests covering analytics, advertising, session replay,
and product measurement. With GPC enabled, it suppresses the Meta advertising
request and its `_fbc` test cookie while the other five optional requests
remain. A **complete paired comparison** can therefore report a partial
reduction; an incomplete comparison remains indeterminate. The page
stops any stalled provider fetch after 120 milliseconds, preserving the existing
passive quiet-window budget while retaining the request attempts for inspection.
It leaves page navigation alone so an early privacy-choice click remains usable.
The page also retains a first-layer Accept/Reject/Options test banner. Its Reject behavior
is intentionally ignored by the shared runtime, independently of the manual
privacy-choice paths.

The starting page links directly to three named choices. Each destination lets
the visitor save a test-only opt-out that suppresses subsequent optional test
activity in that browser. The visible link alone does not verify that behavior
in an ordinary passive scan. The starting page also links to a substantive
test Privacy Policy, Cookie Policy, and Notice at Collection. The CCPA/CPRA
workpaper should retain the three visible choice links when the consent-proof
rendered-link evidence merges with the policy lane, plus the fetched, owned
Privacy Policy and its topic passages. The separate Notice at Collection and
Cookie Policy are useful linked context, but the current workpaper counts only
documents assigned the `policy_document` role as retained notices.

Run `pnpm --filter @certscore/scan-core exec tsx --test
src/ergoveritas-test2-canary.test.ts` from the repository root to verify the
browser behavior against a local server. `scripts/deploy-ergoveritas-test2-canary.sh`
prints a dry-run description by default. Publishing requires its explicit
`--apply` flag and the expected AWS account, bucket, distribution, and shared
runtime checksum. A production scan after publication is still required to
verify the report's actual GPC comparison and CCPA/CPRA workpaper.

## Intentional WCAG failures

The starting page also contains twelve independently detectable WCAG rule
failures under `data-certscore-accessibility-fixture="wcag-starting-page.v1"`.
They are rendered DOM examples, not synthetic scanner findings. The same
bundled axe-core audit used by production verifies their rule IDs and selectors
in the local browser test above. Existing privacy/GPC/choice assertions remain
part of that test. Images use inline data URLs, and fields are outside forms;
the fixtures add no asset requests or submission endpoint.

| axe rule | Intentional defect |
| --- | --- |
| `image-alt` | Image lacks alternative text |
| `input-image-alt` | Image input lacks alternative text |
| `label` | Text field lacks a programmatic label |
| `select-name` | Select lacks a programmatic label |
| `button-name` | Icon button lacks an accessible name |
| `link-name` | Icon link lacks an accessible name |
| `color-contrast` | Pale text on white fails contrast |
| `aria-valid-attr-value` | Checkbox has an invalid checked state |
| `aria-required-attr` | Checkbox omits its required checked state |
| `aria-allowed-attr` | Button role has an unsupported checked state |
| `nested-interactive` | A button contains another focusable button role |
| `target-size` | Closely spaced buttons are only 12 by 12 pixels |

Retained accessibility evidence should include these observed violations.
Only rule families supported by the existing canonical concern policy become
unified findings; the fixture does not change that policy or scoring. Automated
issues on this deliberately failing page are test signals, not an ADA legal
conclusion.

The five pages under `sentinels/` contain six required failing rule types each. Their
required rules/selectors are declared in `manifest.json` and verified by
`src/sentinel-accessibility-canary.test.ts`. The existing 20-minute rotating
monitor checks their typed retained WCAG evidence and alerts on a detection
failure; see `../sentinel-monitor/README.md`. Publish only these six assets with
`scripts/deploy-ergoveritas-canary-bundle.sh --sentinels-only --apply`, and publish
only `test2.html` with `scripts/deploy-ergoveritas-test2-canary.sh --page-only --apply`.

Fixture contract v2 adds shared and distinct image-only links to verify retained
DOM identity. Monitor check v3 also verifies the canonical 12-point accessibility
deduction and its category caps. Publish the static bundle and matching monitor
between scheduled slots; the old monitor does not accept the new manifest.
These additions are local pending release. See
`docs/certscore-v2/finding-calibration-gate.md` for rollout and calibration limits.
Incremental fixture/check growth is estimated below $0.10/month and adds no API
read, scan, browser lane, or model call.

Estimated incremental serving, audit compute, evidence and monitor-read cost is
below $0.50/month at up to 15,000 total canary scans and 2,160 scheduled monitor
runs/month. The one-time static publication and
checksum verification are estimated below $0.05. No service, recurring scan,
browser lane or model call is added.
