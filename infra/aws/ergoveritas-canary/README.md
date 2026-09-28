# ErgoVeritas test 2 privacy canary

`test2.html` is an owned, synthetic scanner fixture for GPC, Do Not Sell/Share,
privacy choices, cookie settings, and notice evidence. It keeps the existing
`certscore-review-canary.js` runtime unchanged. The checked-in copy must match
the live shared runtime before these assets are published.

On a fresh visit, the page writes six optional first-party test cookies and
loads six third-party requests covering analytics, advertising, session replay,
and product measurement. It deliberately leaves this activity unchanged when
GPC is enabled. A **complete paired comparison** can therefore report no
observable GPC response; a partial comparison remains indeterminate. The page
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
